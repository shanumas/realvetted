import OpenAI from "openai";
import { PropertyAIData } from "@shared/types";
import { extractZillowPropertyData, findZillowUrl } from "./scrapers/zillow-scraper";
import { extractPropertyWithSerpApi } from "./scrapers/property-serpapi-scraper";

// Initialize OpenAI API client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Extract property data from a URL
 * 
 * This function uses multiple strategies to extract property data:
 * 1. First tries SerpAPI if the key is available (avoids anti-scraping measures)
 * 2. If SerpAPI fails or isn't available, tries a direct Zillow scraper if it's a Zillow URL
 * 3. If not a Zillow URL, tries to find a corresponding Zillow URL and scrape that
 * 4. As a last resort, falls back to analyzing the URL structure with OpenAI
 * 
 * @param url The URL of the property listing
 * @returns The extracted property data
 */
export async function extractPropertyFromUrl(url: string): Promise<PropertyAIData> {
  if (!url) {
    throw new Error("URL is required");
  }

  // Check for a valid URL format
  if (!url.match(/^https?:\/\//i)) {
    throw new Error("Invalid URL format. Please provide a complete URL starting with http:// or https://");
  }

  console.log(`Extracting property data from URL: ${url}`);

  try {
    // First try using SerpAPI if the key is available
    // This bypasses anti-scraping measures on real estate sites
    if (process.env.SERPAPI_KEY) {
      try {
        console.log("Attempting extraction with SerpAPI to bypass anti-scraping...");
        return await extractPropertyWithSerpApi(url);
      } catch (error) {
        console.error("SerpAPI extraction failed:", error);
        console.log("Falling back to direct scraping methods...");
      }
    } else {
      console.log("SerpAPI key not available. Using direct extraction methods.");
    }
    
    // Check for required API keys for fallback methods
    if (!process.env.OPENAI_API_KEY) {
      console.log("OpenAI API key is missing. Cannot use fallback extraction methods.");
      throw new Error("OpenAI API key is required for property data extraction when SerpAPI is unavailable");
    }

    // Next, check if it's a Zillow URL or find a corresponding Zillow URL
    let zillowUrl = url;
    
    if (!url.includes('zillow.com')) {
      console.log("Not a Zillow URL. Searching for corresponding Zillow listing...");
      const foundUrl = await findZillowUrl(url);
      
      if (foundUrl) {
        console.log(`Found Zillow URL: ${foundUrl}`);
        zillowUrl = foundUrl;
      } else {
        console.log("No Zillow URL found. Falling back to URL analysis.");
        return await extractFromUrlStructure(url);
      }
    }
    
    // Use specialized Zillow scraper
    try {
      console.log(`Using specialized Zillow scraper with anti-scraping measures for URL: ${zillowUrl}`);
      return await extractZillowPropertyData(zillowUrl);
    } catch (error) {
      console.error("Zillow scraping failed:", error);
      
      // Fallback method: URL analysis with OpenAI
      console.log("Falling back to URL analysis");
      return await extractFromUrlStructure(url);
    }
  } catch (error) {
    console.error("Error in property URL extraction:", error);
    
    // Create a fallback property result with minimal data
    const fallbackResult: PropertyAIData = {
      address: "Address could not be extracted",
      city: "",
      state: "",
      zip: "",
      propertyType: "Unknown",
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
    
    return fallbackResult;
  }
}

/**
 * Extract property data from just the URL structure using OpenAI
 * 
 * @param url The URL of the property listing
 * @returns The extracted property data
 */
async function extractFromUrlStructure(url: string): Promise<PropertyAIData> {
  try {
    // Extract domain and possible identifier from URL
    const urlObj = new URL(url);
    const domain = urlObj.hostname;
    
    // Try to get property details directly from the URL structure
    let addressFromUrl = "";
    let cityFromUrl = "";
    let stateFromUrl = "";
    let zipFromUrl = "";
    
    // Extract information from URL parts for common real estate sites
    if (
      domain.includes("zillow.com") ||
      domain.includes("realtor.com") ||
      domain.includes("redfin.com")
    ) {
      const pathParts = urlObj.pathname.split("/");
      
      for (const part of pathParts) {
        // Look for possible address/location information in the URL
        if (part.includes("-")) {
          const segments = part.split("-");
          
          // Check for street numbers
          if (segments.length > 1 && /^\d+$/.test(segments[0])) {
            // This might be an address: e.g., 123-Main-St
            addressFromUrl = segments.join(" ").replace(/-/g, " ");
          }
          
          // Check for state codes
          if (
            segments.length > 0 &&
            /^[A-Z]{2}$/.test(segments[segments.length - 1])
          ) {
            stateFromUrl = segments[segments.length - 1];
            
            // The part before the state is likely the city
            if (segments.length > 1) {
              cityFromUrl = segments[segments.length - 2].replace(
                /-/g,
                " ",
              );
            }
          }
          
          // Check for ZIP codes
          if (
            segments.length > 0 &&
            /^\d{5}$/.test(segments[segments.length - 1])
          ) {
            zipFromUrl = segments[segments.length - 1];
          }
        }
      }
    }
    
    // Construct a prompt for GPT to extract information from the URL
    const prompt = `
      I have a real estate listing URL. Please extract as much property information as possible from just the URL structure.
      
      URL: ${url}
      
      Based on the URL format, I've already extracted some potential information:
      ${addressFromUrl ? `Possible address: ${addressFromUrl}` : ""}
      ${cityFromUrl ? `Possible city: ${cityFromUrl}` : ""}
      ${stateFromUrl ? `Possible state: ${stateFromUrl}` : ""}
      ${zipFromUrl ? `Possible ZIP: ${zipFromUrl}` : ""}
      
      Analyze the URL structure to extract (with high confidence):
      - Property address
      - City, state, ZIP
      - Property type (if discernible)
      - Any price information
      - Any bedroom/bathroom counts
      - Any other property details that might be encoded in the URL
      
      If you can't determine certain fields with reasonable confidence, leave them as null.
      
      Format as JSON.
    `;
    
    // Call OpenAI to extract data
    const response = await openai.chat.completions.create({
      model: "gpt-4o", // Using the latest model for better extraction
      messages: [
        {
          role: "system",
          content:
            "You extract real estate property information from URLs. Be precise and only include information you can reasonably determine from the URL structure. For uncertain fields, use null values.",
        },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
    });
    
    // Parse the API response
    const apiResult = JSON.parse(
      response.choices[0].message.content || "{}"
    );
    
    // Ensure we have the minimum required data
    const propertyData: PropertyAIData = {
      address: apiResult.address || addressFromUrl || "Address unavailable",
      city: apiResult.city || cityFromUrl || "",
      state: apiResult.state || stateFromUrl || "",
      zip: apiResult.zip || zipFromUrl || "",
      propertyType: apiResult.propertyType || "Unknown",
      bedrooms: apiResult.bedrooms || "",
      bathrooms: apiResult.bathrooms || "",
      squareFeet: apiResult.squareFeet || "",
      price: apiResult.price || "",
      yearBuilt: apiResult.yearBuilt || "",
      description: apiResult.description || "Property information extracted from URL",
      features: apiResult.features || [],
      listingAgentName: apiResult.sellerName || apiResult.agentName || "",
      listingAgentPhone: apiResult.sellerPhone || apiResult.agentPhone || "",
      listingAgentEmail: apiResult.sellerEmail || apiResult.agentEmail || "",
      listingAgentCompany: apiResult.sellerCompany || apiResult.agentCompany || "",
      listingAgentLicenseNo: apiResult.sellerLicenseNo || apiResult.licenseNumber || "",
      propertyUrl: url,
      imageUrls: [],
      sellerName: apiResult.sellerName || apiResult.agentName || "",
      sellerPhone: apiResult.sellerPhone || apiResult.agentPhone || "",
      sellerCompany: apiResult.sellerCompany || apiResult.agentCompany || "",
      sellerLicenseNo: apiResult.sellerLicenseNo || apiResult.licenseNumber || "",
      sellerEmail: apiResult.sellerEmail || apiResult.agentEmail || "",
    };
    
    return propertyData;
  } catch (error) {
    console.error("URL analysis method failed:", error);
    throw error;
  }
}