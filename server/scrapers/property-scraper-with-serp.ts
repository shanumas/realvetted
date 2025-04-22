import puppeteer from "puppeteer";
import axios from "axios";
import * as cheerio from "cheerio";
import { PropertyAIData } from "@shared/types";

export async function scrapePropertyListing(
  url: string,
): Promise<PropertyAIData> {
  console.log("Fetching listing page HTML...0");

  const SERPAPI_KEY = process.env.SERPAPI_KEY || "dummy_key_for_development";

  // Check if the URL is a valid Realtor.com URL
  let realtorUrl = url;
  if (!realtorUrl.includes("realtor.com")) {
    console.log("Not a Realtor.com URL. Searching for Realtor.com listing...");
    try {
      // Perform a Google search to find the Realtor.com URL
      const serpRes = await axios.get("https://serpapi.com/search.json", {
        params: {
          engine: "google",
          q: `${url}`,
          api_key: SERPAPI_KEY,
          num: 5,
        },
      });

      // Log the full response to inspect the structure
      console.log(serpRes.data);

      realtorUrl = serpRes.data.organic_results.find((r: { link: string }) =>
        r.link.includes("realtor.com"),
      )?.link;

      if (!realtorUrl) {
        throw new Error("No Realtor.com listing found.");
      }
      console.log("Found Realtor URL:", realtorUrl);
    } catch (error) {
      console.error("Error during SerpAPI call:", error);
      throw new Error("Failed to fetch data from SerpAPI.");
    }
  } else {
    console.log("Realtor.com URL detected:", realtorUrl);
  }

  const headers = { "User-Agent": "Mozilla/5.0" };

  // Attempt to use direct HTTP request first, as it's more reliable in Replit environment
  let pageContent = "";
  try {
    // Use axios to fetch the page with appropriate headers to avoid bot detection
    const response = await axios.get(realtorUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Upgrade-Insecure-Requests': '1'
      },
      timeout: 30000
    });
    
    pageContent = response.data;
    console.log("Successfully fetched property page using direct HTTP request");
  } catch (httpError) {
    console.error("Error during direct HTTP request:", httpError);
    
    // Fallback to Puppeteer if direct HTTP request fails
    console.log("Falling back to Puppeteer for fetching property page...");
    try {
      const browser = await puppeteer.launch({
        headless: true,
        args: [
          "--no-sandbox", 
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-accelerated-2d-canvas",
          "--disable-gpu"
        ]
      });

      const page = await browser.newPage();
      await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36");
      await page.goto(realtorUrl, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });

      // Get the page content
      pageContent = await page.content();
      await browser.close();
      
      console.log("Successfully fetched property page using Puppeteer fallback");
    } catch (puppeteerError) {
      console.error("Error during Puppeteer fallback request:", puppeteerError);
      throw new Error("Failed to fetch the property page using both direct HTTP and Puppeteer fallback.");
    }
  }

  // Parse the HTML using Cheerio
  const $r = cheerio.load(pageContent);

  // Extract property data from the full page
  const propertyData = {
    address: $r('h1[data-testid="address"]').text().trim(),
    price: $r('span[data-testid="price"]').text().trim(),
    bedrooms: $r('li[data-label="property-meta-beds"]').text().trim(),
    bathrooms: $r('li[data-label="property-meta-baths"]').text().trim(),
    sqft: $r('li[data-label="property-meta-sqft"]').text().trim(),
    yearBuilt: $r('li[data-label="property-meta-yearbuilt"]').text().trim(),
    imageUrls: $r('img[data-testid="hero-image"]')
      .map((i, el) => $r(el).attr("src"))
      .get(),
  };

  const agentData = {
    listingAgentName: $r('a[data-testid="listing-agent-name"]').text().trim(),
    listingAgentPhone: $r('a[data-testid="listing-agent-phone"]').text().trim(),
    listingAgentCompany: $r(".listing-agent-brokerage").text().trim(),
    listingAgentLicenseNo: $r(".listing-agent-license").text().trim(),
    listingAgentEmail: "",
  };

  // Retrieve listing agent's email using SerpAPI
  console.log(
    "Email search query:",
    `${agentData.listingAgentName} ${agentData.listingAgentCompany} email`,
  );
  const emailSearchRes = await axios.get("https://serpapi.com/search.json", {
    params: {
      engine: "google",
      q: `${agentData.listingAgentName} ${agentData.listingAgentCompany} email`,
      api_key: SERPAPI_KEY,
      num: 3,
    },
  });

  if (emailSearchRes.data.organic_results[0]?.snippet) {
    const match = emailSearchRes.data.organic_results[0].snippet.match(
      /[\w.+-]+@[\w.-]+\.\w+/,
    );
    agentData.listingAgentEmail = match ? match[0] : "";
    console.log("Extracted Email:", agentData.listingAgentEmail);
  }

  // Combine and return all data
  return {
    ...propertyData,
    ...agentData,
    propertyUrl: realtorUrl,
  };
}
