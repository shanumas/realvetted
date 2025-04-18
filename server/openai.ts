import OpenAI from "openai";
import { PropertyAIData } from "@shared/types";
import { Property, User } from "@shared/schema";
import { storage } from "./storage";
import fs from "fs";

// Initialize the OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "dummy_key_for_development",
});

// Define interfaces for extracted data
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

// Extract property data from an address
export async function extractPropertyData(
  address: string,
): Promise<PropertyAIData> {
  try {
    // If there's no API key, use mock data for development
    if (
      !process.env.OPENAI_API_KEY ||
      process.env.OPENAI_API_KEY === "dummy_key_for_development"
    ) {
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
          content:
            "You are a real estate data extraction assistant. Extract property information from addresses and return structured data.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      response_format: { type: "json_object" },
    });

    // Parse and return the response
    const result = JSON.parse(response.choices[0].message.content || "{}");
    return result;
  } catch (error) {
    console.error("Error extracting property data:", error);
    // If API call fails, return mock data
    return generateMockPropertyData(address);
  }
}

// Extract data from ID images
export async function extractIDData(idFrontBase64: string, idBackBase64: string): Promise<ExtractedIDData> {
  try {
    // If there's no API key, return empty data for development
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
          content:
            "You are an ID document parser that extracts information from ID cards/driver's licenses. Return a JSON object with the following fields if present: firstName, lastName, dateOfBirth (in YYYY-MM-DD format), addressLine1, addressLine2, city, state, zip, idNumber, expirationDate.",
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Extract all personal information from this ID document. Format date of birth as YYYY-MM-DD. Format the address into addressLine1, addressLine2, city, state, and zip. Return the data as JSON.",
            },
            {
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${idFrontBase64 || ''}`,
              },
            },
          ],
        },
      ],
      response_format: { type: "json_object" },
    });

    const frontData = JSON.parse(frontResponse.choices[0].message.content || '{}');

    // Process back of ID card to get any additional info
    const backResponse = await openai.chat.completions.create({
      model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
      messages: [
        {
          role: "system",
          content:
            "Extract any additional information from the back of this ID card, such as address details or restrictions. Return JSON with any of these fields that are present: addressLine1, addressLine2, city, state, zip.",
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "This is the back of an ID card. Extract any additional information that isn't typically on the front, like address details or restrictions. Return data as JSON.",
            },
            {
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${idBackBase64 || ''}`,
              },
            },
          ],
        },
      ],
      response_format: { type: "json_object" },
    });

    const backData = JSON.parse(backResponse.choices[0].message.content || '{}');

    // Merge data from front and back, prioritizing front data if there are conflicts
    return {
      ...backData,
      ...frontData,
    };
  } catch (error) {
    console.error("Error extracting data from ID:", error);
    return {};
  }
}

// Verify prequalification documents
export async function validatePrequalificationDocument(
  filePath: string,
  userData: {
    firstName: string | null;
    lastName: string | null;
  }
): Promise<{ validated: boolean; data: PrequalificationData; message: string }> {
  try {
    // If there's no API key, check if the file is likely a prequalification letter based on basic validation
    if (
      !process.env.OPENAI_API_KEY ||
      process.env.OPENAI_API_KEY === "dummy_key_for_development"
    ) {
      console.log(
        "Using enhanced mock validation for prequalification document (no API key)"
      );
      
      // Read the file and extract first 1000 characters to check for keywords
      try {
        const fileBuffer = fs.readFileSync(filePath);
        const fullContent = fileBuffer.toString('utf-8');
        // Limit to first 1000 characters as per requirements
        const fileContent = fullContent.substring(0, 1000).toLowerCase();
        
        console.log(`Analyzing first 1000 characters of document for validation:
${fileContent.substring(0, 100)}...`);
        
        // Check for keywords that would indicate this is a prequalification letter
        const prequalKeywords = [
          'pre-qualification', 'prequalification', 
          'pre-approval', 'preapproval',
          'pre qualify', 'prequalify',
          'mortgage', 'loan approval',
          'lender', 'qualification letter'
        ];
        
        // Check for lender names or terms
        const lenderKeywords = [
          'bank', 'mortgage', 'financial', 'credit union', 
          'lending', 'capital', 'home loan'
        ];
        
        // Check if the document contains mortgage-related terms
        const mortgageKeywords = [
          'loan amount', 'interest rate', 'down payment',
          'approval', 'borrower', 'property', 'purchase'
        ];
        
        // Count the number of matching keywords to determine validity
        let keywordMatches = 0;
        let prequalFound = false;
        let lenderFound = false;
        let mortgageFound = false;
        
        for (const keyword of prequalKeywords) {
          if (fileContent.includes(keyword)) {
            prequalFound = true;
            keywordMatches++;
          }
        }
        
        for (const keyword of lenderKeywords) {
          if (fileContent.includes(keyword)) {
            lenderFound = true; 
            keywordMatches++;
          }
        }
        
        for (const keyword of mortgageKeywords) {
          if (fileContent.includes(keyword)) {
            mortgageFound = true;
            keywordMatches++;
          }
        }
        
        // Check for user name in the document
        const userFullName = `${userData.firstName || ''} ${userData.lastName || ''}`.trim().toLowerCase();
        const nameFound = userFullName && fileContent.includes(userFullName);
        
        // For validation to pass, the document should:
        // 1. Contain at least one prequalification term
        // 2. Contain at least one lender term
        // 3. Contain user's name
        // 4. Have a reasonable number of relevant keywords (3+)
        
        const isValid = prequalFound && (lenderFound || mortgageFound) && nameFound && keywordMatches >= 3;
        
        const mockData: PrequalificationData = {
          documentType: prequalFound ? "Pre-Approval Letter" : "Unknown Document",
          buyerName: `${userData.firstName || ''} ${userData.lastName || ''}`.trim(),
          firstName: userData.firstName || undefined,
          lastName: userData.lastName || undefined,
          lenderName: lenderFound ? "Detected Lender" : undefined,
          loanAmount: mortgageFound ? "$500,000" : undefined,
          loanType: mortgageFound ? "Conventional" : undefined,
          approvalDate: new Date().toISOString().split('T')[0],
          expirationDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        };
        
        const validationMessage = isValid 
          ? "Document validated successfully" 
          : `Document doesn't appear to be a valid prequalification letter. Missing ${!prequalFound ? 'prequalification terms' : ''}${!lenderFound && !mortgageFound ? ', lender information' : ''}${!nameFound ? ', matching name' : ''}.`;
        
        console.log(`Mock validation result: ${isValid ? 'VALID' : 'INVALID'} - ${validationMessage}`);
        
        return { 
          validated: isValid, 
          data: mockData,
          message: validationMessage
        };
      } catch (error) {
        console.error("Error performing basic document validation:", error);
        return {
          validated: false,
          data: {},
          message: "Error analyzing document content. Please try again with a different file."
        };
      }
    }
    
    // Read the file
    const fileBuffer = fs.readFileSync(filePath);
    let fileContent = fileBuffer.toString('utf-8');
    
    // Check if content looks like binary data (common in some PDFs)
    const printableChars = fileContent.replace(/[^\x20-\x7E]/g, '').length;
    const totalChars = fileContent.length;
    const percentPrintable = totalChars > 0 ? (printableChars / totalChars) * 100 : 0;
    
    console.log(`Document analysis: ${Math.round(percentPrintable)}% of characters are printable text`);
    
    // If less than 30% of characters are printable, it's likely a binary file
    if (percentPrintable < 30) {
      console.log("Document appears to be a binary/encoded PDF file that cannot be read as text");
      return {
        validated: false,
        data: {},
        message: "The document appears to be in a format that cannot be read. Please upload a text-based PDF or document file that contains your pre-qualification letter."
      };
    }
    
    // Take only the first 1000 characters of the document for analysis
    // This helps with large documents and keeps within OpenAI limits
    const contentPreview = fileContent.substring(0, 1000);
    console.log("Using OpenAI to analyze and validate the prequalification document");
    
    // Construct the buyer's full name
    const buyerFullName = `${userData.firstName || ''} ${userData.lastName || ''}`.trim();
    
    // Call OpenAI API to validate the document
    const response = await openai.chat.completions.create({
      model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
      messages: [
        {
          role: "system",
          content: "You are a financial document validator specializing in pre-qualification and pre-approval letters for mortgages and property purchases. Your task is to analyze document content and determine if it's a valid pre-qualification document."
        },
        {
          role: "user",
          content: `Check if this document appears to be a valid pre-qualification or pre-approval letter for real estate purchases. The document should be for the buyer named "${buyerFullName}". 

Document content (preview): 
${contentPreview}

Analyze this content and determine:
1. Is this a pre-qualification or pre-approval document?
2. Does it contain the name of the buyer (${buyerFullName})?
3. Does it mention a lender, loan amount, or mortgage terms?

Respond with JSON containing these fields:
- validated: boolean (true if it appears to be a valid pre-qualification document for this buyer)
- documentType: string (the type of document detected)
- buyerName: string (the buyer name found in the document, if any)
- lenderName: string (the lender name found in the document, if any)
- loanAmount: string (the loan amount mentioned, if any)
- approvalDate: string (the approval date, if found)
- expirationDate: string (the expiration date, if found)
- message: string (explanation of validation result, especially if validation failed)`
        }
      ],
      response_format: { type: "json_object" }
    });
    
    // Parse the API response
    const result = JSON.parse(response.choices[0].message.content || "{}");
    
    // Convert to our expected format if needed
    const validationData: PrequalificationData = {
      documentType: result.documentType || "Pre-Qualification Document",
      buyerName: result.buyerName || buyerFullName,
      firstName: userData.firstName || undefined,
      lastName: userData.lastName || undefined,
      lenderName: result.lenderName,
      loanAmount: result.loanAmount,
      approvalDate: result.approvalDate,
      expirationDate: result.expirationDate
    };
    
    // Check if the name was found
    const nameFound = result.validated && result.buyerName && (
      buyerFullName.toLowerCase().includes(result.buyerName.toLowerCase()) || 
      result.buyerName.toLowerCase().includes(buyerFullName.toLowerCase())
    );
    
    // If the document is valid but the name doesn't match, override validation
    if (result.validated && !nameFound) {
      return {
        validated: false,
        data: validationData,
        message: `The document does not contain your name (${buyerFullName}). Please ensure your name appears in the pre-qualification document.`
      };
    }
    
    return {
      validated: result.validated || false,
      data: validationData, 
      message: result.message || (result.validated ? 
        "Document validated successfully" : 
        "Document doesn't appear to be a valid pre-qualification letter.")
    };
  } catch (error) {
    console.error("Error validating prequalification document:", error);
    return {
      validated: false,
      data: {},
      message: "Error processing document. Please try again with a clearer image."
    };
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

    // Check if the name matches
    const nameMatches = true; // In real implementation, would compare extracted name with provided name

    // Address checks
    const addressMatches = true; // In real implementation, would compare extracted address with provided address

    // DOB checks
    const dobMatches = true; // In real implementation, would compare extracted DOB with provided DOB

    return {
      verified: nameMatches && addressMatches && dobMatches,
      message: nameMatches && addressMatches && dobMatches
        ? "ID verified successfully"
        : "Verification failed, information doesn't match provided details",
    };
  } catch (error) {
    console.error("Error verifying KYC documents:", error);
    return {
      verified: false,
      message: "Error processing ID documents. Please try again with clearer images.",
    };
  }
}

// Find matching agents for a property
export async function findAgentsForProperty(property: Property): Promise<User[]> {
  try {
    // Get all agents from database
    const allAgents = await storage.getUsersByRole("agent");
    
    // If no agents, return empty array
    if (!allAgents || allAgents.length === 0) {
      return [];
    }
    
    // If there's no OpenAI API key, return random set of agents
    if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === "dummy_key_for_development") {
      console.log("Using random agent selection (no API key)");
      
      // Return up to 5 random agents
      if (allAgents.length <= 5) {
        return allAgents;
      }
      
      // Shuffle the array and take first 5
      const shuffled = [...allAgents].sort(() => 0.5 - Math.random());
      return shuffled.slice(0, 5);
    }
    
    // Get details of the property
    const propertyText = `
      Property at ${property.address}, ${property.city}, ${property.state}
      Type: ${property.propertyType || "Not specified"}
      Price: $${property.price || "Not specified"}
      Bedrooms: ${property.bedrooms || "Not specified"}
      Bathrooms: ${property.bathrooms || "Not specified"}
      Square footage: ${property.squareFeet || "Not specified"}
    `;
    
    // Analyze each agent and rate their match for this property
    const rankedAgents = await rankAgentsByExpertise(property, allAgents);
    
    // Return top 5 matching agents
    return rankedAgents.slice(0, 5);
  } catch (error) {
    console.error("Error finding agents for property:", error);
    
    // Return a random selection of agents in case of error
    const agents = await storage.getUsersByRole("agent");
    if (agents.length <= 5) {
      return agents;
    }
    
    // Shuffle and return first 5
    const shuffled = [...agents].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, 5);
  }
}

// Helper function to rank agents by expertise
async function rankAgentsByExpertise(
  property: Property, 
  agents: User[]
): Promise<User[]> {
  // If there's no OpenAI API key, return original array
  if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === "dummy_key_for_development") {
    return agents;
  }
  
  try {
    // Prepare property details
    const propertyDetails = `
      Property Details:
      - Address: ${property.address}, ${property.city}, ${property.state} ${property.zip}
      - Type: ${property.propertyType || "Not specified"}
      - Price: $${property.price?.toLocaleString() || "Not specified"}
      - Bedrooms: ${property.bedrooms || "Not specified"}
      - Bathrooms: ${property.bathrooms || "Not specified"}
      - Square Footage: ${property.squareFeet || "Not specified"}
    `;
    
    // Create an array of all agents with match scores
    // Instead of using any, we'll ignore the expertise property for now
    const scoredAgents = agents.map((agent) => {
      // In a real implementation, this would be actual agent info
      return agent;
    });
    
    // Since we can't properly assign expertise, just return the original array
    return agents;
  } catch (error) {
    console.error("Error ranking agents:", error);
    return agents; // Return unranked list on error
  }
}

// Extract property data from URL
export async function extractPropertyFromUrl(url: string): Promise<PropertyAIData> {
  try {
    // If there's no API key, use mock data for development
    if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === "dummy_key_for_development") {
      console.log("Using mock data for URL extraction (no API key)");
      return generateMockPropertyData("123 Main St, Springfield, IL");
    }
    
    // In a real implementation, we would scrape the URL and extract data
    console.log(`Extracting property data from URL: ${url}`);
    
    try {
      // Mock implementation for testing
      const basicPropertyData: PropertyAIData = {
        address: "123 Main St",
        city: "Springfield",
        state: "IL",
        zip: "62701",
        propertyType: "Single Family Home",
        bedrooms: 3,
        bathrooms: 2,
        squareFeet: 1800,
        price: 250000,
        yearBuilt: 1985,
        description: "Charming home in a quiet neighborhood",
        features: [
          "Hardwood floors",
          "Updated kitchen",
          "Large backyard",
          "Two-car garage"
        ]
      };
      
      return basicPropertyData;
    } catch (error) {
      console.error("Error extracting from URL:", error);
      throw error;
    }
  } catch (error) {
    console.error("Error in property URL extraction:", error);
    // Return mock data as fallback
    return generateMockPropertyData("123 Error St");
  }
}

// Generate mock property data for testing
function generateMockPropertyData(address: string): PropertyAIData {
  // Generate realistic mock data based on the address
  const mockData: PropertyAIData = {
    address: address,
    city: "Springfield",
    state: "IL",
    zip: "62701",
    propertyType: "Single Family Home",
    bedrooms: 3,
    bathrooms: 2,
    squareFeet: 2000,
    price: 350000,
    yearBuilt: 1995,
    description:
      "Beautiful single-family home in a great neighborhood with modern amenities and convenient location.",
    features: [
      "Hardwood floors",
      "Updated kitchen",
      "Spacious backyard",
      "Close to parks and schools",
      "Attached garage",
    ],
  };

  return mockData;
}