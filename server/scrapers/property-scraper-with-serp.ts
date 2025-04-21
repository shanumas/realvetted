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
  console.log("Using SerpAPI to extract property data...");
  
  // 1) Use SerpAPI to search for property data instead of direct scraping
  const serpRes = await axios.get("https://serpapi.com/search.json", {
    params: {
      engine: "google",
      q: `${url} property details`,
      api_key: SERPAPI_KEY,
      num: 10,
    },
  });
  
  // 2) Extract information from SerpAPI results
  const organicResults = serpRes.data.organic_results || [];
  
  // Find the most relevant result that might contain property data
  const propertyResult = organicResults.find((r: any) => 
    r.title?.includes("sale") || 
    r.title?.includes("property") || 
    r.title?.includes("home") ||
    r.title?.includes("real estate")
  );
  
  // 3) Extract as much information as possible from the search results
  const title = propertyResult?.title || "";
  const snippet = propertyResult?.snippet || "";
  const link = propertyResult?.link || url;
  
  // Attempt to extract address from title or snippet
  const addressMatch = title.match(/(\d+\s+[\w\s]+(?:St|Ave|Blvd|Dr|Ln|Rd|Way|Ct|Pl|Ter))/i);
  const address = addressMatch ? addressMatch[0] : "Address unavailable";
  
  // Attempt to extract price from title or snippet
  const priceMatch = (title + " " + snippet).match(/\$([0-9,]+)/);
  const price = priceMatch ? priceMatch[0] : "";
  
  // Attempt to extract beds/baths from title or snippet
  const bedsMatch = (title + " " + snippet).match(/(\d+)\s*(?:bed|bedroom)/i);
  const bathsMatch = (title + " " + snippet).match(/(\d+(?:\.\d+)?)\s*(?:bath|bathroom)/i);
  const sqftMatch = (title + " " + snippet).match(/(\d+(?:,\d+)?)\s*(?:sq\.?\s*ft|square\s*feet|sqft)/i);
  
  const bedrooms = bedsMatch ? bedsMatch[1] : "";
  const bathrooms = bathsMatch ? bathsMatch[1] : "";
  const sqft = sqftMatch ? sqftMatch[1] : "";
  
  // Attempt to find agent information through an additional search
  let agentName = "";
  let agentCompany = "";
  let agentPhone = "";
  let agentEmail = "";
  let agentLicenseNo = "";
  
  try {
    // Make a separate search for the agent info
    const agentSearchRes = await axios.get("https://serpapi.com/search.json", {
      params: {
        engine: "google",
        q: `real estate agent ${address}`,
        api_key: SERPAPI_KEY,
        num: 3,
      },
    });
    
    // Try to extract agent name from the results
    const agentResults = agentSearchRes.data.organic_results || [];
    if (agentResults.length > 0) {
      const agentResult = agentResults[0];
      const agentSnippet = agentResult.snippet || "";
      
      // Look for patterns that might indicate an agent name
      const agentNameMatch = agentSnippet.match(/([A-Z][a-z]+\s+[A-Z][a-z]+)(?:\s+is\s+a\s+real\s+estate|,\s+real\s+estate|,\s+Realtor)/);
      if (agentNameMatch) {
        agentName = agentNameMatch[1];
        
        // If we have agent name, try to find their email
        if (agentName) {
          try {
            const emailSearchRes = await axios.get("https://serpapi.com/search.json", {
              params: {
                engine: "google",
                q: `${agentName} real estate agent email contact`,
                api_key: SERPAPI_KEY,
                num: 1,
              },
            });
            
            // Look for email pattern in snippet
            const emailResults = emailSearchRes.data.organic_results || [];
            if (emailResults.length > 0) {
              const emailSnippet = emailResults[0].snippet || "";
              const emailMatch = emailSnippet.match(/[\w.+-]+@[\w.-]+\.\w+/);
              if (emailMatch) {
                agentEmail = emailMatch[0];
              }
            }
          } catch (emailError) {
            console.log("Error fetching agent email:", emailError);
          }
        }
      }
      
      // Try to extract company name
      const companyMatch = agentSnippet.match(/(?:with|at)\s+([A-Z][A-Za-z\s]+(?:Realty|Properties|Real Estate|Homes|Group))/);
      if (companyMatch) {
        agentCompany = companyMatch[1];
      }
    }
  } catch (agentError) {
    console.log("Error fetching agent data:", agentError);
  }
  
  // 4) Combine all extracted data
  return {
    address,
    price,
    bedrooms,
    bathrooms,
    squareFeet: sqft,
    yearBuilt: "",
    description: snippet,
    features: [],
    propertyType: "",
    sellerName: agentName,
    sellerPhone: agentPhone,
    sellerEmail: agentEmail,
    sellerCompany: agentCompany,
    sellerLicenseNo: agentLicenseNo,
    propertyUrl: link,
    imageUrls: [],
  };
}
