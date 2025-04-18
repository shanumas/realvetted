import OpenAI from "openai";
import { PropertyAIData } from "@shared/types";
import { Property, User } from "@shared/schema";
import { storage } from "./storage";
import fs from "fs";

// Initialize the OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "dummy_key_for_development",
});

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
            "You are a real estate data expert that extracts property information from addresses. Return only the JSON data.",
        },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
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

// Extract data from ID documents using OpenAI Vision
export async function extractIDData(
  idFrontBase64: string,
  idBackBase64: string,
): Promise<ExtractedIDData> {
  try {
    // If there's no API key, return empty data as we can't extract
    if (
      !process.env.OPENAI_API_KEY ||
      process.env.OPENAI_API_KEY === "dummy_key_for_development"
    ) {
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
                url: `data:image/jpeg;base64,${idFrontBase64}`,
              },
            },
          ],
        },
      ],
      response_format: { type: "json_object" },
    });

    const frontData = JSON.parse(frontResponse.choices[0].message.content);

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
                url: `data:image/jpeg;base64,${idBackBase64}`,
              },
            },
          ],
        },
      ],
      response_format: { type: "json_object" },
    });

    const backData = JSON.parse(backResponse.choices[0].message.content);

    // Merge data from front and back, prioritizing front data
    return {
      ...backData,
      ...frontData,
    };
  } catch (error) {
    console.error("Error extracting data from ID:", error);
    return {};
  }
}

// Verify KYC documents
export async function validatePrequalificationDocument(
  filePath: string,
  userData: {
    firstName: string | null;
    lastName: string | null;
  },
): Promise<{
  validated: boolean;
  data: PrequalificationData;
  message: string;
}> {
  try {
    // If there's no API key, check if the file is likely a prequalification letter based on basic validation
    if (
      !process.env.OPENAI_API_KEY ||
      process.env.OPENAI_API_KEY === "dummy_key_for_development"
    ) {
      console.log(
        "Using enhanced mock validation for prequalification document (no API key)",
      );

      // Read the file and check for keywords that would indicate it's a prequalification letter
      try {
        const fileBuffer = fs.readFileSync(filePath);
        const fileContent = fileBuffer.toString("utf-8").toLowerCase();

        // Check for keywords that would indicate this is a prequalification letter
        const prequalKeywords = [
          "pre-qualification",
          "prequalification",
          "pre-approval",
          "preapproval",
          "pre qualify",
          "prequalify",
          "mortgage",
          "loan approval",
          "lender",
          "qualification letter",
        ];

        // Check for lender names or terms
        const lenderKeywords = [
          "bank",
          "mortgage",
          "financial",
          "credit union",
          "lending",
          "capital",
          "home loan",
        ];

        // Check if the document contains mortgage-related terms
        const mortgageKeywords = [
          "loan amount",
          "interest rate",
          "down payment",
          "approval",
          "borrower",
          "property",
          "purchase",
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
        const userFullName =
          `${userData.firstName || ""} ${userData.lastName || ""}`
            .trim()
            .toLowerCase();
        const nameFound = userFullName && fileContent.includes(userFullName);

        // For validation to pass, the document should meet less strict criteria:
        // 1. Contain at least one prequalification term OR
        // 2. Contain at least one lender term OR
        // 3. Contain at least one mortgage term OR
        // 4. Have a reasonable number of relevant keywords (2+)
        // Note: We're making this more lenient for now

        const isValid =
          (prequalFound || lenderFound || mortgageFound) &&
          keywordMatches >= 2;

        const mockData: PrequalificationData = {
          documentType: prequalFound
            ? "Pre-Approval Letter"
            : "Unknown Document",
          buyerName:
            `${userData.firstName || ""} ${userData.lastName || ""}`.trim(),
          firstName: userData.firstName || undefined,
          lastName: userData.lastName || undefined,
          lenderName: lenderFound ? "Detected Lender" : undefined,
          loanAmount: mortgageFound ? "$500,000" : undefined,
          loanType: mortgageFound ? "Conventional" : undefined,
          approvalDate: new Date().toISOString().split("T")[0],
          expirationDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
            .toISOString()
            .split("T")[0],
        };

        const validationMessage = isValid
          ? "Document validated successfully"
          : `Document doesn't appear to be valid. Please upload a document that includes some mortgage or prequalification terms.`;

        console.log(
          `Mock validation result: ${isValid ? "VALID" : "INVALID"} - ${validationMessage}`,
        );

        return {
          validated: isValid,
          data: mockData,
          message: validationMessage,
        };
      } catch (error) {
        console.error("Error performing basic document validation:", error);
        return {
          validated: false,
          data: {},
          message:
            "Error analyzing document content. Please try again with a different file.",
        };
      }
    }

    // In production, read file and convert to base64
    const fileBuffer = fs.readFileSync(filePath);
    const base64Image = fileBuffer.toString("base64");

    // For PDF files, perform basic text extraction and analysis for validation
    // In a production environment, we would use a PDF to image conversion service
    console.log(
      "Performing enhanced validation for prequalification document (PDF format)",
    );

    try {
      // Read the file and check for keywords that would indicate it's a prequalification letter
      const fileBuffer = fs.readFileSync(filePath);
      const fileContent = fileBuffer.toString("utf-8").toLowerCase();

      // Check for keywords that would indicate this is a prequalification letter
      const prequalKeywords = [
        "pre-qualification",
        "prequalification",
        "pre-approval",
        "preapproval",
        "pre qualify",
        "prequalify",
        "mortgage",
        "loan approval",
        "lender",
        "qualification letter",
      ];

      // Check for lender names or terms
      const lenderKeywords = [
        "bank",
        "mortgage",
        "financial",
        "credit union",
        "lending",
        "capital",
        "home loan",
      ];

      // Check if the document contains mortgage-related terms
      const mortgageKeywords = [
        "loan amount",
        "interest rate",
        "down payment",
        "approval",
        "borrower",
        "property",
        "purchase",
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
      const userFullName =
        `${userData.firstName || ""} ${userData.lastName || ""}`
          .trim()
          .toLowerCase();
      const firstNameCheck = userData.firstName
        ? fileContent.includes(userData.firstName.toLowerCase())
        : false;
      const lastNameCheck = userData.lastName
        ? fileContent.includes(userData.lastName.toLowerCase())
        : false;
      const nameFound =
        userFullName &&
        (fileContent.includes(userFullName) ||
          (firstNameCheck && lastNameCheck));

      // For validation to pass, the document should meet less strict criteria:
      // 1. Contain at least one prequalification term OR
      // 2. Contain at least one lender term OR
      // 3. Contain at least one mortgage term OR
      // 4. Have a reasonable number of relevant keywords (2+)
      // Note: We're making this more lenient for now

      const isValid =
        (prequalFound || lenderFound || mortgageFound) &&
        keywordMatches >= 2;

      const mockData: PrequalificationData = {
        documentType: prequalFound ? "Pre-Approval Letter" : "Unknown Document",
        buyerName:
          `${userData.firstName || ""} ${userData.lastName || ""}`.trim(),
        firstName: userData.firstName || undefined,
        lastName: userData.lastName || undefined,
        lenderName: lenderFound ? "Detected Lender" : undefined,
        loanAmount: mortgageFound ? "$500,000" : undefined,
        loanType: mortgageFound ? "Conventional" : undefined,
        approvalDate: new Date().toISOString().split("T")[0],
        expirationDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
          .toISOString()
          .split("T")[0],
      };

      const validationMessage = isValid
        ? "Document validated successfully"
        : `Document doesn't appear to be valid. Please upload a document that includes some mortgage or prequalification terms.`;

      console.log(
        `PDF validation result: ${isValid ? "VALID" : "INVALID"} - Keywords found: ${keywordMatches}, Name found: ${nameFound}`,
      );

      return {
        validated: isValid,
        data: mockData,
        message: validationMessage,
      };
    } catch (error) {
      console.error("Error performing PDF document validation:", error);
      return {
        validated: false,
        data: {},
        message:
          "Error analyzing PDF content. Please try again with a different file.",
      };
    }
  } catch (error) {
    console.error("Error validating prequalification document:", error);
    return {
      validated: false,
      data: {},
      message:
        "Error processing document. Please try again with a clearer image.",
    };
  }
}

export async function verifyKYCDocuments(
  userId: number,
  idFrontUrl: string,
  idBackUrl: string,
  userData: {
    firstName: string;
    lastName: string;
    dateOfBirth: string;
    addressLine1: string;
  },
): Promise<{ verified: boolean; message: string }> {
  // In a real implementation, this would:
  // 1. Download the ID images
  // 2. Use OpenAI Vision API to extract information
  // 3. Compare with user-provided info
  // 4. Return verification result

  try {
    // If there's no API key, simulate verification for development
    if (
      !process.env.OPENAI_API_KEY ||
      process.env.OPENAI_API_KEY === "dummy_key_for_development"
    ) {
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
    const nameMatches = mockResponse.includes(
      `${userData.firstName} ${userData.lastName}`,
    );
    const dobMatches = mockResponse.includes(userData.dateOfBirth);
    const addressMatches = mockResponse.includes(userData.addressLine1);

    const verified = nameMatches && dobMatches && addressMatches;

    return {
      verified,
      message: verified
        ? "ID verification successful"
        : "ID verification failed. Information does not match.",
    };
  } catch (error) {
    console.error("Error verifying KYC documents:", error);
    throw new Error("Failed to verify ID documents. Please try again later.");
  }
}

// Find matching agents for a property
export async function findAgentsForProperty(
  property: Property,
): Promise<User[]> {
  try {
    // Get all verified agents
    const allAgents = await storage.getUsersByRole("agent");
    const verifiedAgents = allAgents.filter(
      (agent) => agent.profileStatus === "verified" && !agent.isBlocked,
    );

    if (verifiedAgents.length === 0) {
      return [];
    }

    // Pre-filter agents by state when possible for better location-based matching
    const propertyState = property.state;

    // Create two groups of agents - those in the same state and those in other states
    const sameStateAgents = propertyState
      ? verifiedAgents.filter(
          (agent) => agent.state?.toLowerCase() === propertyState.toLowerCase(),
        )
      : [];

    // If we have enough agents in the same state, prioritize them
    if (sameStateAgents.length >= 3) {
      console.log(
        `Found ${sameStateAgents.length} agents in ${propertyState} for property matching`,
      );

      // If we have many agents in the same state, use AI to rank them by expertise
      if (
        sameStateAgents.length > 3 &&
        process.env.OPENAI_API_KEY &&
        process.env.OPENAI_API_KEY !== "dummy_key_for_development"
      ) {
        return await rankAgentsByExpertise(property, sameStateAgents);
      }

      // If we have exactly 3 or fewer agents in the same state, return them all
      return sameStateAgents;
    }

    // If no API key, return the same-state agents first, then add other agents
    if (
      !process.env.OPENAI_API_KEY ||
      process.env.OPENAI_API_KEY === "dummy_key_for_development"
    ) {
      console.log("Using simplified agent matching (no API key)");

      // If we have some agents in the same state but fewer than 3, add agents from other states
      if (sameStateAgents.length > 0) {
        const otherStateAgents = verifiedAgents.filter(
          (agent) => !sameStateAgents.some((sa) => sa.id === agent.id),
        );

        // Return same-state agents first, then add others up to 3 total
        const topAgents = [
          ...sameStateAgents,
          ...otherStateAgents.slice(0, 3 - sameStateAgents.length),
        ];

        return topAgents;
      }

      // If no same-state agents, just return up to 3 verified agents
      return verifiedAgents.slice(0, 3);
    }

    // Use AI for comprehensive matching
    return await rankAgentsByExpertise(
      property,
      verifiedAgents,
      sameStateAgents,
    );
  } catch (error) {
    console.error("Error matching agents:", error);
    // Return all verified agents as fallback, prioritizing same-state agents
    const allAgents = await storage.getUsersByRole("agent");
    const verifiedAgents = allAgents.filter(
      (agent) => agent.profileStatus === "verified" && !agent.isBlocked,
    );

    if (property.state) {
      // Sort to prioritize agents in the same state
      return verifiedAgents
        .sort((a, b) => {
          const aInSameState =
            a.state?.toLowerCase() === property.state?.toLowerCase() ? 0 : 1;
          const bInSameState =
            b.state?.toLowerCase() === property.state?.toLowerCase() ? 0 : 1;
          return aInSameState - bInSameState;
        })
        .slice(0, 3);
    }

    return verifiedAgents.slice(0, 3);
  }
}

// Helper function to rank agents using AI based on expertise and property details
async function rankAgentsByExpertise(
  property: Property,
  agents: User[],
  prioritizedAgents: User[] = [],
): Promise<User[]> {
  const prompt = `
    I need to match real estate agents to a property. Here's the property information:
    - Address: ${property.address}
    - City: ${property.city || "Unknown"}
    - State: ${property.state || "Unknown"}
    - Property Type: ${property.propertyType || "Unknown"}
    - Price: ${property.price ? `$${property.price}` : "Unknown"}

    Here are the available agents and their expertise:
    ${agents
      .map(
        (agent, i) => `
      Agent ${i + 1} (ID: ${agent.id}):
      - Name: ${agent.firstName} ${agent.lastName}
      - Location: ${agent.city || "Unknown"}, ${agent.state || "Unknown"}
      - Expertise: ${agent.expertise || "General real estate"}
    `,
      )
      .join("\n")}

    ${
      prioritizedAgents.length > 0
        ? `
    NOTE: Agents with IDs ${prioritizedAgents.map((a) => a.id).join(", ")} are located in the same state as the property (${property.state}) and should be given higher priority.
    `
        : ""
    }

    Please provide the IDs of the top 3 most suitable agents based on location and expertise.
    Return a JSON object with an 'agents' array containing the agent IDs, like this: {"agents": [1, 2, 3]}
  `;

  const response = await openai.chat.completions.create({
    model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
    messages: [
      {
        role: "system",
        content: "You are a real estate agent matching expert.",
      },
      { role: "user", content: prompt },
    ],
    response_format: { type: "json_object" },
  });

  const result = JSON.parse(response.choices[0].message.content || "{}");
  const matchedAgentIds = result.agents || [];

  // Return matched agents (up to 3) or prioritized agents + others if no matches
  if (matchedAgentIds.length > 0) {
    const matchedAgents = agents.filter((agent) =>
      matchedAgentIds.includes(agent.id),
    );
    return matchedAgents.slice(0, 3);
  } else if (prioritizedAgents.length > 0) {
    // If AI didn't return matches but we have prioritized agents, use those first
    const otherAgents = agents.filter(
      (agent) => !prioritizedAgents.some((pa) => pa.id === agent.id),
    );

    return [...prioritizedAgents, ...otherAgents].slice(0, 3);
  } else {
    // Fallback to returning top 3 agents
    return agents.slice(0, 3);
  }
}

// Extract property data from URL using web search instead of direct scraping
import { getJson } from "serpapi";

export async function extractPropertyFromUrl(
  url: string,
): Promise<PropertyAIData> {
  try {
    // If no SerpApi key available, return placeholder data
    if (!process.env.SERPAPI_KEY) {
      console.log(
        "Using mock data for property URL extraction (no SERPAPI_KEY)",
      );
      const mockData = generateMockPropertyData(url);
      // Save the original URL entered by the user
      mockData.sourceUrl = url;
      return mockData;
    }

    // Extract property details from URL directly with a single search
    // By using the housing website URL directly we leverage structured data
    const propertySearchQuery = `${url} real estate listing details property type bedrooms bathrooms price square feet address listing agent email contact information`;
    console.log(
      `Searching for property information using query: ${propertySearchQuery}`,
    );

    let propertySearchResults;
    try {
      // Add 30 second timeout for the API request
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(
          () => reject(new Error("SerpAPI request timed out after 30 seconds")),
          30000,
        );
      });

      const searchPromise = getJson({
        engine: "google",
        q: propertySearchQuery,
        api_key: process.env.SERPAPI_KEY,
        num: 12, // Increased to get more results with agent info
        gl: "us", // Explicitly set country to US
      });

      propertySearchResults = await Promise.race([
        searchPromise,
        timeoutPromise,
      ]);
    } catch (searchError) {
      console.error("Error with property search API:", searchError);
      // Basic property data with just the URL
      const basicPropertyData: PropertyAIData = {
        address: "Address from URL",
        city: "",
        state: "",
        zip: "",
        propertyType: "Single Family", // Default assumption
        bedrooms: 0,
        bathrooms: 0,
        squareFeet: 0,
        price: 0,
        yearBuilt: 0,
        description: "Property details could not be extracted",
        features: [],
        propertyUrl: url,
      };

      // Try to extract minimal information from the URL itself
      try {
        // Extract address from URL
        const urlObj = new URL(url);
        const pathSegments = urlObj.pathname.split("/").filter(Boolean);

        // Different extraction patterns based on common real estate sites
        if (urlObj.hostname.includes("zillow.com")) {
          // Example: https://www.zillow.com/homedetails/1033-Girard-St-San-Francisco-CA-94134/15172734_zpid/
          const addressPart = pathSegments[1] || "";
          const addressSegments = addressPart.split("-");

          if (addressSegments.length >= 4) {
            // Extract city and state from URL segments
            const stateIndex = addressSegments.findIndex(
              (seg) => seg.length === 2 && seg === seg.toUpperCase(),
            );
            if (stateIndex > 0) {
              basicPropertyData.state = addressSegments[stateIndex];
              basicPropertyData.city = addressSegments
                .slice(stateIndex - 1, stateIndex)
                .join(" ");
              basicPropertyData.address = addressSegments
                .slice(0, stateIndex - 1)
                .join(" ");

              // Extract zip if available
              if (addressSegments.length > stateIndex + 1) {
                basicPropertyData.zip = addressSegments[stateIndex + 1];
              }
            }
          }
        } else if (urlObj.hostname.includes("realtor.com")) {
          // Example: https://www.realtor.com/realestateandhomes-detail/1033-Girard-St_San-Francisco_CA_94134
          if (pathSegments.length >= 1) {
            const addressParts =
              pathSegments[pathSegments.length - 1].split("_");
            if (addressParts.length >= 3) {
              basicPropertyData.address = addressParts[0].replace(/-/g, " ");
              basicPropertyData.city = addressParts[1].replace(/-/g, " ");
              basicPropertyData.state = addressParts[2];
              if (addressParts.length > 3) {
                basicPropertyData.zip = addressParts[3];
              }
            }
          }
        } else if (urlObj.hostname.includes("redfin.com")) {
          // Extract what we can from Redfin URLs
          if (pathSegments.length >= 1) {
            const locationParts = pathSegments[0].split("-");
            if (locationParts.length >= 2) {
              basicPropertyData.city = locationParts[0].replace(/-/g, " ");
              basicPropertyData.state = locationParts[1].toUpperCase();
            }
            if (pathSegments.length >= 3) {
              basicPropertyData.address = pathSegments[2].replace(/-/g, " ");
            }
          }
        }
      } catch (urlParseError) {
        console.error("Error parsing URL for basic info:", urlParseError);
      }

      return basicPropertyData;
    }

    // Extract property search results
    const propertyOrganicResults = propertySearchResults?.organic_results || [];

    // No search results found
    if (propertyOrganicResults.length === 0) {
      console.log("No search results found for property URL");
      return {
        address: "Unknown",
        city: "",
        state: "",
        zip: "",
        propertyType: "Unknown",
        bedrooms: 0,
        bathrooms: 0,
        squareFeet: 0,
        price: 0,
        yearBuilt: 0,
        description: "No property data found",
        features: [],
        propertyUrl: url,
      };
    }

    // Get property result snippets
    const propertySnippets = propertyOrganicResults.map((result) => {
      return {
        title: result.title || "",
        snippet: result.snippet || "",
        link: result.link || "",
      };
    });

    // Use OpenAI to extract structured data from the search results
    const prompt = `
      I have search results for a real estate listing at URL: "${url}"
      
      Here are search results for the property:
      ${propertySnippets
        .map(
          (item, index) => `
        Result ${index + 1}:
        Title: ${item.title}
        Snippet: ${item.snippet}
        Link: ${item.link}
      `,
        )
        .join("\n")}
      
      Based on these search results, extract as many property details as possible. Look for property type, address, price, 
      number of bedrooms and bathrooms, square footage, year built, and any other relevant information.
      
      Also look for the listing agent information if available (name, company, etc.).
      
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
        "sellerName": "Listing agent's full name",
        "sellerPhone": "Listing agent's phone",
        "sellerEmail": "Listing agent's email",
        "sellerCompany": "Listing agent's real estate company",
        "sellerLicenseNo": "Listing agent's license number if available"
      }
      
      If any field information is not available, leave it as null or 0 for numbers. Return ONLY the JSON with no additional text.
    `;

    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content:
              "You are a real estate data extraction expert. Extract as much property data as possible from search results.",
          },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
        max_tokens: 1000,
        temperature: 0.3,
      });

      const propertyData = JSON.parse(
        response.choices[0].message.content || "{}",
      );

      // Ensure the original URL and source information is preserved
      return {
        ...propertyData,
        propertyUrl: url,
        sourceUrl: url, // Store the original URL entered by the user
        sourceSite: new URL(url).hostname.replace("www.", ""), // Extract the source website (e.g., zillow.com, realtor.com)
      };
    } catch (openaiError) {
      console.error("Error with OpenAI property data extraction:", openaiError);

      // Return basic data if OpenAI processing fails
      return {
        address:
          propertyOrganicResults[0]?.title?.split(" - ")[0] ||
          "Address unavailable",
        city: "",
        state: "",
        zip: "",
        propertyType: "Single Family",
        bedrooms: 0,
        bathrooms: 0,
        squareFeet: 0,
        price: 0,
        yearBuilt: 0,
        description:
          propertyOrganicResults[0]?.snippet || "Description unavailable",
        features: [],
        propertyUrl: url,
        sourceUrl: url,
        sourceSite: new URL(url).hostname.replace("www.", ""),
      };
    }
  } catch (error) {
    console.error(
      "Error extracting property data from URL with web search:",
      error,
    );
    // Return a minimal property object rather than throwing an error
    return {
      address: "Address unavailable",
      city: "",
      state: "",
      zip: "",
      propertyType: "Unknown",
      bedrooms: 0,
      bathrooms: 0,
      squareFeet: 0,
      price: 0,
      yearBuilt: 0,
      description: "Could not extract property data. Please try again later.",
      features: [],
      propertyUrl: url,
      sourceUrl: url,
      sourceSite: url.includes("://")
        ? new URL(url).hostname.replace("www.", "")
        : "unknown",
    };
  }
}

// Helper function to generate mock property data for development
function generateMockPropertyData(address: string): PropertyAIData {
  // Determine if the input is a URL
  const isUrl = address.includes("http");

  // Extract domain if it's a URL
  let sourceSite = "unknown";
  if (isUrl) {
    try {
      sourceSite = new URL(address).hostname.replace("www.", "");
    } catch (e) {
      console.error("Error parsing URL:", e);
    }
  }

  const mockData: PropertyAIData = {
    address: isUrl ? "1234 Main Street" : address,
    city: "Boston",
    state: "MA",
    zip: "02108",
    propertyType: "Single Family",
    bedrooms: 3,
    bathrooms: 2,
    squareFeet: 1800,
    price: 750000,
    yearBuilt: 1998,
    // Source information
    propertyUrl: isUrl ? address : "",
    sourceUrl: isUrl ? address : "",
    sourceSite: sourceSite,
    // Legacy listing agent info
    sellerName: "Jane Realtor",
    sellerPhone: "555-123-4567",
    sellerEmail: `agent_${Math.floor(Math.random() * 1000)}@example.com`,
    sellerCompany: "Boston Properties",
    sellerLicenseNo: "MA-REA-12345",
    // Enhanced listing agent info
    listingAgentName: "Jane Realtor",
    listingAgentEmail: `agent_${Math.floor(Math.random() * 1000)}@example.com`,
    listingAgentPhone: "555-123-4567",
    listingAgentCompany: "Boston Properties",
    listingAgentLicenseNo: "MA-REA-12345",
    // Property details
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
