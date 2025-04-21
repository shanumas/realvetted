import OpenAI from "openai";
import axios from "axios";
import { getJson } from "serpapi";
import { PropertyAIData } from "@shared/types";

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

    // ===== STEP 1: Try to use SerpAPI to search for property information =====
    let propertyData: Partial<PropertyAIData> = {};
    let agentData: Partial<PropertyAIData> = {};
    
    // Only attempt SerpAPI if we have a key
    if (serpApiKey) {
      try {
        console.log("Using SerpAPI to search for property information...");
        
        // Construct a search query based on the URL and extracted address
        const searchQuery = addressFromUrl
          ? `${addressFromUrl} ${cityFromUrl} ${stateFromUrl} ${zipFromUrl} real estate listing`
          : `${url} real estate listing details`;
          
        // Search for property information using SerpAPI
        const searchResults = await getJson({
          engine: "google",
          q: searchQuery,
          api_key: serpApiKey,
          num: 10
        });
        
        // Extract organic results from search response
        const organicResults = searchResults?.organic_results || [];
        
        // If we have results, use OpenAI to extract property information from them
        if (organicResults.length > 0) {
          console.log(`Found ${organicResults.length} search results for property`);
          
          // Create a prompt with the search results
          const organicContent = organicResults
            .map((result: SerpApiResult, index: number) => 
              `Result ${index+1}:\nTitle: ${result.title || ""}\nLink: ${result.link || ""}\nSnippet: ${result.snippet || ""}`
            )
            .join("\n\n");
          
          const propertyPrompt = `
            I'm trying to extract property listing information about a real estate property.
            
            Property URL: ${url}
            
            Based on these search results, extract as much information as possible about this property:
            
            ${organicContent}
            
            Extract the following details:
            1. Property address, city, state, zip code
            2. Property type (house, condo, etc.)
            3. Number of bedrooms and bathrooms
            4. Square footage
            5. Price
            6. Year built
            7. Description
            8. Features/amenities
            
            Format as JSON with these fields:
            {
              "address": "street address",
              "city": "city name",
              "state": "state code",
              "zip": "zip code",
              "propertyType": "type of property",
              "bedrooms": number of bedrooms,
              "bathrooms": number of bathrooms,
              "squareFeet": square footage as number,
              "price": price as number without currency symbols,
              "yearBuilt": year built as number,
              "description": "brief description",
              "features": ["feature1", "feature2", ...]
            }
            
            If a field can't be determined, use null.
          `;
          
          // Call OpenAI to extract property data
          const propertyResponse = await openai.chat.completions.create({
            model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024
            messages: [
              {
                role: "system",
                content: "You are a real estate data extraction expert. Extract relevant property information from search results."
              },
              { role: "user", content: propertyPrompt }
            ],
            response_format: { type: "json_object" }
          });
          
          // Parse property data
          propertyData = JSON.parse(propertyResponse.choices[0].message.content || "{}");
          console.log("Successfully extracted property data from search results");
          
          // ===== STEP 2: Search for listing agent information =====
          // Only search for agent if we have some property data
          if (Object.keys(propertyData).length > 0) {
            // Create agent search query
            const agentQuery = `${addressFromUrl || propertyData.address || url} 
              real estate listing agent contact info ${cityFromUrl || propertyData.city || ""} 
              ${stateFromUrl || propertyData.state || ""}`;
            
            // Search for agent information
            const agentSearchResults = await getJson({
              engine: "google",
              q: agentQuery,
              api_key: serpApiKey,
              num: 5
            });
            
            const agentResults = agentSearchResults?.organic_results || [];
            
            if (agentResults.length > 0) {
              console.log(`Found ${agentResults.length} search results for listing agent`);
              
              // Create a prompt with the agent search results
              const agentContent = agentResults
                .map((result: SerpApiResult, index: number) => 
                  `Result ${index+1}:\nTitle: ${result.title || ""}\nLink: ${result.link || ""}\nSnippet: ${result.snippet || ""}`
                )
                .join("\n\n");
              
              const agentPrompt = `
                I'm trying to find the listing agent information for this property:
                
                Property: ${propertyData.address || addressFromUrl} ${propertyData.city || cityFromUrl} ${propertyData.state || stateFromUrl}
                URL: ${url}
                
                Based on these search results, extract the listing agent's information:
                
                ${agentContent}
                
                Extract the following details:
                1. Agent's full name
                2. Phone number
                3. Email address
                4. Real estate company/brokerage
                5. License number (often in format like "DRE #12345678")
                
                Format as JSON with these fields:
                {
                  "sellerName": "agent's name",
                  "sellerPhone": "agent's phone",
                  "sellerEmail": "agent's email",
                  "sellerCompany": "agent's company",
                  "sellerLicenseNo": "license number"
                }
                
                If a field can't be determined, use null.
              `;
              
              // Call OpenAI to extract agent data
              const agentResponse = await openai.chat.completions.create({
                model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024
                messages: [
                  {
                    role: "system",
                    content: "You are a real estate data extraction expert. Extract listing agent information from search results."
                  },
                  { role: "user", content: agentPrompt }
                ],
                response_format: { type: "json_object" }
              });
              
              // Parse agent data
              agentData = JSON.parse(agentResponse.choices[0].message.content || "{}");
              console.log("Successfully extracted agent data from search results");
            }
          }
        }
      } catch (error) {
        console.error("Error using SerpAPI for search:", error);
        console.log("Falling back to URL-only extraction");
      }
    }

    // ===== STEP 3: Fallback approach with direct HTML fetching =====
    // Only do this if we don't have good data from SerpAPI
    if (
      !propertyData.address ||
      !propertyData.bedrooms ||
      !propertyData.bathrooms ||
      !propertyData.price
    ) {
      console.log("Falling back to direct HTML fetching...");
      // Try to fetch the listing page HTML directly
      try {
        const response = await axios.get(url, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml"
          },
          timeout: 10000
        });
        
        const htmlContent = response.data;
        console.log(`Successfully fetched HTML content (${htmlContent.length} bytes)`);
        
        // Use OpenAI to analyze the HTML content
        const htmlPrompt = `
          I have the HTML content from a real estate listing page.
          
          URL: ${url}
          
          HTML Content (first 15000 chars): ${htmlContent.substring(0, 15000)}...
          
          Extract the following property details:
          1. Full Address (street, city, state, zip)
          2. Property Type (Single Family, Condo, etc.)
          3. Number of Bedrooms
          4. Number of Bathrooms
          5. Square Footage
          6. Price
          7. Year Built
          8. Description
          9. Features/Amenities
          10. Listing Agent's Name
          11. Agent's Phone Number
          12. Agent's Email Address
          13. Agent's Real Estate Company
          14. Agent's License Number
          
          Format as JSON with these fields:
          {
            "address": "street address",
            "city": "city name",
            "state": "state code",
            "zip": "zip code",
            "propertyType": "type of property",
            "bedrooms": number of bedrooms,
            "bathrooms": number of bathrooms,
            "squareFeet": square footage as number,
            "price": price as number without currency symbols,
            "yearBuilt": year built as number,
            "description": "brief description",
            "features": ["feature1", "feature2", ...],
            "sellerName": "agent's name",
            "sellerPhone": "agent's phone",
            "sellerEmail": "agent's email",
            "sellerCompany": "agent's company",
            "sellerLicenseNo": "license number"
          }
          
          If a field can't be determined, use null.
        `;
        
        const htmlResponse = await openai.chat.completions.create({
          model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024
          messages: [
            {
              role: "system",
              content: "You are a real estate data extraction expert. Extract information from HTML content."
            },
            { role: "user", content: htmlPrompt }
          ],
          response_format: { type: "json_object" }
        });
        
        // Parse HTML extraction results
        const htmlData = JSON.parse(htmlResponse.choices[0].message.content || "{}");
        console.log("Successfully extracted data from HTML content");
        
        // Merge with previous data, prioritizing HTML extraction results
        propertyData = { ...propertyData, ...htmlData };
        if (htmlData.sellerName) agentData.sellerName = htmlData.sellerName;
        if (htmlData.sellerPhone) agentData.sellerPhone = htmlData.sellerPhone;
        if (htmlData.sellerEmail) agentData.sellerEmail = htmlData.sellerEmail;
        if (htmlData.sellerCompany) agentData.sellerCompany = htmlData.sellerCompany;
        if (htmlData.sellerLicenseNo) agentData.sellerLicenseNo = htmlData.sellerLicenseNo;
        
      } catch (error) {
        console.error("Error fetching URL content:", error);
        console.log("Direct HTML extraction failed, using URL-only analysis");
      }
    }

    // ===== STEP 4: URL-only analysis as final fallback =====
    if (!propertyData.address) {
      console.log("Analyzing URL pattern as final fallback...");
      // Use URL structure for basic info
      propertyData.address = addressFromUrl || "Address information unavailable";
      propertyData.city = cityFromUrl || null;
      propertyData.state = stateFromUrl || null;
      propertyData.zip = zipFromUrl || null;
    }

    // ===== STEP 5: Find agent email if not available =====
    if (!agentData.sellerEmail && agentData.sellerName) {
      console.log("No seller email found, searching web for agent email...");
      agentData.sellerEmail = await findAgentEmailFromWeb(agentData.sellerName, agentData.sellerCompany);
    } else if (!agentData.sellerEmail) {
      console.log("No agent information available, unable to determine email");
      // Leave as undefined/null rather than using hardcoded fallback
    }

    // ===== STEP 6: Combine all data and return final result =====
    const result: PropertyAIData = {
      // Property data
      address: propertyData.address || addressFromUrl || "Address information unavailable",
      city: propertyData.city || cityFromUrl || null,
      state: propertyData.state || stateFromUrl || null,
      zip: propertyData.zip || zipFromUrl || null,
      propertyType: propertyData.propertyType || null,
      bedrooms: propertyData.bedrooms || null,
      bathrooms: propertyData.bathrooms || null,
      squareFeet: propertyData.squareFeet || null,
      price: propertyData.price || null,
      yearBuilt: propertyData.yearBuilt || null,
      description: propertyData.description || null,
      features: propertyData.features || [],
      
      // Agent data
      sellerName: agentData.sellerName || null,
      sellerPhone: agentData.sellerPhone || null,
      sellerEmail: agentData.sellerEmail || "", // Don't use hardcoded fallback email
      sellerCompany: agentData.sellerCompany || null,
      sellerLicenseNo: agentData.sellerLicenseNo || null,
      
      // URL info
      propertyUrl: url,
      imageUrls: propertyData.imageUrls || []
    };

    console.log("Successfully extracted property data with scraper");
    return result;
  } catch (error) {
    console.error("Property scraping error:", error);
    throw new Error(
      `Failed to scrape property details: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

/**
 * Find an agent's email by searching for them on the web
 * Returns an empty string if unable to find their email
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
      console.log("Cannot search for agent email (no API key)");
      return "";
    }

    // Only try SerpAPI if we have a key
    if (serpApiKey) {
      try {
        // Clean agent name for searching
        const cleanAgentName = agentName.replace(/[^\w\s]/gi, '');
        
        // Create search query for the agent's contact info
        const agentQuery = `${cleanAgentName} real estate agent ${agentCompany || ""} contact email`;
        console.log(`Searching for agent email with query: "${agentQuery}"`);
        
        // Search using SerpAPI
        const agentSearchResults = await getJson({
          engine: "google",
          q: agentQuery,
          api_key: serpApiKey,
          num: 5
        });
        
        const results = agentSearchResults?.organic_results || [];
        
        if (results.length > 0) {
          // Create a prompt with search results
          const resultsContent = results
            .map((result: SerpApiResult, index: number) => 
              `Result ${index+1}:\nTitle: ${result.title || ""}\nLink: ${result.link || ""}\nSnippet: ${result.snippet || ""}`
            )
            .join("\n\n");
          
          const emailPrompt = `
            I'm trying to find the professional email address for this real estate agent:
            
            Agent Name: ${cleanAgentName}
            Company/Brokerage: ${agentCompany || "Unknown"}
            
            Based on these search results, extract the most likely email address:
            
            ${resultsContent}
            
            If you can find an email address in the results, provide it.
            If no email is found, make a best guess based on common patterns:
            - first.last@company.com
            - firstinitial.last@company.com
            - first@company.com
            
            Return ONLY the email address, nothing else. If you cannot find an email with high confidence, respond with "no_email_found"
          `;
          
          // Call OpenAI to extract email
          const emailResponse = await openai.chat.completions.create({
            model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024
            messages: [
              {
                role: "system", 
                content: "You are an assistant that helps find email addresses for real estate professionals."
              },
              { role: "user", content: emailPrompt }
            ]
          });
          
          // Extract email from response
          const suggestedEmail = emailResponse.choices[0].message.content?.trim();
          
          // Validate email format
          if (suggestedEmail && suggestedEmail.includes("@") && !suggestedEmail.includes(" ")) {
            console.log(`Found potential email for agent ${agentName}: ${suggestedEmail}`);
            return suggestedEmail;
          }
        }
      } catch (error) {
        console.error("Error using SerpAPI for agent email search:", error);
      }
    }
    
    // Fallback to OpenAI simulation if SerpAPI failed or isn't available
    const prompt = `
      You are tasked with finding the email address for a real estate agent.
      
      Agent Name: ${agentName}
      Company/Brokerage: ${agentCompany || "Unknown"}
      
      Based on your knowledge of real estate websites and common email formats:
      What's the most likely professional email address for this agent?
      Consider formats like:
      - first.last@company.com
      - firstinitial.last@company.com
      - first@company.com
      
      Return ONLY the email address, nothing else. If you cannot find an email with high confidence, respond with "no_email_found"
    `;
    
    // Call OpenAI
    const response = await openai.chat.completions.create({
      model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024
      messages: [
        {
          role: "system",
          content: "You are an assistant that helps find email addresses for real estate professionals."
        },
        { role: "user", content: prompt }
      ]
    });
    
    // Extract email from response
    const suggestedEmail = response.choices[0].message.content?.trim();
    
    // Validate email format
    if (suggestedEmail && suggestedEmail.includes("@") && !suggestedEmail.includes(" ")) {
      console.log(`Found potential email for agent ${agentName}: ${suggestedEmail}`);
      return suggestedEmail;
    }

    // If we couldn't get a good email, return empty string
    console.log(`No valid email found for agent ${agentName}`);
    return "";
  } catch (error) {
    console.error("Error finding agent email:", error);
    // Return empty string in case of any errors
    return "";
  }
}