import puppeteer from "puppeteer";
import * as cheerio from "cheerio";
import { PropertyAIData } from "@shared/types";

/**
 * Extract property data directly from the listing URL using Puppeteer
 * with enhanced anti-detection measures
 *
 * @param url The URL of the property listing
 * @returns Structured property data
 */
export async function extractPropertyWithPuppeteer(url: string): Promise<PropertyAIData> {
  console.log(`Direct scraping with enhanced anti-detection for URL: ${url}`);

  let browser;
  try {
    // Get the correct Chromium path
    const chromiumPath = '/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium';
    
    // Launch a headless browser with additional stealth settings
    browser = await puppeteer.launch({
      headless: "new",
      executablePath: chromiumPath,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-accelerated-2d-canvas",
        "--disable-gpu",
        "--disable-features=IsolateOrigins,site-per-process",
        "--blink-settings=imagesEnabled=true",
        "--window-size=1920,1080",
      ],
    });

    // Open a new page
    const page = await browser.newPage();

    // Set a realistic viewport
    await page.setViewport({
      width: 1920,
      height: 1080,
      deviceScaleFactor: 1,
    });

    // Set user agent to a recent and common one
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
    );

    // Add additional headers to appear more like a real browser
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'Cache-Control': 'max-age=0'
    });

    // Emulate a real browser more closely
    await page.evaluateOnNewDocument(() => {
      // Overwrite the 'webdriver' property to avoid detection
      Object.defineProperty(navigator, 'webdriver', {
        get: () => false,
      });

      // Add a fake plugins array
      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5],
      });

      // Add a fake languages array
      Object.defineProperty(navigator, 'languages', {
        get: () => ['en-US', 'en'],
      });
    });

    // Navigate to the URL with a pageload timeout
    await page.goto(url, { 
      waitUntil: "domcontentloaded",
      timeout: 20000 
    });

    // Wait a bit like a human would (shorter time)
    await page.waitForTimeout(1000);

    // Skip scrolling for now to avoid timeouts
    // await autoScroll(page);

    // Extract the HTML content
    const htmlContent = await page.content();

    // Close the browser
    await browser.close();

    // Use regular expressions to extract key property details directly from the HTML
    const propertyData = extractPropertyDataFromHtml(htmlContent, url);

    return propertyData;
  } catch (error) {
    console.error("Enhanced Puppeteer scraping failed:", error);
    if (browser) {
      await browser.close();
    }

    // Return a minimal property object with the URL
    return {
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
      description: "Property information could not be extracted",
      features: [],
      listingAgentName: "",
      listingAgentPhone: "",
      listingAgentEmail: "",
      listingAgentCompany: "",
      listingAgentLicenseNo: "",
      propertyUrl: url,
      imageUrls: [],
      sellerName: "",
      sellerPhone: "",
      sellerCompany: "",
      sellerLicenseNo: "",
      sellerEmail: "",
      listedby: ""
    };
  }
}

/**
 * Helper function to scroll down the page to load lazy-loaded content
 */
async function autoScroll(page: any) {
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      let totalHeight = 0;
      const distance = 100;
      const timer = setInterval(() => {
        const scrollHeight = document.body.scrollHeight;
        window.scrollBy(0, distance);
        totalHeight += distance;

        if (totalHeight >= scrollHeight || totalHeight > 10000) {
          clearInterval(timer);
          resolve();
        }
      }, 100);
    });
  });
}

/**
 * Extract property data using regular expressions
 * This approach is more resilient to anti-scraping measures
 */
function extractPropertyDataFromHtml(html: string, url: string): PropertyAIData {
  console.log("Extracting data using regex patterns...");

  // Initialize property data
  const data: PropertyAIData = {
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
    description: "No description available",
    features: [],
    listingAgentName: "",
    listingAgentPhone: "",
    listingAgentEmail: "",
    listingAgentCompany: "",
    listingAgentLicenseNo: "",
    propertyUrl: url,
    imageUrls: [],
    sellerName: "",
    sellerPhone: "",
    sellerCompany: "",
    sellerLicenseNo: "",
    sellerEmail: "",
    listedby: ""
  };

  try {
    // Extract address from URL if it's a realtor.com, zillow, or redfin URL
    if (url.includes('realtor.com')) {
      const addressMatch = url.match(/\/([^\/]+)_([^\/]+)_([A-Z]{2})_(\d+)_/);
      if (addressMatch) {
        const street = addressMatch[1].replace(/-/g, ' ');
        const city = addressMatch[2].replace(/-/g, ' ');
        const state = addressMatch[3];
        const zip = addressMatch[4];
        data.address = `${street}, ${city}, ${state} ${zip}`;
        data.city = city;
        data.state = state;
        data.zip = zip;
      }
    } else if (url.includes('zillow.com')) {
      const addressMatch = url.match(/\/([^\/]+)-([^\/]+)-([A-Z]{2})-(\d+)/);
      if (addressMatch) {
        const street = addressMatch[1].replace(/-/g, ' ');
        const city = addressMatch[2].replace(/-/g, ' ');
        const state = addressMatch[3];
        const zip = addressMatch[4];
        data.address = `${street}, ${city}, ${state} ${zip}`;
        data.city = city;
        data.state = state;
        data.zip = zip;
      }
    } else if (url.includes('redfin.com')) {
      const addressMatch = url.match(/\/([A-Z]{2})\/([^\/]+)\/([^\/]+)/);
      if (addressMatch) {
        const state = addressMatch[1];
        const city = addressMatch[2].replace(/-/g, ' ');
        const street = addressMatch[3].replace(/-/g, ' ');
        data.address = `${street}, ${city}, ${state}`;
        data.city = city;
        data.state = state;
      }
    }

    // Use Cheerio to parse HTML and extract data
    const $ = cheerio.load(html);

    // Extract title for additional info
    const title = $('title').text();
    console.log("Page title:", title);

    // Try to extract property details from HTML
    // Price
    const priceRegex = /(\$[\d,]+)|([\d,]+ dollars)/i;
    const priceMatch = html.match(priceRegex);
    if (priceMatch && priceMatch[0]) {
      data.price = priceMatch[0].replace(/[^\d]/g, '');
    }

    // Beds/Baths
    const bedsRegex = /(\d+)\s*bed/i;
    const bedsMatch = html.match(bedsRegex);
    if (bedsMatch && bedsMatch[1]) {
      data.bedrooms = bedsMatch[1];
    }

    const bathsRegex = /(\d+\.?\d*)\s*bath/i;
    const bathsMatch = html.match(bathsRegex);
    if (bathsMatch && bathsMatch[1]) {
      data.bathrooms = bathsMatch[1];
    }

    // Square feet
    const sqftRegex = /(\d+,?\d*)\s*sq\s*ft/i;
    const sqftMatch = html.match(sqftRegex);
    if (sqftMatch && sqftMatch[1]) {
      data.squareFeet = sqftMatch[1].replace(/,/g, '');
    }

    // Year built
    const yearRegex = /built\s*in\s*(\d{4})/i;
    const yearMatch = html.match(yearRegex);
    if (yearMatch && yearMatch[1]) {
      data.yearBuilt = yearMatch[1];
    }

    // Property type
    const propertyTypes = ['Single Family', 'Condo', 'Townhouse', 'Multi-Family', 'Apartment', 'Land', 'Mobile', 'Farm'];
    for (const type of propertyTypes) {
      if (html.includes(type)) {
        data.propertyType = type;
        break;
      }
    }

    // Agent information
    const agentRegex = /(?:listing agent|agent|realtor)(?:\s*:)?\s*([A-Z][a-z]+\s+[A-Z][a-z]+)/i;
    const agentMatch = html.match(agentRegex);
    if (agentMatch && agentMatch[1]) {
      data.listingAgentName = agentMatch[1];
      data.sellerName = agentMatch[1];
    }

    // Phone
    const phoneRegex = /(\d{3}[-.\s]?\d{3}[-.\s]?\d{4})/;
    const phoneMatch = html.match(phoneRegex);
    if (phoneMatch && phoneMatch[1]) {
      data.listingAgentPhone = phoneMatch[1];
      data.sellerPhone = phoneMatch[1];
    }

    // Description
    let description = '';
    $('meta[name="description"]').each((i, el) => {
      description = $(el).attr('content') || '';
    });
    if (description) {
      data.description = description;
    }

    // Try to extract features
    const features: string[] = [];
    const featureContainers = [
      'features', 'amenities', 'highlights', 'details', 'specifications'
    ];

    for (const container of featureContainers) {
      $(`[id*="${container}"], [class*="${container}"]`).find('li').each((i, el) => {
        const feature = $(el).text().trim();
        if (feature && !features.includes(feature)) {
          features.push(feature);
        }
      });
    }

    if (features.length > 0) {
      data.features = features;
    }

    // If we have a listing agent name but no "listed by", create it
    if (data.listingAgentName && !data.listedby) {
      data.listedby = `Listed by: ${data.listingAgentName}`;
      if (data.listingAgentCompany) {
        data.listedby += ` with ${data.listingAgentCompany}`;
      }
    }

    return data;
  } catch (error) {
    console.error("Error extracting data with regex:", error);
    return data;
  }
}