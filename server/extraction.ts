import OpenAI from "openai";
import { PropertyAIData } from "@shared/types";
import { extractPropertyWithPuppeteer } from "./scrapers/puppeteer-direct-scraper";
import _ from "lodash";
import { processPropertyWithSerpApi } from "./scrapers/serpapi-extractor";

/**
 * Normalize property data to ensure numeric fields are properly converted to numbers
 * This is crucial for database compatibility
 *
 * @param propertyData The raw property data
 * @returns The normalized property data with proper types
 */
function normalizePropertyData(propertyData: PropertyAIData): PropertyAIData {
  // Create a deep clone of the object to avoid mutation
  const normalizedData = _.cloneDeep(propertyData);

  // Define fields that should be treated as numeric
  const numericFields = [
    "bedrooms",
    "bathrooms",
    "squareFeet",
    "yearBuilt",
    "price",
  ];

  // Process each numeric field
  numericFields.forEach((field) => {
    const value = _.get(normalizedData, field);

    // Handle empty values
    if (_.isEmpty(value) && !_.isNumber(value)) {
      _.set(normalizedData, field, null);
      return;
    }

    // Skip if already a number
    if (_.isNumber(value)) {
      return;
    }

    // Convert string values to numbers
    if (_.isString(value)) {
      let cleanedValue: string;

      // Use specific cleaning pattern based on field type
      if (field === "price" || field === "squareFeet") {
        // For monetary or measurement values, keep decimal points but remove currency symbols, commas, etc.
        cleanedValue = value.replace(/[^0-9.]/g, "");
      } else if (field === "bathrooms") {
        // Special handling for bathrooms which might be in various fractional formats
        if (value.includes("/")) {
          // Handle fractions with space or dash format: "2 1/2" or "2-1/2"
          const fractionMatch = value.match(/(\d+)[\s\-]*(\d+)\/(\d+)/);
          if (fractionMatch) {
            const whole = parseInt(fractionMatch[1]);
            const numerator = parseInt(fractionMatch[2]);
            const denominator = parseInt(fractionMatch[3]);
            if (denominator > 0) {
              const result = whole + numerator / denominator;
              _.set(normalizedData, field, result);
              return;
            }
          }
        }
        // Handle text format like "2bath1half"
        else if (value.includes("bath") && value.includes("half")) {
          const textMatch = value.match(/(\d+)bath(\d+)half/i);
          if (textMatch) {
            const whole = parseInt(textMatch[1]);
            const half = parseInt(textMatch[2]);
            const result = whole + half * 0.5;
            _.set(normalizedData, field, result);
            return;
          }
        }
        // Standard decimal handling if no special format was found
        cleanedValue = value.replace(/[^0-9.]/g, "");
      } else {
        // For integer values like bedrooms, etc.
        cleanedValue = value.replace(/[^0-9]/g, "");
      }

      // Convert to number if it's a valid numeric string
      if (cleanedValue) {
        const numericValue = parseFloat(cleanedValue);
        if (!isNaN(numericValue)) {
          _.set(normalizedData, field, numericValue);
        } else {
          _.set(normalizedData, field, null);
        }
      } else {
        _.set(normalizedData, field, null);
      }
    }
  });

  return normalizedData;
}

// Initialize OpenAI API client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Configuration for extraction methods
const EXTRACTION_CONFIG = {
  USE_SERPAPI_PRELIMINARY_STEP: true, // Use SerpAPI to get Realtor.com URLs
  SERPAPI_TIMEOUT_MS: 15000, // Timeout for SerpAPI requests (15 seconds)
  MAX_EXTRACTION_ATTEMPTS: 2, // Maximum number of extraction attempts with different methods
  EXTRACTION_TIMEOUT_MS: 30000, // Overall extraction timeout (30 seconds)
};

/**
 * Extract property data from a URL
 *
 * This function uses a multi-step approach to extract property data:
 * 1. SerpAPI to find a Realtor.com URL for the property (if enabled)
 * 2. Direct scraping with Puppeteer on either the Realtor.com URL or original URL
 * 3. Fallback to URL analysis if scraping fails
 *
 * @param url The URL of the property listing
 * @returns The extracted property data
 */
export async function extractPropertyFromUrl(
  url: string,
): Promise<PropertyAIData> {
  if (!url) {
    throw new Error("URL is required");
  }

  // Check for a valid URL format
  if (!url.match(/^https?:\/\//i)) {
    throw new Error(
      "Invalid URL format. Please provide a complete URL starting with http:// or https://",
    );
  }

  console.log(`Extracting property data from URL: ${url}`);

  try {
    // Track extraction method for metadata

    // Step 1: For Zillow and other heavily protected sites, try to get a Realtor.com URL first
    if (true) {
      console.log(`Using SerpAPI to find a Realtor.com URL for: ${url}`);

      try {
        const propertyDescription = await processPropertyWithSerpApi(url);

        if (propertyDescription) {
          console.log(
            `✅ Start extraction from description: ${propertyDescription}`,
          );

          try {
            // Try to extract from Extraction site URL
            let propertyData = await extractPropertyWithPuppeteer(
              url, //Original url
              propertyDescription,
            );

            // Normalize the data to ensure numeric fields are properly converted
            propertyData = normalizePropertyData(propertyData);

            // Add original URL as the source and include metadata
            return {
              ...propertyData,
            };
          } catch (realtorExtractionError) {
            console.error(
              "Extraction from Realtor.com URL failed:",
              realtorExtractionError,
            );
            console.log("Falling back to original URL extraction");
          }
        } else {
          console.log(
            "No Realtor.com URL found via SerpAPI, proceeding with direct extraction",
          );
        }
      } catch (serpApiError) {
        console.error("SerpAPI step failed:", serpApiError);
        console.log("Proceeding with direct URL extraction");
      }
    }
    throw new Error("No extraction strategy succeeded"); // ⬅️ add this line to throw an error if no extraction strategy succeeded
  } catch (error) {
    console.error("Error in property URL extraction:", error);

    // Return minimal property data with just the URL, allowing agent to fill in details later
    const minimalPropertyData: PropertyAIData = {
      address: "",
      bedrooms: null,
      bathrooms: null,
      price: null,
      description: "Property details pending - to be filled by agent",
      listingAgentName: "",
      listingAgentPhone: "",
      listingAgentEmail: "",
      listingAgentCompany: "",
      listingAgentLicenseNo: "",
      propertyUrl: url
    };

    return minimalPropertyData;
  }
}

/**
 * Determine if we should use SerpAPI for this URL based on the domain
 *
 * @param url The URL to check
 * @returns True if SerpAPI should be used for this domain
 */
function shouldUseSerpApi(url: string): boolean {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();

    // Sites with strong anti-bot protection that warrant using SerpAPI
    const stronglyProtectedSites = [
      "zillow.com",
      "www.zillow.com",
      "trulia.com",
      "www.trulia.com",
      "redfin.com",
      "www.redfin.com",
      "compass.com",
      "www.compass.com",
    ];

    // Don't use SerpAPI if we're already on Realtor.com
    if (hostname.includes("realtor.com")) {
      return false;
    }

    // Check if this is a site with strong protection
    return stronglyProtectedSites.some((site) => hostname.includes(site));
  } catch (error) {
    console.error("Error checking URL for SerpAPI:", error);
    return false;
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
              cityFromUrl = segments[segments.length - 2].replace(/-/g, " ");
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
    const apiResult = JSON.parse(response.choices[0].message.content || "{}");

    // Ensure we have the minimum required data
    const propertyData: PropertyAIData = {
      address: apiResult.address || addressFromUrl || "Address unavailable",
      bedrooms: apiResult.bedrooms || null,
      bathrooms: apiResult.bathrooms || null,
      price: apiResult.price || null,
      description: apiResult.description || "Property information extracted from URL",
      listingAgentName: apiResult.listingAgentName || "",
      listingAgentPhone: apiResult.listingAgentPhone || "",
      listingAgentEmail: apiResult.listingAgentEmail || "",
      listingAgentCompany: apiResult.listingAgentCompany || "",
      listingAgentLicenseNo: apiResult.listingAgentLicenseNo || "",
      propertyUrl: url
    };

    return propertyData;
  } catch (error) {
    console.error("URL analysis method failed:", error);
    throw error;
  }
}
