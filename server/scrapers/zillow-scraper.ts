import puppeteer from 'puppeteer';
import * as cheerio from 'cheerio';
import { PropertyAIData } from "@shared/types";
import fetch from 'node-fetch';

/**
 * Extract property data from a Zillow URL
 * 
 * This function uses puppeteer with enhanced anti-scraping measures to extract 
 * property data from Zillow, focusing on specific elements like attribution tags
 * for listing agents and brokers.
 * 
 * @param zillowUrl The Zillow property URL to scrape
 * @returns Structured property data
 */
export async function extractZillowPropertyData(zillowUrl: string): Promise<PropertyAIData> {
  console.log(`Extracting Zillow property data from URL: ${zillowUrl}`);
  
  let browser;
  try {
    // Enhanced browser configuration to avoid detection
    browser = await puppeteer.launch({
      headless: "new",
      executablePath: process.env.CHROME_BIN || undefined,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--window-size=1920,1080',
      ],
      ignoreHTTPSErrors: true,
    });
    
    const page = await browser.newPage();
    
    // Set a realistic viewport
    await page.setViewport({
      width: 1920,
      height: 1080
    });
    
    // Set a realistic user agent
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');
    
    // Set extra headers to appear more like a real browser
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'sec-ch-ua': '"Chromium";v="121", "Google Chrome";v="121", "Not-A.Brand";v="99"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Windows"',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'Upgrade-Insecure-Requests': '1',
    });
    
    // Configure the browser to allow all cookies
    const client = await page.target().createCDPSession();
    await client.send('Network.clearBrowserCookies');
    
    // Install mouse-helper to perform random mouse movements
    await page.evaluateOnNewDocument(() => {
      // Add random mouse movements
      let lastMouseX = 0;
      let lastMouseY = 0;
      const randomMovements = () => {
        document.addEventListener('mousemove', (e: MouseEvent) => {
          lastMouseX = e.clientX;
          lastMouseY = e.clientY;
        });
        
        setInterval(() => {
          const randomX = Math.random() * window.innerWidth;
          const randomY = Math.random() * window.innerHeight;
          const event = new MouseEvent('mousemove', {
            bubbles: true,
            cancelable: true,
            clientX: randomX,
            clientY: randomY
          });
          document.dispatchEvent(event);
        }, Math.random() * 5000 + 2000); // Random interval between 2-7s
      };
      randomMovements();
    });
    
    // Intercept and modify navigator.webdriver property
    await page.evaluateOnNewDocument(() => {
      // Overwrite the webdriver property to avoid detection
      Object.defineProperty(navigator, 'webdriver', {
        get: () => false,
        configurable: true
      });
      
      // Add realistic language settings
      Object.defineProperty(navigator, 'languages', {
        get: () => ['en-US', 'en'],
        configurable: true
      });
    });
    
    // Disable image loading for performance
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      if (req.resourceType() === 'image' || req.resourceType() === 'font' || req.resourceType() === 'media') {
        req.abort();
      } else {
        req.continue();
      }
    });
    
    console.log(`Navigating to Zillow URL with enhanced anti-scraping measures...`);
    
    // Navigate to the Zillow URL with timeout and wait parameters
    await page.goto(zillowUrl, { 
      waitUntil: 'networkidle2',
      timeout: 60000
    });
    
    // Wait for the page to fully load
    await page.waitForSelector('body', { timeout: 30000 });
    
    // Scroll down to ensure all content is loaded
    await autoScroll(page);
    
    // Random wait to appear more human-like
    await page.waitForTimeout(Math.random() * 2000 + 1000);
    
    // Extract the HTML content
    const htmlContent = await page.content();
    
    // Close the browser
    await browser.close();
    browser = null;
    
    // Parse the HTML with cheerio for specific selectors
    const $ = cheerio.load(htmlContent);
    
    // Extract data using the specific selectors
    console.log('Extracting data from Zillow HTML using specific selectors...');
    
    // Basic property data extraction
    const address = $('[data-testid="home-details-summary-container"] h1').text().trim();
    const price = $('[data-testid="price"]').text().trim();
    const bedsBathsText = $('[data-testid="bed-bath-living-area-container"]').text().trim();
    
    // Parse beds, baths from the combined text
    let bedrooms = '';
    let bathrooms = '';
    let squareFeet = '';
    
    // Commonly structured as "3 bd2 ba1,380 sqft"
    const bedMatch = bedsBathsText.match(/(\d+)\s*bd/i);
    if (bedMatch) bedrooms = bedMatch[1];
    
    const bathMatch = bedsBathsText.match(/(\d+\.?\d*)\s*ba/i);
    if (bathMatch) bathrooms = bathMatch[1];
    
    const sqftMatch = bedsBathsText.match(/(\d+,?\d*)\s*sqft/i);
    if (sqftMatch) squareFeet = sqftMatch[1].replace(',', '');
    
    // Extract property description
    const description = $('[data-testid="hdp-description-container"] [data-testid="expanded-description"]').text().trim();
    
    // Extract listing agent information from the attribution tag
    const listingAgentText = $('[data-testid="attribution-LISTING_AGENT"]').text().trim();
    const brokerText = $('[data-testid="attribution-BROKER"]').text().trim();
    
    console.log(`Listing agent text: ${listingAgentText}`);
    console.log(`Broker text: ${brokerText}`);
    
    // Parse listing agent information
    let listingAgentName = '';
    let listingAgentPhone = '';
    let listingAgentLicenseNo = '';
    
    // Common format: "Listed by: Jane Doe, Broker, (123) 456-7890, License #: ABC12345"
    if (listingAgentText) {
      // Extract agent name - typically follows "Listed by:" or is at the start
      const nameMatch = listingAgentText.match(/Listed by:?\s*([^,]+)/i) || 
                         listingAgentText.match(/^([^,]+)/i);
      
      if (nameMatch && nameMatch[1]) {
        listingAgentName = nameMatch[1].trim();
      }
      
      // Extract phone number
      const phoneMatch = listingAgentText.match(/\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);
      if (phoneMatch) {
        listingAgentPhone = phoneMatch[0];
      }
      
      // Extract license number - Look for patterns like "DRE #01234567" or "License #ABC123"
      const licenseMatch = listingAgentText.match(/(?:DRE\s*#?|License\s*#?|#)(\w+)/i);
      if (licenseMatch && licenseMatch[1]) {
        listingAgentLicenseNo = licenseMatch[1].trim();
      }
    }
    
    // Parse broker information
    let listingAgentCompany = '';
    
    if (brokerText) {
      // The broker text typically contains the company name
      // Sometimes it's prefixed with "Listing provided by:" or similar
      const companyMatch = brokerText.match(/(?:Listing provided by:?\s*|Broker:?\s*|^)([^,]+)/i);
      
      if (companyMatch && companyMatch[1]) {
        listingAgentCompany = companyMatch[1].trim();
      } else {
        // If no specific pattern found, use the whole text
        listingAgentCompany = brokerText;
      }
    }
    
    // Extract address components
    let city = '';
    let state = '';
    let zip = '';
    
    // Zillow URLs often have the format: /homedetails/1234-Street-City-STATE-ZIP/
    const urlParts = zillowUrl.split('/');
    for (const part of urlParts) {
      if (part.includes('-CA-') || part.includes('-NY-')) {  // Example for CA and NY
        const addressParts = part.split('-');
        if (addressParts.length >= 3) {
          // Last 3 parts are typically City-STATE-ZIP
          city = addressParts[addressParts.length - 3].replace(/_/g, ' ');
          state = addressParts[addressParts.length - 2];
          zip = addressParts[addressParts.length - 1].split('/')[0]; // Remove trailing slash if present
        }
      }
    }
    
    // If we couldn't extract from URL, try from the address
    if (!city || !state || !zip) {
      const addressMatch = address.match(/([^,]+),\s*([A-Z]{2})\s*(\d{5})/);
      if (addressMatch) {
        city = addressMatch[1].trim();
        state = addressMatch[2];
        zip = addressMatch[3];
      }
    }
    
    // Extract features
    const features: string[] = [];
    $('[data-testid="facts-list"] li').each((i, el) => {
      features.push($(el).text().trim());
    });
    
    // Extract year built
    let yearBuilt = '';
    const yearBuiltItem = features.find(f => f.toLowerCase().includes('year built'));
    if (yearBuiltItem) {
      const yearMatch = yearBuiltItem.match(/\d{4}/);
      if (yearMatch) {
        yearBuilt = yearMatch[0];
      }
    }
    
    // Extract property type
    let propertyType = '';
    const typeItem = features.find(f => f.toLowerCase().includes('type') || f.toLowerCase().includes('style'));
    if (typeItem) {
      propertyType = typeItem.replace(/type:|style:/i, '').trim();
    }
    
    // Clean up license number if present
    if (listingAgentLicenseNo) {
      const cleanedLicense = cleanLicenseNumber(listingAgentLicenseNo);
      if (cleanedLicense) {
        listingAgentLicenseNo = cleanedLicense;
      }
    }
    
    // Create the structured property data
    const propertyData: PropertyAIData = {
      address: address || "Address unavailable",
      city: city || "",
      state: state || "",
      zip: zip || "",
      propertyType: propertyType || "",
      bedrooms: bedrooms || "",
      bathrooms: bathrooms || "",
      squareFeet: squareFeet || "",
      price: price || "",
      yearBuilt: yearBuilt || "",
      description: description || "No description available",
      features: features || [],
      listedby: listingAgentText || "",
      listingAgentName: listingAgentName || "",
      listingAgentPhone: listingAgentPhone || "",
      listingAgentCompany: listingAgentCompany || "",
      listingAgentLicenseNo: listingAgentLicenseNo || "",
      listingAgentEmail: "", // Will be populated separately
      propertyUrl: zillowUrl,
      imageUrls: [], // Would need a separate process to extract images
      sellerName: listingAgentName || "",
      sellerPhone: listingAgentPhone || "",
      sellerCompany: listingAgentCompany || "",
      sellerLicenseNo: listingAgentLicenseNo || "",
      sellerEmail: ""
    };
    
    return propertyData;
  } catch (error: any) {
    console.error("Zillow scraping failed:", error);
    if (browser) {
      await browser.close();
    }
    throw new Error(`Failed to extract Zillow property data: ${error.message || String(error)}`);
  }
}

/**
 * Helper function to auto-scroll the page to load all content
 * @param page The puppeteer page to scroll
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
        
        if (totalHeight >= scrollHeight) {
          clearInterval(timer);
          resolve();
        }
      }, 100);
    });
  });
}

/**
 * Find a Zillow URL for the given property address or listing URL
 * 
 * If the URL is already a Zillow URL, it returns it directly.
 * Otherwise, it performs a Google search to find a matching Zillow URL.
 * 
 * @param url The original property URL or address to search for
 * @returns Zillow URL if found, null otherwise
 */
export async function findZillowUrl(url: string): Promise<string | null> {
  // Check if the URL is already a Zillow URL
  if (url.includes('zillow.com')) {
    return url;
  }
  
  console.log(`Finding Zillow URL for: ${url}`);
  
  try {
    // Create a search query - if it looks like a URL, extract the domain and add "zillow"
    let searchQuery: string;
    
    if (url.startsWith('http')) {
      // It's a URL, let's try to be smart about the search query
      try {
        const urlObj = new URL(url);
        // Extract the domain name without TLD
        const domain = urlObj.hostname.split('.')[0];
        
        // Extract potential address from the path
        const path = urlObj.pathname.replace(/[_-]/g, ' ').replace(/\//g, ' ').trim();
        
        if (path && path.length > 5) {
          // If path looks meaningful, use it
          searchQuery = `${path} zillow`;
        } else {
          // Otherwise, use the domain + "real estate listing zillow"
          searchQuery = `${domain} real estate listing zillow`;
        }
      } catch (e) {
        // If URL parsing fails, use the full URL
        searchQuery = `${url} zillow`;
      }
    } else {
      // It's probably an address or description
      searchQuery = `${url} zillow`;
    }
    
    console.log(`Searching for Zillow URL with query: "${searchQuery}"`);
    
    // Use puppeteer for the Google search to avoid rate limiting
    const browser = await puppeteer.launch({
      headless: "new",
      executablePath: process.env.CHROME_BIN || undefined,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
      ]
    });
    
    const page = await browser.newPage();
    
    // Set a realistic user agent
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');
    
    // Disable images for performance
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      if (req.resourceType() === 'image' || req.resourceType() === 'font') {
        req.abort();
      } else {
        req.continue();
      }
    });
    
    // Navigate to Google
    await page.goto('https://www.google.com', { waitUntil: 'networkidle2' });
    
    // Type the search query
    await page.type('input[name="q"]', searchQuery);
    
    // Press Enter
    await page.keyboard.press('Enter');
    
    // Wait for the search results
    await page.waitForSelector('#search', { timeout: 10000 });
    
    // Wait for a random time to appear more human-like
    await page.waitForTimeout(Math.random() * 1000 + 500);
    
    // Extract all links from the search results
    const links = await page.evaluate(() => {
      const results = Array.from(document.querySelectorAll('#search a'));
      return results.map((link: any) => {
        return {
          href: link.href || '',
          text: link.textContent || ''
        };
      });
    });
    
    await browser.close();
    
    // Filter for Zillow links that look like property listings
    const zillowLinks = links.filter(link => 
      link.href.includes('zillow.com/homedetails') || 
      (link.href.includes('zillow.com') && link.href.includes('_zpid'))
    );
    
    if (zillowLinks.length > 0) {
      console.log(`Found Zillow URL: ${zillowLinks[0].href}`);
      return zillowLinks[0].href;
    }
    
    console.log('No Zillow URL found in search results');
    return null;
  } catch (error: any) {
    console.error('Error finding Zillow URL:', error.message || String(error));
    return null;
  }
}

/**
 * Helper function to strip license prefixes
 * @param licenseNo License number with possible prefix
 * @returns Clean license number without prefix
 */
function cleanLicenseNumber(licenseNo: string | null | undefined): string | null | undefined {
  if (!licenseNo) return licenseNo;
  
  // Remove any prefix like "DRE", "DRE #", "CalDRE", etc. and keep only the numbers and letters
  return licenseNo.replace(/^(DRE\s*#?|CalDRE\s*#?|Lic\.|License|BRE\s*#?)\s*/i, "").trim();
}