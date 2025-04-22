import axios from "axios";
import OpenAI from "openai";
import { PropertyAIData } from "@shared/types";

// Initialize the OpenAI client
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
// the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user

/**
 * Extract property details using SerpAPI and OpenAI
 * 
 * This function uses SerpAPI to fetch search results about a property URL,
 * then uses OpenAI to extract structured property data from the search results.
 * It then performs another SerpAPI search to find the listing agent's email.
 * 
 * @param url The URL of the property listing
 * @returns Structured property data
 */
export async function extractPropertyWithSerpApi(url: string): Promise<PropertyAIData> {
  try {
    console.log("Extracting property details using SerpAPI for:", url);
    
    // Step 1: Use SerpAPI to search for information about the property URL
    const searchResults = await searchPropertyUrl(url);
    
    // Step 2: Use OpenAI to extract structured data from the search results
    const extractedData = await extractDataWithOpenAI(searchResults, url);
    
    // Step 3: Search for agent email if we have agent name and company
    if (extractedData.listingAgentName && extractedData.listingAgentCompany) {
      const agentEmail = await findAgentEmail(
        extractedData.listingAgentName,
        extractedData.listingAgentCompany
      );
      
      if (agentEmail) {
        extractedData.listingAgentEmail = agentEmail;
      }
    }
    
    return extractedData;
  } catch (error) {
    console.error("Property extraction with SerpAPI failed:", error);
    throw new Error("Failed to extract property data from URL");
  }
}

/**
 * Search for property information using SerpAPI
 * 
 * @param propertyUrl The URL of the property listing
 * @returns The search results from SerpAPI
 */
async function searchPropertyUrl(propertyUrl: string): Promise<any> {
  try {
    // Format the search query to include the URL
    // Using "site:" operator helps find the exact page
    const searchQuery = `${propertyUrl} real estate property listing details`;
    
    // Make the SerpAPI request
    const response = await axios.get("https://serpapi.com/search.json", {
      params: {
        engine: "google",
        q: searchQuery,
        api_key: process.env.SERPAPI_KEY,
        num: 10, // Get more results for better coverage
      }
    });
    
    // Return the full search results
    return response.data;
  } catch (error) {
    console.error("SerpAPI property search failed:", error);
    throw error;
  }
}

/**
 * Extract structured property data from search results using OpenAI
 * 
 * @param searchResults The search results from SerpAPI
 * @param originalUrl The original property URL
 * @returns Structured property data
 */
async function extractDataWithOpenAI(searchResults: any, originalUrl: string): Promise<PropertyAIData> {
  try {
    // Prepare the prompt with the search results
    const organicResults = searchResults.organic_results || [];
    const snippets = organicResults.map((r: any) => r.snippet || "").join("\n\n");
    const title = searchResults.search_metadata?.title || "";
    const description = organicResults[0]?.snippet || "";
    
    // Additional context from knowledge panels or answer boxes if available
    const knowledgePanel = searchResults.knowledge_graph || {};
    const answerBox = searchResults.answer_box || {};
    
    // Construct the full context
    const context = `
URL: ${originalUrl}
Page Title: ${title}
Description: ${description}

Knowledge Panel Data:
${JSON.stringify(knowledgePanel, null, 2)}

Answer Box:
${JSON.stringify(answerBox, null, 2)}

Search Results:
${snippets}
`;

    // Extract structured data using OpenAI
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are a real estate data extraction expert. Extract structured property listing data from the provided information. 
Be as detailed as possible, but do not make up information that is not present in the data.
If a data point is not available, use null or empty string.

Extract the following fields:
- address: Full property address
- city: City name
- state: State or province
- zip: ZIP/Postal code
- propertyType: Type of property (e.g., Single Family, Condo, etc.)
- bedrooms: Number of bedrooms
- bathrooms: Number of bathrooms
- squareFeet: Square footage
- price: Price as a string
- yearBuilt: Year the property was built
- description: Property description
- features: Array of property features
- listingAgentName: Name of listing agent
- listingAgentPhone: Phone number of listing agent
- listingAgentCompany: Real estate company
- listingAgentLicenseNo: License number if available

Return only valid JSON.`
        },
        {
          role: "user",
          content: context
        }
      ],
      response_format: { type: "json_object" }
    });

    // Parse the extracted data
    const extractedData = JSON.parse(response.choices[0].message.content || "{}");
    
    // Create the structured property data
    const propertyData: PropertyAIData = {
      address: extractedData.address || "Address unavailable",
      city: extractedData.city || null,
      state: extractedData.state || null,
      zip: extractedData.zip || null,
      propertyType: extractedData.propertyType || null,
      bedrooms: extractedData.bedrooms || null,
      bathrooms: extractedData.bathrooms || null,
      squareFeet: extractedData.squareFeet || null,
      price: extractedData.price || null,
      yearBuilt: extractedData.yearBuilt || null,
      description: extractedData.description || "No description available",
      features: extractedData.features || [],
      listingAgentName: extractedData.listingAgentName || "",
      listingAgentPhone: extractedData.listingAgentPhone || "",
      listingAgentCompany: extractedData.listingAgentCompany || "",
      listingAgentLicenseNo: extractedData.listingAgentLicenseNo || "",
      listingAgentEmail: "", // Will be populated later if found
      propertyUrl: originalUrl,
      imageUrls: [], // Images would need to be extracted separately
    };
    
    return propertyData;
  } catch (error) {
    console.error("OpenAI extraction failed:", error);
    throw error;
  }
}

/**
 * Find an agent's email using SerpAPI
 * 
 * @param agentName The name of the real estate agent
 * @param agentCompany The name of the real estate company
 * @returns The agent's email address if found, otherwise empty string
 */
async function findAgentEmail(agentName: string, agentCompany: string): Promise<string> {
  try {
    // Craft a specific search query to find the agent's email
    const searchQuery = `${agentName} ${agentCompany} real estate agent email contact`;
    
    // Make the SerpAPI request
    const response = await axios.get("https://serpapi.com/search.json", {
      params: {
        engine: "google",
        q: searchQuery,
        api_key: process.env.SERPAPI_KEY,
        num: 5, // Limit to top results
      }
    });
    
    // Extract the relevant information from the search results
    const organicResults = response.data.organic_results || [];
    const potentialEmailSources = organicResults.map((r: any) => r.snippet || "").join(" ");
    
    // Use a regex pattern to find email addresses in the text
    const emailPattern = /[\w.+-]+@[\w.-]+\.\w+/g;
    const emailMatches = potentialEmailSources.match(emailPattern) || [];
    
    // Return the first found email, or empty string if none found
    return emailMatches.length > 0 ? emailMatches[0] : "";
  } catch (error) {
    console.error("Agent email search failed:", error);
    return ""; // Return empty string on error
  }
}