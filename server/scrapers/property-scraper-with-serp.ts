import OpenAI from "openai";
import axios from "axios";
import { getJson } from "serpapi";
import { PropertyAIData } from "@shared/types";
import * as cheerio from "cheerio";
import puppeteer from "puppeteer";

interface SerpApiResult {
  title?: string;
  link?: string;
  snippet?: string;
  [key: string]: any;
}

interface SerpApiResponse {
  organic_results?: SerpApiResult[];
  [key: string]: any;
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "dummy_key_for_development",
});

// SerpAPI key for search
const serpApiKey = process.env.SERPAPI_KEY;

/**
 * Enhanced property scraper that uses SerpAPI to get around website blocks
 * This is a more robust approach than direct scraping, which often gets blocked with 403 errors
 */
export async function scrapePropertyListing(
  url: string,
): Promise<PropertyAIData> {
  // 1) Fetch the raw HTML of the listing page
  const headers = { "User-Agent": "Mozilla/5.0" };

  // 1) Fetch listing page HTML & derive address string
  const html = (await axios.get(url, { headers })).data;
  let address;
  if (url.includes("zillow.com")) {
    const js = JSON.parse(
      html.match(
        /<script id="hdpApolloPreloadedData"[^>]*>([\s\S]*?)<\/script>/,
      )[1],
    ).graphql.property;
    address = `${js.streetAddress} ${js.addressLocality} ${js.addressRegion} ${js.postalCode}`;
  } else if (url.includes("redfin.com")) {
    address = cheerio.load(html)("h1.houseAddress").text().trim();
  } else {
    address = cheerio.load(html)("h1").first().text().trim();
  }

  // 2) Google‑search for Realtor.com detail page
  const searchHtml = (
    await axios.get(
      `https://www.google.com/search?q=site:realtor.com+${encodeURIComponent(address)}`,
      { headers },
    )
  ).data;
  let realtorUrl =
    cheerio
      .load(searchHtml)('a[href*="/realestateandhomes-detail"]')
      .attr("href") || "";
  if (realtorUrl && !realtorUrl.startsWith("http")) {
    realtorUrl = "https://www.realtor.com" + realtorUrl;
  }

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
    listedbyName: $r('a[data-testid="listing-agent-name"]').text().trim(),
    listedbyPhone: $r('a[data-testid="listing-agent-phone"]').text().trim(),
    listedbyCompany: $r(".listing-agent-brokerage").text().trim(),
    listedbyLicenseNo: $r(".listing-agent-license").text().trim(),
    listedbyEmail: "",
  };

  // 4) Google‑search for agent email & regex‑extract
  const agentSearchHtml = (
    await axios.get(
      `https://www.google.com/search?q=${encodeURIComponent(agentData.listedbyName + " " + agentData.listedbyCompany + " email")}`,
      { headers },
    )
  ).data;
  agentData.listedbyEmail =
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
