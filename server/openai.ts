import OpenAI from "openai";
import pdfParse from "pdf-parse";
import { PropertyAIData, PropertyScraperResult, Property, User } from "@shared/types";

// Initialize OpenAI API client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY, // This will take API key from environment variable
});

/**
 * Extract data from ID documents
 */
export interface ExtractedIDData {
  firstName?: string;
  lastName?: string;
  dateOfBirth?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  zip?: string;
  idNumber?: string;
  expirationDate?: string;
}

/**
 * Extract data from pre-qualification documents
 */
export interface PrequalificationData {
  documentType?: string;
  buyerName?: string;
  firstName?: string;
  lastName?: string;
  lenderName?: string;
  loanAmount?: string;
  loanType?: string;
  approvalDate?: string;
  expirationDate?: string;
}

/**
 * Create fallback property data when extraction fails
 */
function createFallbackPropertyData(address: string): PropertyAIData {
  return {
    address: address || "Address could not be extracted",
    city: null,
    state: null,
    zip: null,
    propertyType: "Unknown",
    bedrooms: null,
    bathrooms: null,
    squareFeet: null,
    price: null,
    yearBuilt: null,
    description: "Property information could not be extracted",
    features: [],
    sellerName: "",
    sellerPhone: "",
    sellerEmail: "",
    sellerCompany: "",
    sellerLicenseNo: "",
    propertyUrl: "",
    imageUrls: [],
  };
}

/**
 * Extract property data from HTML content
 */
export async function extractPropertyData(
  htmlContent: string,
  url?: string,
): Promise<PropertyAIData> {
  if (!htmlContent || htmlContent.trim().length < 100) {
    throw new Error("HTML content is too short or empty");
  }

  try {
    // If no API key, return fallback data (avoiding any fake data)
    if (
      !process.env.OPENAI_API_KEY ||
      process.env.OPENAI_API_KEY === "dummy_key_for_development"
    ) {
      console.log("No OpenAI API key provided, returning empty property data");
      return createFallbackPropertyData(url || "Unknown address");
    }

    console.log("Extracting property data from HTML content...");

    // Take the first 15000 characters to stay within API limits
    const truncatedHtml = htmlContent.substring(0, 15000);

    // Create a prompt to extract property details from HTML
    const prompt = `
      Extract real estate property details from this HTML snippet. Return ONLY a JSON object with the following structure:
      {
        "address": "full street address",
        "city": "city name",
        "state": "state abbreviation",
        "zip": "zip code",
        "propertyType": "home type (single family, condo, etc)",
        "bedrooms": number of bedrooms,
        "bathrooms": number of bathrooms,
        "squareFeet": square footage as a number,
        "price": "listing price with dollar sign",
        "yearBuilt": year built as a number,
        "description": "brief property description",
        "features": ["feature1", "feature2", ...],
        "sellerName": "listing agent name",
        "sellerPhone": "listing agent phone",
        "sellerEmail": "listing agent email",
        "sellerCompany": "listing agent brokerage",
        "sellerLicenseNo": "license number if available"
      }
      
      DO NOT include any explanations or markdown syntax, just the JSON. If a field cannot be determined, use null.
      
      HTML:
      ${truncatedHtml}
    `;

    const response = await openai.chat.completions.create({
      model: "gpt-4o", // Using the latest model for better extraction
      messages: [
        {
          role: "system",
          content:
            "You are a specialized data extraction system that pulls real estate listing information from HTML content. Extract data accurately and provide only the requested JSON output.",
        },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
    });

    const content = response.choices[0].message.content;
    if (!content) {
      throw new Error("Empty response from OpenAI");
    }

    // Parse the JSON response
    const extractedData = JSON.parse(content);

    // Construct and return the property data
    const propertyData: PropertyAIData = {
      address: extractedData.address || "Address unavailable",
      city: extractedData.city || null,
      state: extractedData.state || null,
      zip: extractedData.zip || null,
      propertyType: extractedData.propertyType || "Unknown",
      bedrooms: extractedData.bedrooms || null,
      bathrooms: extractedData.bathrooms || null,
      squareFeet: extractedData.squareFeet || null,
      price: extractedData.price || null,
      yearBuilt: extractedData.yearBuilt || null,
      description: extractedData.description || "No description available",
      features: extractedData.features || [],
      sellerName: extractedData.sellerName || "",
      sellerPhone: extractedData.sellerPhone || "",
      sellerEmail: extractedData.sellerEmail || "",
      sellerCompany: extractedData.sellerCompany || "",
      sellerLicenseNo: extractedData.sellerLicenseNo || "",
      propertyUrl: url || "",
      imageUrls: [], // Images would need to be extracted separately
    };

    console.log("Successfully extracted property data from HTML");
    return propertyData;
  } catch (error) {
    console.error("Error extracting property data from HTML:", error);
    // Return minimal fallback data
    return createFallbackPropertyData(url || "Unknown address");
  }
}

/**
 * Extract data from ID documents
 */
export async function extractIDData(
  base64Image: string,
): Promise<ExtractedIDData> {
  try {
    // If no API key, return empty data
    if (
      !process.env.OPENAI_API_KEY ||
      process.env.OPENAI_API_KEY === "dummy_key_for_development"
    ) {
      console.log("No OpenAI API key provided, returning empty ID data");
      return {}; // Empty object, no fake data
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4o", // Using the latest model for better extraction
      messages: [
        {
          role: "system",
          content:
            "You are a specialized data extraction system that extracts information from ID documents.",
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Extract the following information from this ID document:
                1. First Name
                2. Last Name
                3. Date of Birth
                4. Address (Line 1)
                5. Address (Line 2, if present)
                6. City
                7. State
                8. ZIP
                9. ID Number
                10. Expiration Date
                
                Format as a JSON object with these fields: firstName, lastName, dateOfBirth, 
                addressLine1, addressLine2, city, state, zip, idNumber, expirationDate
                
                If any field cannot be clearly determined, return null for that field.`,
            },
            {
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${base64Image}`,
              },
            },
          ],
        },
      ],
      response_format: { type: "json_object" },
    });

    const content = response.choices[0].message.content;
    if (!content) {
      throw new Error("Empty response from OpenAI");
    }

    // Parse the JSON response
    const extractedData = JSON.parse(content);

    return extractedData as ExtractedIDData;
  } catch (error) {
    console.error("Error extracting ID data:", error);
    throw new Error(
      `Failed to extract ID data: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
    );
  }
}

/**
 * Validate pre-qualification document
 */
export async function validatePrequalificationDocument(
  pdfText: string,
): Promise<{ isValid: boolean; data: PrequalificationData }> {
  try {
    // If no API key, use mock for development 
    if (
      !process.env.OPENAI_API_KEY ||
      process.env.OPENAI_API_KEY === "dummy_key_for_development"
    ) {
      console.log("No OpenAI API key provided, returning empty validation");
      return { 
        isValid: false, 
        data: {} // Empty object, no fake data
      };
    }

    const prompt = `
      Analyze the following mortgage pre-qualification letter text. 
      Is this a valid mortgage pre-qualification/pre-approval document?
      
      Extract the following information:
      1. Document Type (Pre-qualification or Pre-approval)
      2. Buyer's full name
      3. First name
      4. Last name
      5. Lender's name
      6. Loan amount
      7. Loan type (conventional, FHA, VA, etc.)
      8. Approval date (when the letter was issued)
      9. Expiration date (if mentioned)
      
      Text:
      ${pdfText}
      
      Return as a JSON object with these fields plus a "isValidDocument" boolean field.
      Format names with proper capitalization.
    `;

    const response = await openai.chat.completions.create({
      model: "gpt-4o", // Using the latest model for better validation
      messages: [
        {
          role: "system",
          content:
            "You are a specialized validation system for mortgage pre-qualification documents.",
        },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
    });

    const content = response.choices[0].message.content;
    if (!content) {
      throw new Error("Empty response from OpenAI");
    }

    // Parse the JSON response
    const result = JSON.parse(content);
    
    // Extract the validation data
    const validationData: PrequalificationData = {
      documentType: result.documentType || null,
      buyerName: result.buyerName || null,
      firstName: result.firstName || null,
      lastName: result.lastName || null,
      lenderName: result.lenderName || null,
      loanAmount: result.loanAmount || null,
      loanType: result.loanType || null,
      approvalDate: result.approvalDate || null,
      expirationDate: result.expirationDate || null,
    };

    return {
      isValid: result.isValidDocument === true,
      data: validationData,
    };
  } catch (error) {
    console.error("Error validating pre-qualification document:", error);
    return {
      isValid: false,
      data: {},
    };
  }
}

/**
 * Verify KYC documents
 */
export async function verifyKYCDocuments(
  idFrontImage: string,
  idBackImage: string,
  selfieImage: string,
): Promise<{
  isMatch: boolean;
  confidence: number;
  details: { [key: string]: any };
}> {
  try {
    // If no API key, return not matched
    if (
      !process.env.OPENAI_API_KEY ||
      process.env.OPENAI_API_KEY === "dummy_key_for_development"
    ) {
      console.log("No OpenAI API key provided, returning no KYC match");
      return {
        isMatch: false,
        confidence: 0,
        details: {},
      };
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4o", // Using the latest model for better verification
      messages: [
        {
          role: "system",
          content:
            "You are a specialized identity verification system. Compare ID documents with a selfie to verify identity.",
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Verify if the person in the selfie matches the person on the ID. Also verify that the front and back images appear to be from the same ID.
              
              Return a JSON object with these fields:
              - isMatch: boolean indicating if the selfie matches the ID
              - confidence: number from 0-100 indicating confidence level
              - details: object with reasons for your determination
              `,
            },
            {
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${idFrontImage}`,
              },
            },
            {
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${idBackImage}`,
              },
            },
            {
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${selfieImage}`,
              },
            },
          ],
        },
      ],
      response_format: { type: "json_object" },
    });

    const content = response.choices[0].message.content;
    if (!content) {
      throw new Error("Empty response from OpenAI");
    }

    // Parse the JSON response
    return JSON.parse(content);
  } catch (error) {
    console.error("Error verifying KYC documents:", error);
    return {
      isMatch: false,
      confidence: 0,
      details: {
        error: error instanceof Error ? error.message : "Unknown verification error",
      },
    };
  }
}

/**
 * Find agents for property
 */
export async function findAgentsForProperty(
  property: Property,
  allAgents: User[],
): Promise<User[]> {
  // Filter for agents only
  const agents = allAgents.filter((user) => user.role === "agent");

  // If we have no or just a few agents, return them all
  if (agents.length <= 3) {
    return agents;
  }

  // Otherwise rank them by expertise
  return rankAgentsByExpertise(property, agents);
}

/**
 * Rank agents by expertise for a specific property
 */
async function rankAgentsByExpertise(
  property: Property,
  agents: User[],
): Promise<User[]> {
  try {
    // If no API key, return unranked list
    if (
      !process.env.OPENAI_API_KEY ||
      process.env.OPENAI_API_KEY === "dummy_key_for_development"
    ) {
      console.log(
        "No OpenAI API key provided, returning unranked agent list",
      );
      return agents;
    }

    // Create agent profiles for the prompt
    const agentProfiles = agents.map(
      (agent) => `
      Agent ID: ${agent.id}
      Name: ${agent.firstName} ${agent.lastName}
      Experience: ${agent.agentYearsExperience || "Unknown"} years
      Specialties: ${agent.agentSpecialties || "General real estate"}
      Recent Sales: ${agent.agentRecentSales || 0}
      Languages: ${agent.agentLanguages || "English"}
      License: ${agent.agentLicenseNumber || "Unknown"}
    `,
    );

    // Create property profile for the prompt
    const propertyProfile = `
      Address: ${property.address}
      City: ${property.city || "Unknown"}
      State: ${property.state || "Unknown"}
      ZIP: ${property.zip || "Unknown"}
      Property Type: ${property.propertyType || "Unknown"}
      Price: ${property.price || "Unknown"}
      Bedrooms: ${property.bedrooms || "Unknown"}
      Bathrooms: ${property.bathrooms || "Unknown"}
      Square Feet: ${property.squareFeet || "Unknown"}
      Year Built: ${property.yearBuilt || "Unknown"}
    `;

    const prompt = `
      Rank the following real estate agents by their suitability for representing a buyer interested in this property:
      
      Property Details:
      ${propertyProfile}
      
      Available Agents:
      ${agentProfiles.join("\n\n")}
      
      Return a ranked list of agent IDs in JSON format, with the most suitable agent first.
      Include a brief reason for each agent's ranking.
      Format as: { "rankedAgents": [{"id": 123, "reason": "explanation"}, {"id": 456, "reason": "explanation"}, ...] }
    `;

    const response = await openai.chat.completions.create({
      model: "gpt-4o", // Using the latest model for better ranking
      messages: [
        {
          role: "system",
          content:
            "You are a specialized real estate agent matching system. Rank agents based on their suitability for specific properties.",
        },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
    });

    const content = response.choices[0].message.content;
    if (!content) {
      throw new Error("Empty response from OpenAI");
    }

    // Parse the JSON response
    const result = JSON.parse(content);
    
    // Map the ranked agent IDs back to the full agent objects
    const rankedAgents: User[] = [];
    
    for (const rankedAgent of result.rankedAgents) {
      const agentId = rankedAgent.id;
      const agent = agents.find(a => a.id === agentId);
      
      if (agent) {
        rankedAgents.push(agent);
      }
    }
    
    // Add any agents that weren't ranked to the end of the list
    const rankedIds = rankedAgents.map(a => a.id);
    const unrankedAgents = agents.filter(a => !rankedIds.includes(a.id));
    
    return [...rankedAgents, ...unrankedAgents];
  } catch (error) {
    console.error("Error ranking agents:", error);
    return agents; // Return unranked list on error
  }
}

// Extract property data from URL using multiple methods
export async function extractPropertyFromUrl(
  url: string,
): Promise<PropertyAIData | null> {
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
    // Check for required API keys
    if (!process.env.OPENAI_API_KEY) {
      console.log("OpenAI API key is missing. Cannot extract property data.");
      throw new Error("OpenAI API key is required for property data extraction");
    }
    
    if (!process.env.SERPAPI_KEY) {
      console.log("SerpAPI key is missing. Cannot extract property data.");
      throw new Error("SerpAPI key is required for property data extraction");
    }

    // Primary method: Use our new SerpAPI-based extraction method
    console.log("Using SerpAPI and OpenAI for property extraction");
    try {
      const { extractPropertyWithSerpApi } = await import(
        "./scrapers/property-serpapi-scraper"
      );
      return await extractPropertyWithSerpApi(url);
    } catch (error) {
      console.error("SerpAPI extraction failed:", error);
      
      // Fallback method: URL analysis with OpenAI
      console.log("Falling back to URL analysis");
      
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
      
      try {
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
          response.choices[0].message.content || "{}",
        );
        
        // Ensure we have the minimum required data
        const propertyData: PropertyAIData = {
          address:
            apiResult.address || addressFromUrl || "Address unavailable",
          city: apiResult.city || cityFromUrl || null,
          state: apiResult.state || stateFromUrl || null,
          zip: apiResult.zip || zipFromUrl || null,
          propertyType: apiResult.propertyType || "Unknown",
          bedrooms: apiResult.bedrooms || null,
          bathrooms: apiResult.bathrooms || null,
          squareFeet: apiResult.squareFeet || null,
          price: apiResult.price || null,
          yearBuilt: apiResult.yearBuilt || null,
          description:
            apiResult.description ||
            "Property information extracted from URL",
          features: apiResult.features || [],
          sellerName: apiResult.sellerName || apiResult.agentName || "",
          sellerPhone: apiResult.sellerPhone || apiResult.agentPhone || "",
          sellerEmail: apiResult.sellerEmail || apiResult.agentEmail || "",
          sellerCompany:
            apiResult.sellerCompany || apiResult.agentCompany || "",
          sellerLicenseNo:
            apiResult.sellerLicenseNo || apiResult.licenseNumber || "",
          propertyUrl: url,
          imageUrls: [],
        };
        
        return propertyData;
      } catch (urlAnalysisError) {
        console.error("URL analysis method failed:", urlAnalysisError);
        throw urlAnalysisError;
      }
    }
  } catch (error) {
    console.error("Error in property URL extraction:", error);
    
    // Create a fallback property result with minimal data but no hardcoded fake data
    const fallbackResult: PropertyAIData = {
      address: "Address could not be extracted",
      city: "",
      state: "",
      zip: "",
      propertyType: "Unknown",
      bedrooms: null,
      bathrooms: null,
      squareFeet: null,
      price: "",
      yearBuilt: null,
      description: "Property information could not be extracted",
      features: [],
      sellerName: "",
      sellerPhone: "",
      sellerEmail: "",
      sellerCompany: "",
      sellerLicenseNo: "",
      propertyUrl: url,
      imageUrls: [],
    };
    
    return fallbackResult;
  }
}

// Export direct URL property extraction for standalone testing
export async function apiExtractPropertyData(
  url: string
): Promise<PropertyAIData> {
  try {
    console.log("Using direct API-based property extraction");
    
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
      response.choices[0].message.content || "{}",
    );
    
    // Ensure we have the minimum required data
    const propertyData: PropertyAIData = {
      address: apiResult.address || addressFromUrl || "Address unavailable",
      city: apiResult.city || cityFromUrl || null,
      state: apiResult.state || stateFromUrl || null,
      zip: apiResult.zip || zipFromUrl || null,
      propertyType: apiResult.propertyType || "Unknown",
      bedrooms: apiResult.bedrooms || null,
      bathrooms: apiResult.bathrooms || null,
      squareFeet: apiResult.squareFeet || null,
      price: apiResult.price || null,
      yearBuilt: apiResult.yearBuilt || null,
      description:
        apiResult.description ||
        "Property information extracted from URL",
      features: apiResult.features || [],
      sellerName: apiResult.sellerName || apiResult.agentName || "",
      sellerPhone: apiResult.sellerPhone || apiResult.agentPhone || "",
      sellerEmail: apiResult.sellerEmail || apiResult.agentEmail || "",
      sellerCompany:
        apiResult.sellerCompany || apiResult.agentCompany || "",
      sellerLicenseNo:
        apiResult.sellerLicenseNo || apiResult.licenseNumber || "",
      propertyUrl: url,
      imageUrls: [],
    };
    
    return propertyData;
  } catch (error) {
    console.error("API-based property extraction error:", error);
    throw error;
  }
}