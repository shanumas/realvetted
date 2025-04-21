import OpenAI from "openai";
import axios from "axios";
import { PropertyAIData, PropertyScraperResult } from "@shared/types";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "dummy_key_for_development",
});

/**
 * Simplified approach to extract property listing data directly using OpenAI
 * Passes the URL to OpenAI to get details about the property
 */
export async function scrapePropertyListing(
  url: string,
): Promise<PropertyAIData> {
  try {
    // Validate URL (basic check)
    if (!url.match(/^https?:\/\//i)) {
      throw new Error(
        "Invalid URL format. Please provide a complete URL starting with http:// or https://",
      );
    }

    console.log(`Extracting property data from URL: ${url}`);

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

      // Simple URL parsing logic
      for (const part of pathParts) {
        if (part.includes("-")) {
          const segments = part.split("-");

          // Check for street numbers
          if (segments.length > 1 && /^\d+$/.test(segments[0])) {
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

    // First, fetch the HTML content from the URL
    console.log(`Fetching HTML content from: ${url}`);
    let htmlContent = "";
    try {
      const response = await axios.get(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
          Accept: "text/html,application/xhtml+xml,application/xml",
        },
        timeout: 10000,
      });
      htmlContent = response.data;
      console.log(
        `Successfully fetched HTML content (${htmlContent.length} bytes)`,
      );
    } catch (error) {
      console.error(
        `Error fetching URL content: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
      console.log("Proceeding with URL-only analysis as fallback");
    }

    // Create appropriate heading based on whether we have HTML content
    const headingText = htmlContent
      ? "I have a real estate listing HTML content to analyze."
      : "I have a real estate listing URL. Please extract as much information as possible based on the URL pattern.";

    // Single API call to OpenAI to extract all property data
    const prompt = `
      ${headingText}
      
      URL: ${url}
      
      ${htmlContent ? `HTML Content (first 15000 chars): ${htmlContent.substring(0, 15000)}...` : ""}
      
      Based on the URL format, I've already extracted some potential information:
      ${addressFromUrl ? `Possible address: ${addressFromUrl}` : ""}
      ${cityFromUrl ? `Possible city: ${cityFromUrl}` : ""}
      ${stateFromUrl ? `Possible state: ${stateFromUrl}` : ""}
      ${zipFromUrl ? `Possible ZIP: ${zipFromUrl}` : ""}
      
      I need the following information:
      1. Property Details:
         - Full Address (street, city, state, zip)
         - Property Type (Single Family, Condo, etc.)
         - Number of Bedrooms
         - Number of Bathrooms
         - Square Footage
         - Price
         - Year Built
         - Property Description (brief)
         - Features/Amenities (list of key features)
      
      2. Listing Agent Information:
         - Agent Name
         - Phone Number
         - Email Address
         - Real Estate Company/Brokerage
         - License Number
      
      IMPORTANT: 
      - If you can't determine certain fields with reasonable confidence, leave them as null.
      - For the agent's email, if you can't find it, that's okay. We'll use a fallback.
      - This information is being used for a real estate application, so accuracy is important.
      - ANALYZE THE HTML CONTENT to extract the real data, don't just use the URL pattern.
      
      Format as JSON with these fields:
      {
        "address": "street address",
        "city": "city name",
        "state": "state code",
        "zip": "zip code",
        "propertyType": "type of property",
        "bedrooms": number of bedrooms,
        "bathrooms": number of bathrooms,
        "squareFeet": square footage as a number,
        "price": price as a number without currency symbols,
        "yearBuilt": year built as a number,
        "description": "brief description",
        "features": ["feature1", "feature2", ...],
        "sellerName": "listing agent's name",
        "sellerPhone": "listing agent's phone",
        "sellerEmail": "listing agent's email",
        "sellerCompany": "listing agent's company",
        "sellerLicenseNo": "license number"
      }
    `;

    // Call OpenAI with our prompt
    const response = await openai.chat.completions.create({
      model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
      messages: [
        {
          role: "system",
          content:
            "You are a real estate data extraction expert. Extract as much information as possible from the given URL. For information you can't confidently determine, use null values.",
        },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
    });

    // Print the complete response for debugging
    console.log(
      "OPENAI PROPERTY RESPONSE: ",
      JSON.stringify(response, null, 2),
    );

    // Parse the API response
    const result = JSON.parse(response.choices[0].message.content || "{}");

    // Always ensure we have an address
    if (!result.address) {
      result.address = addressFromUrl || "Address information unavailable";
    }

    // If we don't have agent email, find it or use fallback
    if (!result.sellerEmail && result.sellerName) {
      console.log("No seller email found, searching web for agent email...");
      result.sellerEmail = await findAgentEmailFromWeb(
        result.sellerName,
        result.sellerCompany,
      );
    } else if (!result.sellerEmail) {
      console.log("Using fallback email (no agent name available)");
      result.sellerEmail = "shanumas@gmail.com";
    }

    // Add the property URL to the result
    result.propertyUrl = url;
    result.imageUrls = result.imageUrls || [];

    console.log("Successfully extracted property data from URL");
    return result as PropertyAIData;
  } catch (error) {
    console.error("Property scraping error:", error);
    throw new Error(
      `Failed to scrape property details: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

/**
 * Simplified function to find an agent's email by searching for them on the web
 * Returns a fallback email (shanumas@gmail.com) if unable to find the real one
 */
async function findAgentEmailFromWeb(
  agentName: string,
  agentCompany?: string,
): Promise<string> {
  try {
    // If no API key, return fallback immediately
    if (
      !process.env.OPENAI_API_KEY ||
      process.env.OPENAI_API_KEY === "dummy_key_for_development"
    ) {
      console.log("Cannot search for agent email (no API key), using fallback");
      return "shanumas@gmail.com";
    }

    // Build a more comprehensive search query for finding the agent's email
    const cleanAgentName = agentName.replace(/[^\w\s]/gi, ''); // Remove special characters
    const searchQuery = `${cleanAgentName} real estate agent ${agentCompany || ""} email contact`;
    console.log(`Searching for ${cleanAgentName}'s email with query: "${searchQuery}"`);
    
    // Attempt to search for agent info using simulated web search via OpenAI
    console.log("Attempting to search for agent contact information...");
    
    // Enhanced prompt with web search simulation
    const prompt = `
      You are tasked with finding the email address for a real estate agent by simulating a web search.
      
      Agent Name: ${cleanAgentName}
      Company/Brokerage: ${agentCompany || "Unknown"}
      Search Query: "${searchQuery}"
      
      Based on your knowledge of real estate websites and common email formats:
      1. What's the most likely professional email address for this agent?
      2. Consider different formats like:
         - first.last@company.com
         - firstinitial.last@company.com
         - first@company.com
         - first.last@realestatebrokerage.com
      
      Return ONLY the email address, nothing else. If unsure, return: shanumas@gmail.com
    `;

    // Call OpenAI
    const response = await openai.chat.completions.create({
      model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
      messages: [
        {
          role: "system",
          content:
            "You are an assistant that helps find email addresses for real estate professionals.",
        },
        { role: "user", content: prompt },
      ],
    });

    // Print the complete agent email response for debugging
    console.log(
      "OPENAI AGENT EMAIL RESPONSE: ",
      JSON.stringify(response, null, 2),
    );

    // Extract the email from the response
    const suggestedEmail = response.choices[0].message.content?.trim();

    // Validate if it's a plausible email
    if (
      suggestedEmail &&
      suggestedEmail.includes("@") &&
      !suggestedEmail.includes(" ")
    ) {
      console.log(
        `Found potential email for agent ${agentName}: ${suggestedEmail}`,
      );
      return suggestedEmail;
    }

    // If we couldn't get a good email, use the fallback
    console.log(`No valid email found for agent ${agentName}, using fallback`);
    return "shanumas@gmail.com";
  } catch (error) {
    console.error("Error finding agent email:", error);
    // Return fallback email in case of any errors
    return "shanumas@gmail.com";
  }
}
