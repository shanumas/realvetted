import puppeteer from "puppeteer";
import axios from "axios";
import cheerio from "cheerio";
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

  // Use Puppeteer to fetch the actual property page HTML
  let pageContent = "";
  try {
    const browser = await puppeteer.launch({
      headless: true, // Set to false if you want to see the browser window
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const page = await browser.newPage();
    await page.setUserAgent("Mozilla/5.0");
    await page.goto(realtorUrl, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    // Get the page content
    pageContent = await page.content(); // Get the entire page HTML

    await browser.close();
  } catch (error) {
    console.error("Error during Puppeteer request:", error);
    throw new Error("Failed to fetch the property page using Puppeteer.");
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
