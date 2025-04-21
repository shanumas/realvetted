import axios from "axios";

import { PropertyAIData } from "@shared/types";
import * as cheerio from "cheerio";

const SERPAPI_KEY = process.env.SERPAPI_KEY || "dummy_key_for_development";

/**
 * Enhanced property scraper that uses SerpAPI to get around website blocks
 * This is a more robust approach than direct scraping, which often gets blocked with 403 errors
 */
export async function scrapePropertyListing(
  url: string,
): Promise<PropertyAIData> {
  console.log("Fetching listing page HTML...0");
  // 2) Use SerpAPI to find the Realtor.com URL
  const serpRes = await axios.get("https://serpapi.com/search.json", {
    params: {
      engine: "google",
      q: `site:realtor.com ${url}`,
      api_key: SERPAPI_KEY,
      num: 5,
    },
  });
  const realtorUrl = serpRes.data.organic_results.find((r) =>
    r.link.includes("/realestateandhomes-detail"),
  ).link;

  console.log("Fetching listing page HTML...3");

  const headers = { "User-Agent": "Mozilla/5.0" };

  // 3) Fetch Realtor.com page & extract property + agent info
  const rHtml = (await axios.get(realtorUrl, { headers })).data;
  const $r = cheerio.load(rHtml);
  const propertyData = {
    address: $r('h1[data-testid="address"]').text().trim(),
    price: $r('span[data-testid="price"]').text().trim(),
    bedrooms: $r('li[data-label="property-meta-beds"]').text().trim(),
    bathrooms: $r('li[data-label="property-meta-baths"]').text().trim(),
    squareFeet: $r('li[data-label="property-meta-sqft"]').text().trim(),
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

  // 4) Google‑search for agent email & regex‑extract
  const agentSearchHtml = (
    await axios.get(
      `https://www.google.com/search?q=${encodeURIComponent(agentData.listingAgentName + " " + agentData.listingAgentCompany + " email")}`,
      { headers },
    )
  ).data;
  agentData.listingAgentEmail =
    agentSearchHtml.match(/mailto:([\w.+-]+@[\w.-]+\.\w+)/)?.[1] ||
    agentSearchHtml.match(/[\w.+-]+@[\w.-]+\.\w+/)?.[0] ||
    "";

  // 5) Combine & return
  return {
    ...propertyData,
    ...agentData,
    propertyUrl: realtorUrl,
  };
}
