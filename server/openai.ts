import OpenAI from "openai";
import pdfParse from "pdf-parse";
import fs from "fs";
import {
  PropertyAIData,
  PropertyScraperResult,
} from "@shared/types";
import { Property, User } from "@shared/schema";
import { extractPdfText } from "./pdf-wrapper";

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
 * Validate pre-qualification document
 * 
 * @param filePathOrText Either a file path or the text content from a document
 * @param userData Optional user data to enhance validation
 * @returns Validation result with extracted data and validity status
 */
export async function validatePrequalificationDocument(
  filePathOrText: string,
  userData?: {
    firstName?: string | null;
    lastName?: string | null;
  }
): Promise<{ validated: boolean; data: PrequalificationData; message?: string }> {
  try {
    // If no API key, return empty validation
    if (
      !process.env.OPENAI_API_KEY ||
      process.env.OPENAI_API_KEY === "dummy_key_for_development"
    ) {
      console.log("No OpenAI API key provided, returning empty validation");
      return {
        validated: false,
        data: {}, 
        message: "API key is missing. Manual validation required."
      };
    }

    // Extract text from PDF if a file path is provided
    let pdfText: string;
    if (filePathOrText && fs.existsSync(filePathOrText)) {
      console.log("Extracting text from PDF file:", filePathOrText);
      // Use the PDF extraction utility
      const extractedText = await extractPdfText(filePathOrText);
      pdfText = extractedText;
    } else {
      // Assume the input is already text
      pdfText = filePathOrText;
    }

    // If we couldn't extract any meaningful text
    if (!pdfText || pdfText.trim().length < 50) {
      return {
        validated: false,
        data: {},
        message: "Could not extract sufficient text from document. Please upload a text-based PDF."
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
      model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
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
    
    // Check if the document is valid
    const isValid = result.isValidDocument === true;
    
    // Create appropriate message
    let message = isValid 
      ? "Document successfully validated as a pre-qualification letter." 
      : "Document does not appear to be a valid pre-qualification letter.";
      
    return {
      validated: isValid,
      data: validationData,
      message: message
    };
  } catch (error) {
    console.error("Error validating pre-qualification document:", error);
    return {
      validated: false,
      data: {},
      message: "Error processing document. Please try a different file format."
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

  return agents;

  /*   // If we have no or just a few agents, return them all
  if (agents.length <= 3) {
    return agents;
  }

  // Otherwise rank them by expertise
  return rankAgentsByExpertise(property, agents); */
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
      console.log("No OpenAI API key provided, returning unranked agent list");
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
      const agent = agents.find((a) => a.id === agentId);

      if (agent) {
        rankedAgents.push(agent);
      }
    }

    // Add any agents that weren't ranked to the end of the list
    const rankedIds = rankedAgents.map((a) => a.id);
    const unrankedAgents = agents.filter((a) => !rankedIds.includes(a.id));

    return [...rankedAgents, ...unrankedAgents];
  } catch (error) {
    console.error("Error ranking agents:", error);
    return agents; // Return unranked list on error
  }
}
