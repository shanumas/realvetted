/**
 * SerpAPI-based property extractor for real estate listings
 *
 * This module uses SerpAPI to search for a property on ${EXTRACTION_SITE}
 * based on a property URL from any real estate site
 */

import { getJson } from "serpapi";

// Get the SerpAPI key from environment variables
const SERPAPI_KEY = process.env.SERPAPI_KEY;

/**
 * Extract a ${EXTRACTION_SITE} URL for a property based on any real estate URL
 *
 * @param originalUrl The original property URL (from Zillow, Redfin, etc.)
 * @returns The corresponding ${EXTRACTION_SITE} URL, or null if not found
 */
export async function processPropertyWithSerpApi(
  originalUrl: string,
): Promise<string | null> {
  let addressToSearch = originalUrl;
  //In case of non-zillow, we need to extract the address from the url
  if (!originalUrl.includes("zillow.com")) {
    addressToSearch = extractAddress(originalUrl);
    console.log("Address to search: " + addressToSearch);
  }

  try {
    const query = "zillow " + addressToSearch;
    console.log("Zillow search query:", query);
    //Use zillow to extract search address, to have a common search address for all sites
    const zillowResult = await getJson({
      engine: "google",
      q: query,
      api_key: SERPAPI_KEY,
      num: 2, // Get top 5 results
    });

    // Extract the URL from the search results
    const zOrganicResults = zillowResult.organic_results || [];

    // Find the first result from ${EXTRACTION_SITE} that contains EXTRACTION_SITE text
    const zillowExtractionResultURL = zOrganicResults.find((result: any) => {
      const link = result.link || "";
      console.log("-------Zillow serpapi result: " + JSON.stringify(result));
      return link.includes("zillow.com");
    });

    const zillowAddress = extractAddress(zillowExtractionResultURL.link);
    const zillowDescription = zillowExtractionResultURL.snippet;

    //Use zillow result to get property description

    //Use redfin to extract Listing agent details

    const EXTRACTION_SITE = "redfin.com";

    // build the query from only the parts you want, then join & trim
    const parts = ["site:redfin.com", 'intext:"Listed by"', `${zillowAddress}`];
    const searchQuery = parts.filter(Boolean).join(" ").trim(); // "site:redfin.com intext:"Listed by" intext:"$" "1257…94117""

    //intext:"beds" intext:"baths" intext:"price"

    console.log(
      `Using SerpAPI to find ${EXTRACTION_SITE} URL for: ${zillowAddress}`,
    );

    // Use SerpAPI to search for the property on ${EXTRACTION_SITE}
    const result = await getJson({
      engine: "google",
      q: searchQuery,
      api_key: SERPAPI_KEY,
      num: 5, // Get top 5 results
    });

    console.log("SerpAPI search result:", result);

    // Extract the URL from the search results
    const organicResults = result.organic_results || [];

    // Find the first result from ${EXTRACTION_SITE} that contains EXTRACTION_SITE text
    const extractionResult = organicResults.find((result: any) => {
      const link = result.link || "";
      console.log("-------Current link: " + result);
      return link.includes(EXTRACTION_SITE);
    });

    if (extractionResult) {
      console.log(
        `Found ${EXTRACTION_SITE} URL: ${JSON.stringify(extractionResult.snippet)}`,
      );
      const redfinDescription = extractionResult.snippet;
      const combinedDescription = zillowDescription + " , " + redfinDescription;
      console.log(
        "--------------------------Combined description: " +
          combinedDescription,
      );
      return combinedDescription;
    } else {
      console.log(`No matching ${EXTRACTION_SITE} URL found in search results`);
      return null;
    }
  } catch (error) {
    console.error("Error in SerpAPI search:", error);
    return null;
  }
}

function extractAddress(url: string) {
  const slug = url.split("/").find((s) => /^\d/.test(s)); // ① segment that starts with the street-number
  return slug
    .replace(/[_-]/g, " ") // ② slug → words
    .replace(/\b\w/g, (c) => c.toUpperCase()) // ③ title-case
    .replace(/\s([A-Z]{2})\s(\d{5})$/, ", $1 $2"); // ④ add comma before “CA 94115”
}
