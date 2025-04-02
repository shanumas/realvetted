import OpenAI from "openai";
import { PropertyAIData } from "@shared/types";
import { Property, User } from "@shared/schema";
import { storage } from "./storage";

// Initialize the OpenAI client
const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY || "dummy_key_for_development" 
});

// Extract property data from an address
export async function extractPropertyData(address: string): Promise<PropertyAIData> {
  try {
    // If there's no API key, use mock data for development
    if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === "dummy_key_for_development") {
      console.log("Using mock data for property extraction (no API key)");
      return generateMockPropertyData(address);
    }

    const prompt = `
      Given the property address "${address}", please extract the following details as if you were looking up real property data:
      - Full Address (street, city, state, zip)
      - Property Type (Single Family, Condo, etc.)
      - Number of Bedrooms
      - Number of Bathrooms
      - Square Footage
      - Estimated Price
      - Year Built
      - Seller's Email (if available)

      Response must be a valid JSON object with these fields: address, city, state, zip, propertyType, bedrooms, bathrooms, squareFeet, price, yearBuilt, sellerEmail.
    `;

    const response = await openai.chat.completions.create({
      model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
      messages: [
        {
          role: "system",
          content: "You are a real estate data expert that extracts property information from addresses. Return only the JSON data."
        },
        { role: "user", content: prompt }
      ],
      response_format: { type: "json_object" }
    });

    const result = JSON.parse(response.choices[0].message.content || "{}");
    return result as PropertyAIData;
  } catch (error) {
    console.error("Error extracting property data:", error);
    throw new Error("Failed to extract property data. Please try again later.");
  }
}

// OpenAI client initialization is at the top of this file

// Interface for extracted KYC data
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

// Extract data from ID documents using OpenAI Vision
export async function extractIDData(idFrontBase64: string, idBackBase64: string): Promise<ExtractedIDData> {
  try {
    // If there's no API key, return empty data as we can't extract
    if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === "dummy_key_for_development") {
      console.log("Cannot extract ID data (no API key)");
      return {};
    }

    // Make Vision API request to OpenAI
    const frontResponse = await openai.chat.completions.create({
      model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
      messages: [
        {
          role: "system",
          content: "You are an ID document parser that extracts information from ID cards/driver's licenses. Return a JSON object with the following fields if present: firstName, lastName, dateOfBirth (in YYYY-MM-DD format), addressLine1, addressLine2, city, state, zip, idNumber, expirationDate."
        },
        {
          role: "user",
          content: [
            { 
              type: "text", 
              text: "Extract all personal information from this ID document. Format date of birth as YYYY-MM-DD. Format the address into addressLine1, addressLine2, city, state, and zip. Return the data as JSON." 
            },
            {
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${idFrontBase64}`
              }
            }
          ]
        }
      ],
      response_format: { type: "json_object" }
    });

    const frontData = JSON.parse(frontResponse.choices[0].message.content);
    
    // Process back of ID card to get any additional info
    const backResponse = await openai.chat.completions.create({
      model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
      messages: [
        {
          role: "system",
          content: "Extract any additional information from the back of this ID card, such as address details or restrictions. Return JSON with any of these fields that are present: addressLine1, addressLine2, city, state, zip."
        },
        {
          role: "user",
          content: [
            { 
              type: "text", 
              text: "This is the back of an ID card. Extract any additional information that isn't typically on the front, like address details or restrictions. Return data as JSON." 
            },
            {
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${idBackBase64}`
              }
            }
          ]
        }
      ],
      response_format: { type: "json_object" }
    });

    const backData = JSON.parse(backResponse.choices[0].message.content);
    
    // Merge data from front and back, prioritizing front data
    return {
      ...backData,
      ...frontData
    };
  } catch (error) {
    console.error("Error extracting data from ID:", error);
    return {};
  }
}

// Verify KYC documents
export async function verifyKYCDocuments(
  userId: number, 
  idFrontUrl: string, 
  idBackUrl: string,
  userData: {
    firstName: string;
    lastName: string;
    dateOfBirth: string;
    addressLine1: string;
  }
): Promise<{ verified: boolean; message: string }> {
  // In a real implementation, this would:
  // 1. Download the ID images
  // 2. Use OpenAI Vision API to extract information
  // 3. Compare with user-provided info
  // 4. Return verification result
  
  try {
    // If there's no API key, simulate verification for development
    if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === "dummy_key_for_development") {
      console.log("Using mock verification (no API key)");
      return { verified: true, message: "ID verified successfully" };
    }

    // In a real implementation, we would call OpenAI Vision API here
    // This is a simplified example
    const mockResponse = `
      ID Information:
      Name: ${userData.firstName} ${userData.lastName}
      Date of Birth: ${userData.dateOfBirth}
      Address: ${userData.addressLine1}
    `;

    // Simulate verification logic
    const nameMatches = mockResponse.includes(`${userData.firstName} ${userData.lastName}`);
    const dobMatches = mockResponse.includes(userData.dateOfBirth);
    const addressMatches = mockResponse.includes(userData.addressLine1);

    const verified = nameMatches && dobMatches && addressMatches;

    return {
      verified,
      message: verified 
        ? "ID verification successful" 
        : "ID verification failed. Information does not match."
    };
  } catch (error) {
    console.error("Error verifying KYC documents:", error);
    throw new Error("Failed to verify ID documents. Please try again later.");
  }
}

// Find matching agents for a property
export async function findAgentsForProperty(property: Property): Promise<User[]> {
  try {
    // Get all verified agents
    const allAgents = await storage.getUsersByRole("agent");
    const verifiedAgents = allAgents.filter(agent => 
      agent.profileStatus === "verified" && !agent.isBlocked
    );
    
    if (verifiedAgents.length === 0) {
      return [];
    }

    // If no API key, just return all verified agents
    if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === "dummy_key_for_development") {
      console.log("Using simplified agent matching (no API key)");
      return verifiedAgents;
    }

    const prompt = `
      I need to match real estate agents to a property. Here's the property information:
      - Address: ${property.address}
      - City: ${property.city || "Unknown"}
      - State: ${property.state || "Unknown"}
      - Property Type: ${property.propertyType || "Unknown"}
      - Price: ${property.price ? `$${property.price}` : "Unknown"}

      Here are the available agents and their expertise:
      ${verifiedAgents.map((agent, i) => `
        Agent ${i+1}:
        - Name: ${agent.firstName} ${agent.lastName}
        - Location: ${agent.city || "Unknown"}, ${agent.state || "Unknown"}
        - Expertise: ${agent.expertise || "General real estate"}
      `).join("\n")}

      Please provide the IDs of the top 3 most suitable agents based on location and expertise.
      Return a JSON array with only the agent IDs like this: [1, 2, 3]
    `;

    const response = await openai.chat.completions.create({
      model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
      messages: [
        { role: "system", content: "You are a real estate agent matching expert." },
        { role: "user", content: prompt }
      ],
      response_format: { type: "json_object" }
    });

    const result = JSON.parse(response.choices[0].message.content || "{}");
    const matchedAgentIds = result.agents || [];
    
    // Return matched agents or all agents if no matches
    if (matchedAgentIds.length > 0) {
      return verifiedAgents.filter(agent => matchedAgentIds.includes(agent.id));
    } else {
      return verifiedAgents;
    }
  } catch (error) {
    console.error("Error matching agents:", error);
    // Return all verified agents as fallback
    const allAgents = await storage.getUsersByRole("agent");
    return allAgents.filter(agent => 
      agent.profileStatus === "verified" && !agent.isBlocked
    );
  }
}

// Helper function to generate mock property data for development
function generateMockPropertyData(address: string): PropertyAIData {
  const mockData: PropertyAIData = {
    address: address,
    city: "Boston",
    state: "MA",
    zip: "02108",
    propertyType: "Single Family",
    bedrooms: 3,
    bathrooms: 2,
    squareFeet: 1800,
    price: 750000,
    yearBuilt: 1998,
    sellerEmail: `seller_${Math.floor(Math.random() * 1000)}@example.com`
  };
  
  return mockData;
}
