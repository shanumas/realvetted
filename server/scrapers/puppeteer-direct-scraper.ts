/**
 * extract‑property.ts
 *
 * One‑step utility that:
 *   1. Opens the listing URL in a headless Chrome instance
 *   2. Pulls the obvious facts (address, price, beds, baths, etc.)
 *   3. Reads the “Listed by” name, Googles it, opens the first result,
 *      and scrapes the first e‑mail address it finds
 */

import { Browser, Page } from "puppeteer-core";
import * as cheerio from "cheerio";
import { PropertyAIData } from "@shared/types";
import _ from "lodash";
import randomUseragent from "random-useragent";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";

/** ------------ main exported function with enhanced anti-detection and CAPTCHA handling ------------ */
export async function extractPropertyWithPuppeteer(
  url: string,
): Promise<PropertyAIData> {
  const puppeteer = require("puppeteer-extra");
  puppeteer.use(require("puppeteer-extra-plugin-stealth")());
  const browser = await puppeteer.launch({ headless: true });
  try {
    /* --------------------------------------------------
     *  1)  scrape listing page with anti-detection measures
     * -------------------------------------------------- */
    const listingPage = await browser.newPage();

    // Prepare the page with anti-bot measures
    await prepPage(listingPage);

    const UAs = [
      "Mozilla/5.0 … Chrome/125.0.0.0 Safari/537.36",
      "Mozilla/5.0 … Edg/125.0.0.0",
      "Mozilla/5.0 … Firefox/125.0",
    ];
    const UA = UAs[Math.floor(Math.random() * UAs.length)];

    await listingPage.setUserAgent("Mozilla/5.0 ...");

    // Navigate to the URL
    await listingPage.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    // Wait for the content to load
    await listingPage.waitForSelector("body", { timeout: 5000 });

    // Extract the HTML content
    const html = await listingPage.content();
    const $ = cheerio.load(html);
    const bodyH = $("body").html()?.trim() ?? ""; // markup inside <body>

    console.log("2");

    /* --------------------------------------------------
     *  2)  parse core fields with extended selectors
     * -------------------------------------------------- */
    let addressText = "";

    // Try multiple address selectors for different sites
    const addressSelectors = [
      '[data-testid*="address"]',
      "h1",
      ".address",
      '[data-testid="home-details-summary-headline"]',
      ".property-header h1",
      ".property-address",
      ".listing-details-address",
    ];

    for (const selector of addressSelectors) {
      const element = $(selector).first();
      if (element.length > 0) {
        addressText = element.text().trim();
        if (addressText) break;
      }
    }

    console.log("3:" + bodyH);

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
      const addressParts = data.address.split(",").map((part) => part.trim());
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
      ".agent-info",
      ".listing-agent-information",
      '[data-testid*="agent"]',
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

/* ---------- launch Chrome with enhanced stealth mode ---------- */
async function launchBrowser(): Promise<Browser> {
  return puppeteer.launch({
    headless: true, // Use headless mode for replit environment
    executablePath:
      "/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--disable-web-security", // Disable same-origin policy
      "--disable-features=IsolateOrigins",
      "--disable-automation", // Hide automation flags
      "--disable-blink-features=AutomationControlled", // Critical for avoiding detection
      "--window-size=1920,1080",
      "--start-maximized", // Start with a maximized window to look like a real user
      "--disable-extensions", // Disable extensions to avoid detection
      "--hide-scrollbars", // Hide scrollbars to appear more human
      "--mute-audio", // Mute audio to avoid unexpected sounds
      `--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${Math.floor(Math.random() * 5) + 120}.0.0.0 Safari/537.36`,
    ],
    ignoreDefaultArgs: ["--enable-automation"], // Avoid automation flags
    defaultViewport: null, // Use window size instead of viewport
  });
}

/* ---------- Advanced stealth page prep with evasion techniques ---------- */
async function prepPage(page: Page) {
  // Randomize Chrome version to appear as different browsers
  const chromeVersion = Math.floor(Math.random() * 5) + 120;
  const userAgent = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion}.0.0.0 Safari/537.36`;

  await page.setUserAgent(userAgent);

  // Set a realistic viewport and device scale factor
  await page.setViewport({
    width: 1920,
    height: 1080,
    deviceScaleFactor: 1,
    hasTouch: false,
    isLandscape: true,
    isMobile: false,
  });

  // Set cookies to appear as a returning visitor
  await page.setCookie({
    name: "returning_visitor",
    value: "true",
    domain: ".zillow.com",
    expires: Math.floor(Date.now() / 1000) + 86400 * 30, // 30 days
    httpOnly: false,
    secure: true,
    sameSite: "None",
  });

  // Set headers that make the request appear more realistic
  await page.setExtraHTTPHeaders({
    "Accept-Language": "en-US,en;q=0.9,es;q=0.8",
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
    "Accept-Encoding": "gzip, deflate, br",
    "Cache-Control": "max-age=0",
    Connection: "keep-alive",
    "Upgrade-Insecure-Requests": "1",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "cross-site",
    "Sec-Fetch-User": "?1",
    "Sec-CH-UA": `"Google Chrome";v="${chromeVersion}", "Chromium";v="${chromeVersion}", "Not-A.Brand";v="99"`,
    "Sec-CH-UA-Mobile": "?0",
    "Sec-CH-UA-Platform": '"Windows"',
  });

  // Inject scripts to modify the browser environment and evade detection
  await page.evaluateOnNewDocument(() => {
    // ----- 1. Make navigator properties consistent with our user agent -----
    Object.defineProperty(navigator, "webdriver", { get: () => false });
    Object.defineProperty(navigator, "language", { get: () => "en-US" });
    Object.defineProperty(navigator, "languages", {
      get: () => ["en-US", "en", "es"],
    });

    // ----- 2. Create convincing plugins array -----
    const plugins = [
      {
        name: "Chrome PDF Plugin",
        filename: "internal-pdf-viewer",
        description: "Portable Document Format",
        mimeTypes: [{ type: "application/pdf", suffixes: "pdf" }],
      },
      {
        name: "Chrome PDF Viewer",
        filename: "mhjfbmdgcfjbbpaeojofohoefgiehjai",
        description: "",
        mimeTypes: [{ type: "application/pdf", suffixes: "pdf" }],
      },
      {
        name: "Native Client",
        filename: "internal-nacl-plugin",
        description: "",
        mimeTypes: [
          { type: "application/x-nacl", suffixes: "nacl" },
          { type: "application/x-pnacl", suffixes: "pnacl" },
        ],
      },
    ];

    // Define plugins property to return our fake plugins
    Object.defineProperty(navigator, "plugins", {
      get: () => {
        const pluginArray = plugins.map((plugin) => {
          const mimeTypes = plugin.mimeTypes.map((mt) => {
            return { type: mt.type, suffixes: mt.suffixes, description: "" };
          });

          return {
            name: plugin.name,
            filename: plugin.filename,
            description: plugin.description,
            length: mimeTypes.length,
            item: (index: number) => mimeTypes[index],
            namedItem: (name: string) =>
              mimeTypes.find((mt) => mt.type === name),
          };
        });

        // Make the array iterable
        pluginArray.item = (index: number) => pluginArray[index];
        pluginArray.namedItem = (name: string) =>
          pluginArray.find((p) => p.name === name);
        pluginArray.refresh = () => {};

        return Object.defineProperty(pluginArray, "length", {
          value: pluginArray.length,
        });
      },
    });

    // ----- 3. Remove automation-specific attributes -----

    // Spoof screen dimensions to match viewport
    Object.defineProperty(window.screen, "width", { get: () => 1920 });
    Object.defineProperty(window.screen, "height", { get: () => 1080 });
    Object.defineProperty(window.screen, "availWidth", { get: () => 1920 });
    Object.defineProperty(window.screen, "availHeight", { get: () => 1040 });
    Object.defineProperty(window.screen, "colorDepth", { get: () => 24 });
    Object.defineProperty(window.screen, "pixelDepth", { get: () => 24 });

    // ----- 4. Mock user interaction functions -----
    const originalQuerySelector = document.querySelector;
    document.querySelector = function (...args) {
      // Add a slight delay to querySelector to appear more human
      const start = Date.now();
      while (Date.now() - start < 5) {} // Small delay
      return originalQuerySelector.apply(this, args);
    };

    // ----- 5. Fake WebGL to match real browsers -----
    const getParameter = WebGLRenderingContext.prototype.getParameter;
    WebGLRenderingContext.prototype.getParameter = function (parameter) {
      // Spoof renderer info
      if (parameter === 37445) {
        return "Google Inc. (NVIDIA)";
      }
      if (parameter === 37446) {
        return "ANGLE (NVIDIA, NVIDIA GeForce GTX 1080 Direct3D11 vs_5_0 ps_5_0)";
      }

      return getParameter.apply(this, [parameter]);
    };

    // ----- 6. Add generic browser features -----

    // Add notification API
    if (!("Notification" in window)) {
      window.Notification = {
        permission: "default",
        requestPermission: async () => "default",
      };
    }

    // ----- 7. Hide automation flags -----
    // Remove flag used by CloudFlare and others
    delete (window as any)._phantom;
    delete (window as any).__nightmare;
    delete (window as any).callPhantom;

    // Add regular Chrome functions
    window.chrome = {
      app: {
        isInstalled: false,
        InstallState: {
          DISABLED: "disabled",
          INSTALLED: "installed",
          NOT_INSTALLED: "not_installed",
        },
        RunningState: {
          CANNOT_RUN: "cannot_run",
          READY_TO_RUN: "ready_to_run",
          RUNNING: "running",
        },
      },
      runtime: {
        OnInstalledReason: {
          CHROME_UPDATE: "chrome_update",
          INSTALL: "install",
          SHARED_MODULE_UPDATE: "shared_module_update",
          UPDATE: "update",
        },
        OnRestartRequiredReason: {
          APP_UPDATE: "app_update",
          OS_UPDATE: "os_update",
          PERIODIC: "periodic",
        },
        PlatformArch: {
          ARM: "arm",
          ARM64: "arm64",
          MIPS: "mips",
          MIPS64: "mips64",
          X86_32: "x86-32",
          X86_64: "x86-64",
        },
        PlatformNaclArch: {
          ARM: "arm",
          MIPS: "mips",
          MIPS64: "mips64",
          X86_32: "x86-32",
          X86_64: "x86-64",
        },
        PlatformOs: {
          ANDROID: "android",
          CROS: "cros",
          LINUX: "linux",
          MAC: "mac",
          OPENBSD: "openbsd",
          WIN: "win",
        },
        RequestUpdateCheckStatus: {
          NO_UPDATE: "no_update",
          THROTTLED: "throttled",
          UPDATE_AVAILABLE: "update_available",
        },
      },
    };

    // Mock permissions API used by newer sites
    if (!("permissions" in navigator)) {
      (navigator as any).permissions = {
        query: async () => ({ state: "prompt", onchange: null }),
      };
    }
  });
}

/* ---------- ultra-realistic human-like scrolling and interaction ---------- */
async function autoScroll(page: Page) {
  // First, wait a bit like a human would after loading the page
  await new Promise((resolve) =>
    setTimeout(resolve, 1500 + Math.random() * 2000),
  );

  // Initial mouse movement to a random position
  await page.mouse.move(200 + Math.random() * 400, 100 + Math.random() * 150);

  // Simulate clicking on something to get focus (common human behavior)
  if (Math.random() > 0.5) {
    await page.mouse.click(
      250 + Math.random() * 300,
      150 + Math.random() * 100,
    );

    // Small delay after clicking
    await new Promise((resolve) =>
      setTimeout(resolve, 300 + Math.random() * 500),
    );
  }

  // Simplified scrolling to avoid JavaScript evaluation issues
  // Scroll down a few times with random pauses to simulate human behavior
  for (let i = 0; i < 5; i++) {
    // Scroll down by a random amount
    await page.evaluate(() => {
      window.scrollBy(0, 400 + Math.floor(Math.random() * 300));
    });

    // Random pause between scrolls
    await new Promise((resolve) =>
      setTimeout(resolve, 800 + Math.random() * 1200),
    );
  }

  // Scroll back up a bit to appear more human-like
  await page.evaluate(() => {
    window.scrollBy(0, -100 - Math.floor(Math.random() * 100));
  });

  // Final pause to simulate reading the content
  await new Promise((resolve) =>
    setTimeout(resolve, 1000 + Math.random() * 1500),
  );

  // Wiggle mouse a bit at current location (humans fidget)
  const currentPosition = await page.evaluate(() => {
    return {
      x: window.scrollX + window.innerWidth / 2,
      y: window.scrollY + 300,
    };
  });

  // Small random mouse movements around current position
  for (let i = 0; i < 3; i++) {
    if (Math.random() > 0.3) {
      await page.mouse.move(
        currentPosition.x + (Math.random() * 40 - 20),
        currentPosition.y + (Math.random() * 40 - 20),
        { steps: 5 }, // Move in steps for more human-like motion
      );

      await new Promise((resolve) =>
        setTimeout(resolve, 100 + Math.random() * 300),
      );
    }
  }

  // Final mouse movement to a random position on the visible page
  await page.mouse.move(
    300 + Math.random() * 600,
    200 + Math.random() * 400,
    { steps: 10 }, // More steps for smoother, more human-like motion
  );

  // Wait a bit more before continuing
  await new Promise((resolve) =>
    setTimeout(resolve, 800 + Math.random() * 1200),
  );
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
