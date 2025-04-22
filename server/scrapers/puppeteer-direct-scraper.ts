/**
 * extract‑property.ts
 *
 * One‑step utility that:
 *   1. Opens the listing URL in a headless Chrome instance
 *   2. Pulls the obvious facts (address, price, beds, baths, etc.)
 *   3. Reads the “Listed by” name, Googles it, opens the first result,
 *      and scrapes the first e‑mail address it finds
 */

import puppeteer, { Browser, Page } from "puppeteer-core";
import * as cheerio from "cheerio";
import { PropertyAIData } from "@shared/types";

/** ------------ main exported function with enhanced anti-detection and CAPTCHA handling ------------ */
export async function extractPropertyWithPuppeteer(
  url: string,
): Promise<PropertyAIData> {
  const browser = await launchBrowser();
  try {
    /* --------------------------------------------------
     *  1)  scrape listing page with anti-detection measures
     * -------------------------------------------------- */
    const listingPage = await browser.newPage();
    
    // Prepare the page with anti-bot measures
    await prepPage(listingPage);
    
    // Rotate user agents
    const userAgents = [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36 Edg/123.0.0.0",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15"
    ];
    
    await listingPage.setUserAgent(userAgents[Math.floor(Math.random() * userAgents.length)]);
    
    // Add a random delay before navigation to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000));
    
    // Navigate with more options for real browser behavior
    await listingPage.goto(url, {
      waitUntil: "networkidle2", // More comprehensive page load waiting
      timeout: 40_000, // Longer timeout for slower connections
    });
    
    // Check for CAPTCHA/security challenges
    const isCaptchaPresent = await listingPage.evaluate(() => {
      const html = document.body.innerHTML.toLowerCase();
      return (
        html.includes('captcha') || 
        html.includes('security check') || 
        html.includes('verify you are a human') ||
        html.includes('px-captcha') ||
        html.includes('robot check') ||
        document.querySelector('iframe[src*="captcha"]') !== null
      );
    });
    
    if (isCaptchaPresent) {
      console.log("CAPTCHA detected - attempting to work around it...");
      
      // Try to bypass by performing more human-like interactions
      // Random mouse movements
      for (let i = 0; i < 5; i++) {
        await listingPage.mouse.move(
          100 + Math.random() * 700,
          100 + Math.random() * 500
        );
        await new Promise(resolve => setTimeout(resolve, 300 + Math.random() * 700));
      }
      
      // Try waiting longer to see if challenge resolves automatically
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      // Refresh the page after some delay
      await listingPage.reload({ waitUntil: "networkidle2" });
      
      // Check if still on CAPTCHA after attempts
      const stillCaptcha = await listingPage.evaluate(() => {
        return document.body.innerHTML.toLowerCase().includes('captcha');
      });
      
      if (stillCaptcha) {
        console.log("Unable to bypass CAPTCHA, falling back to URL analysis");
        throw new Error("CAPTCHA blocking access");
      }
    }
    
    // Scroll like a human would
    await autoScroll(listingPage);

    // Get the final HTML content
    const html = await listingPage.content();
    const $ = cheerio.load(html);

    /* --------------------------------------------------
     *  2)  parse core fields with extended selectors
     * -------------------------------------------------- */
    let addressText = '';
    
    // Try multiple address selectors for different sites
    const addressSelectors = [
      '[data-testid*="address"]', 
      'h1',
      '.address',
      '[data-testid="home-details-summary-headline"]',
      '.property-header h1',
      '.property-address',
      '.listing-details-address'
    ];
    
    for (const selector of addressSelectors) {
      const element = $(selector).first();
      if (element.length > 0) {
        addressText = element.text().trim();
        if (addressText) break;
      }
    }

    const data: PropertyAIData = {
      address: addressText || "Address unavailable",
      city: "",
      state: "",
      zip: "",
      price: extractNumber(html, /\$[\d,]+\b/),
      bedrooms: extractNumber(html, /(\d+)\s*bed/i, true),
      bathrooms: extractNumber(html, /(\d+(\.\d+)?)\s*bath/i, true),
      squareFeet: extractNumber(html, /(\d[,.\d]*)\s*sq\s*ft/i),
      propertyType: guessType(html),
      yearBuilt: extractNumber(html, /built\s*in\s*(\d{4})/i, true),
      description: $('meta[name="description"]').attr("content") || "",
      features: grabFeatures($),
      imageUrls: grabImages($),
      propertyUrl: url,
      /* placeholders below */
      listingAgentName: "",
      listingAgentPhone: "",
      listingAgentEmail: "",
      listingAgentCompany: "",
      listingAgentLicenseNo: "",
      sellerName: "",
      sellerPhone: "",
      sellerCompany: "",
      sellerLicenseNo: "",
      sellerEmail: "",
      listedby: "",
    };
    
    // Parse address for city, state, zip if not found individually
    if (data.address !== "Address unavailable") {
      const addressParts = data.address.split(',').map(part => part.trim());
      if (addressParts.length >= 3) {
        // Typical format: "123 Main St, City, State ZIP"
        const lastPart = addressParts[addressParts.length - 1];
        const stateZipMatch = lastPart.match(/([A-Z]{2})\s+(\d{5})/);
        
        if (stateZipMatch) {
          data.state = stateZipMatch[1];
          data.zip = stateZipMatch[2];
        }
        
        // City is typically the second to last part
        if (addressParts.length >= 2) {
          data.city = addressParts[addressParts.length - 2];
        }
      }
    }

    /* --------------------------------------------------
     *  3)  pull agent name & phone using multiple selectors
     * -------------------------------------------------- */
    const agentSelectors = [
      '[class*="listing-agent"]', 
      '[data-testid*="ListingAgent"]', 
      ':contains("Listed by")',
      '.agent-info',
      '.listing-agent-information',
      '[data-testid*="agent"]'
    ];
    
    let agentBlock = "";
    for (const selector of agentSelectors) {
      const element = $(selector).first();
      if (element.length > 0) {
        agentBlock = element.text();
        if (agentBlock) break;
      }
    }

    const agentNameMatch = agentBlock.match(
      /listed by[:\s]*([A-Z][A-Za-z.\s']+)/i,
    );
    if (agentNameMatch) {
      data.listingAgentName = agentNameMatch[1].trim();
      data.listedby = `Listed by: ${data.listingAgentName}`;
    }

    const phoneMatch = agentBlock.match(/(\d{3}[-.\s]?\d{3}[-.\s]?\d{4})/);
    if (phoneMatch) data.listingAgentPhone = phoneMatch[1];

    /* --------------------------------------------------
     *  4)  look up agent e‑mail (Google → first site)
     * -------------------------------------------------- */
    if (data.listingAgentName) {
      data.listingAgentEmail = await findAgentEmail(
        browser,
        data.listingAgentName,
      );
    }

    return data;
  } catch (err) {
    console.error("❌ extractPropertyWithPuppeteer failed:", err);
    return { ...EMPTY_PROPERTY, propertyUrl: url };
  } finally {
    await browser.close();
  }
}

/* ==================================================
 *             ── helpers below ──
 * ================================================== */

const EMPTY_PROPERTY: PropertyAIData = {
  address: "Address unavailable",
  city: "",
  state: "",
  zip: "",
  propertyType: "",
  bedrooms: "",
  bathrooms: "",
  squareFeet: "",
  price: "",
  yearBuilt: "",
  description: "",
  features: [],
  listingAgentName: "",
  listingAgentPhone: "",
  listingAgentEmail: "",
  listingAgentCompany: "",
  listingAgentLicenseNo: "",
  propertyUrl: "",
  imageUrls: [],
  sellerName: "",
  sellerPhone: "",
  sellerCompany: "",
  sellerLicenseNo: "",
  sellerEmail: "",
  listedby: "",
};

/* ---------- launch Chrome with minimal flags ---------- */
async function launchBrowser(): Promise<Browser> {
  return puppeteer.launch({
    headless: true,
    executablePath: "/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--disable-features=IsolateOrigins,site-per-process", // Disable site isolation
      "--disable-web-security", // Disable same-origin policy
      "--disable-features=site-per-process",
      "--disable-extensions",
      "--window-size=1920,1080",
    ],
  });
}

/* ---------- standard page preparations with enhanced anti-bot bypassing ---------- */
async function prepPage(page: Page) {
  // Set a more realistic user agent with consistent browser version
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  );
  
  // Set a higher resolution viewport that looks like a real monitor
  await page.setViewport({ width: 1920, height: 1080 });
  
  // Set more realistic headers
  await page.setExtraHTTPHeaders({
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Sec-CH-UA': '"Google Chrome";v="124", "Chromium";v="124", "Not-A.Brand";v="99"',
    'Sec-CH-UA-Mobile': '?0',
    'Sec-CH-UA-Platform': '"Windows"'
  });
  
  // Emulate more browser-like features and behavior
  await page.evaluateOnNewDocument(() => {
    // Add fake web driver properties to prevent detection
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    Object.defineProperty(navigator, 'language', { get: () => 'en-US' });
    Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
    
    // Override the plugins property
    Object.defineProperty(navigator, 'plugins', {
      get: () => {
        return [1, 2, 3, 4, 5].map(() => ({
          name: `Default Plugin ${Math.floor(Math.random() * 10)}`,
          filename: `default_plugin_${Math.floor(Math.random() * 100)}.dll`,
          description: 'This is a default plugin',
          version: `${Math.floor(Math.random() * 10)}.${Math.floor(Math.random() * 10)}`
        }));
      }
    });
    
    // Add a fake notification API
    Object.defineProperty(window, 'Notification', {
      get: () => ({
        permission: 'default',
        requestPermission: async () => 'default'
      })
    });
  });
}

/* ---------- human-like scrolling and interaction ---------- */
async function autoScroll(page: Page) {
  // First, wait a bit like a human would after loading the page
  await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 1500));
  
  // Move mouse randomly to simulate human behavior
  await page.mouse.move(
    100 + Math.random() * 600, 
    100 + Math.random() * 200
  );
  
  // Perform natural, randomized scrolling
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      let totalHeight = 0;
      const distance = 100 + Math.floor(Math.random() * 300); // Variable scroll distance
      
      const scrollDown = () => {
        window.scrollBy(0, distance);
        totalHeight += distance;
        
        // Add some randomness to scrolling behavior
        const maxHeight = document.body.scrollHeight - window.innerHeight;
        
        if (totalHeight >= maxHeight) {
          // Reached bottom, resolve after a small delay
          setTimeout(resolve, 500 + Math.random() * 1000);
          return;
        }
        
        // Random pauses between scrolls to mimic human behavior
        setTimeout(scrollDown, 100 + Math.random() * 400);
      };
      
      scrollDown();
    });
  });
  
  // Random mouse movements after scrolling
  await page.mouse.move(
    300 + Math.random() * 400, 
    300 + Math.random() * 400
  );
  
  // Wait a bit more before continuing
  await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 1000));
}

/* ---------- quick regex helpers ---------- */
function extractNumber(html: string, re: RegExp, plain = false): string {
  const m = html.match(re);
  if (!m) return "";
  return plain ? (m[1] ?? "") : (m[0] ?? "").replace(/[^\d.]/g, "");
}

function guessType(html: string): string {
  const types = [
    "Single Family",
    "Condo",
    "Townhouse",
    "Multi‑Family",
    "Apartment",
    "Mobile",
    "Land",
  ];
  return types.find((t) => html.includes(t)) || "";
}

/* ---------- gather bullet‑list features if present ---------- */
function grabFeatures($: cheerio.CheerioAPI): string[] {
  const list: string[] = [];
  $("ul li").each((_, el) => {
    const txt = $(el).text().trim();
    if (txt && list.length < 50) list.push(txt);
  });
  return Array.from(new Set(list));
}

/* ---------- small helper to collect primary images ---------- */
function grabImages($: cheerio.CheerioAPI): string[] {
  const imgs: string[] = [];
  $('img[src*="https://"], img[data-src*="https://"]').each((_, el) => {
    const src = $(el).attr("src") || $(el).attr("data-src") || "";
    if (src && imgs.length < 10) imgs.push(src);
  });
  return imgs;
}

/* ---------- Google → first result → first email ---------- */
async function findAgentEmail(browser: Browser, name: string): Promise<string> {
  const page = await browser.newPage();
  try {
    await prepPage(page);
    const query = encodeURIComponent(`${name} realtor email`);
    await page.goto(`https://www.google.com/search?q=${query}`, {
      waitUntil: "domcontentloaded",
    });

    const firstHref = await page.$eval(
      "div.yuRUbf > a",
      (a) => (a as HTMLAnchorElement).href,
    );
    await page.goto(firstHref, {
      waitUntil: "domcontentloaded",
      timeout: 20_000,
    });

    const html = await page.content();
    const emailMatch = html.match(/[\w.+-]+@[\w.-]+\.\w{2,}/);
    return emailMatch ? emailMatch[0] : "";
  } catch {
    return "";
  } finally {
    await page.close();
  }
}
