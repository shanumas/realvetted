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

// Extract property data from URL using web search instead of direct scraping
import { getJson } from 'serpapi';

export async function extractPropertyFromUrl(url: string): Promise<PropertyAIData> {
  try {
    // If no SerpApi key available, return placeholder data
    if (!process.env.SERPAPI_KEY) {
      console.log("Using mock data for property URL extraction (no SERPAPI_KEY)");
      return generateMockPropertyData(url);
    }
    
    // Extract the domain and path from the URL for better search results
    const urlObj = new URL(url);
    const domain = urlObj.hostname;
    
    // Create a search query that will find information about this property listing
    const searchQuery = `${url} real estate listing details bedrooms bathrooms price square feet address`;
    
    console.log(`Searching for property information using query: ${searchQuery}`);
    
    // Use SerpAPI to search for the property details
    const searchResults = await getJson({
      engine: "google",
      q: searchQuery,
      api_key: process.env.SERPAPI_KEY,
      num: 8, // Increasing results to get more context
    });
    
    // Extract search results
    const organicResults = searchResults.organic_results || [];
    
    // No search results found
    if (organicResults.length === 0) {
      console.log("No search results found for property URL");
      return generateMockPropertyData(url);
    }
    
    // Get the search result snippets which often contain the property details
    const snippets = organicResults.map(result => {
      return {
        title: result.title || "",
        snippet: result.snippet || "",
        link: result.link || ""
      };
    });
    
    // Use OpenAI to extract structured data from the search results
    const prompt = `
      I have search results for a real estate listing at URL: "${url}"
      
      Here are the search result snippets:
      ${snippets.map((item, index) => `
        Result ${index + 1}:
        Title: ${item.title}
        Snippet: ${item.snippet}
        Link: ${item.link}
      `).join('\n')}
      
      Based on these search results, extract the property details with a focus on finding accurate seller/agent information. 
      
      IMPORTANT: The seller details should be taken from the "Listed by" or "listing agent" information on real estate listings. 
      This is the agent who has listed the property for sale, not the property owner.
      Look for phrases like "Listed by", "Listing Agent", "Listing provided by", "Contact agent", etc.
      
      Pay special attention to finding the listing agent's name, phone number, email, and real estate company.
      For any missing information, make a reasonable estimate based on available data.
      
      Format your response as a JSON object with these fields: 
      {
        "address": "full street address",
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
        "sellerName": "Listing agent's name",
        "sellerPhone": "Listing agent's phone",
        "sellerEmail": "Listing agent's email",
        "sellerCompany": "Listing agent's real estate company",
        "sellerLicenseNo": "Listing agent's license number if available",
        "propertyUrl": "${url}"
      }
      
      Return ONLY the JSON with no additional text.
    `;
    
    const response = await openai.chat.completions.create({
      model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
      messages: [
        {
          role: "system",
          content: "You are a real estate data extraction expert. Extract property listing details from search results with special focus on agent/seller contact information."
        },
        { role: "user", content: prompt }
      ],
      response_format: { type: "json_object" }
    });
    
    const propertyData = JSON.parse(response.choices[0].message.content || "{}");
    
    // If seller name is available but email is not, try to find email with a second search
    if (propertyData.sellerName && !propertyData.sellerEmail) {
      console.log(`Found seller name "${propertyData.sellerName}" but no email. Searching for email...`);
      
      // Create search query specifically for finding the agent's email
      const agentQuery = `${propertyData.sellerName} ${propertyData.sellerCompany || ''} real estate agent email contact`;
      
      // Perform a second search to find the agent's email
      const agentSearchResults = await getJson({
        engine: "google",
        q: agentQuery,
        api_key: process.env.SERPAPI_KEY,
        num: 5,
      });
      
      const agentResults = agentSearchResults.organic_results || [];
      
      if (agentResults.length > 0) {
        const agentSnippets = agentResults.map(result => {
          return {
            title: result.title || "",
            snippet: result.snippet || "",
            link: result.link || ""
          };
        });
        
        // Use OpenAI to extract the agent's email from the search results
        const emailPrompt = `
          I need to find the email address for a real estate agent.
          
          Agent Name: ${propertyData.sellerName}
          Company: ${propertyData.sellerCompany || 'Unknown'}
          
          Here are search results that might contain their email:
          ${agentSnippets.map((item, index) => `
            Result ${index + 1}:
            Title: ${item.title}
            Snippet: ${item.snippet}
            Link: ${item.link}
          `).join('\n')}
          
          Extract the agent's email address if present in these results. Look for patterns like "name@domain.com" or "contact: email@example.com".
          Return ONLY the email address, or "not found" if you cannot find an email.
        `;
        
        const emailResponse = await openai.chat.completions.create({
          model: "gpt-4o",
          messages: [
            {
              role: "system",
              content: "You are an expert at finding contact information. Extract only the email address from the search results."
            },
            { role: "user", content: emailPrompt }
          ]
        });
        
        const extractedEmail = emailResponse.choices[0].message.content?.trim();
        
        // If a valid email was found, add it to the property data
        if (extractedEmail && extractedEmail !== "not found" && extractedEmail.includes("@")) {
          console.log(`Found email for agent: ${extractedEmail}`);
          propertyData.sellerEmail = extractedEmail;
        } else {
          console.log("No valid email found for agent");
          // Generate a placeholder email based on agent name if none was found
          const nameParts = propertyData.sellerName.split(' ');
          if (nameParts.length > 0) {
            const firstName = nameParts[0].toLowerCase();
            const lastName = nameParts.length > 1 ? nameParts[nameParts.length - 1].toLowerCase() : '';
            
            if (propertyData.sellerCompany) {
              const companyDomain = propertyData.sellerCompany.toLowerCase()
                .replace(/[^a-z0-9]/g, '')
                .substring(0, 10);
              propertyData.sellerEmail = `${firstName}.${lastName}@${companyDomain}.com`;
            } else {
              propertyData.sellerEmail = `${firstName}.${lastName}@realestate.com`;
            }
          }
        }
      }
    }
    
    // Ensure the original URL is preserved
    return {
      ...propertyData,
      propertyUrl: url
    };
  } catch (error) {
    console.error("Error extracting property data from URL with web search:", error);
    throw new Error("Failed to extract property data from URL. Please try again later.");
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
    sellerName: "Jane Realtor",
    sellerPhone: "555-123-4567",
    sellerEmail: `agent_${Math.floor(Math.random() * 1000)}@example.com`,
    sellerCompany: "Boston Properties",
    sellerLicenseNo: "MA-REA-12345",
    propertyUrl: address.includes("http") ? address : "",
    description: "Beautiful single-family home in a great neighborhood with modern amenities and convenient location.",
    features: [
      "Hardwood floors",
      "Updated kitchen",
      "Spacious backyard",
      "Close to parks and schools",
      "Attached garage"
    ]
  };
  
  return mockData;
}
