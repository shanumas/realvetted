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
export async function extractPropertyWithSerpApi(
  url: string,
): Promise<PropertyAIData> {
  try {
    console.log("Extracting property details using SerpAPI for:", url);

    // Step 1: Use SerpAPI to search for information about the property URL
    const searchResults = await searchPropertyUrl(url);

    // Step 2: Use OpenAI to extract structured data from the search results
    const extractedData = await extractDataWithOpenAI(searchResults, url);

    // Step 3: Search for agent email if we have agent name
    // We'll search even if we don't have the company name to increase chances of finding email
    // Use either specific agent name or listedby field for email search
    let agentInfo = extractedData.listingAgentName;
    
    // If no specific agent name but we have some form of listing info, use that
    if ((!agentInfo || agentInfo.trim() === '') && extractedData.listedby && extractedData.listedby.trim() !== '') {
      agentInfo = extractedData.listedby;
      
      // If agent name not already populated, try to extract it from listedby
      if (!extractedData.listingAgentName || extractedData.listingAgentName.trim() === '') {
        // Basic extraction - try to get a name from the listedby field
        const words = extractedData.listedby.split(' ');
        if (words.length >= 2) {
          extractedData.listingAgentName = `${words[0]} ${words[1]}`;
        } else {
          extractedData.listingAgentName = extractedData.listedby;
        }
      }
    }
    
    // Proceed with email search if we have any agent information
    if (agentInfo && agentInfo.trim() !== '') {
      console.log("Found agent information, searching for email:", agentInfo);
      const agentEmail = await findAgentEmail(agentInfo);
      
      if (agentEmail) {
        console.log("Found agent email:", agentEmail);
        extractedData.listingAgentEmail = agentEmail;
      } else {
        console.log("No agent email found");
      }
    } else {
      console.log("No agent information found, skipping email search");
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
      },
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
async function extractDataWithOpenAI(
  searchResults: any,
  originalUrl: string,
): Promise<PropertyAIData> {
  try {
    // Prepare the prompt with the search results
    const organicResults = searchResults.organic_results || [];
    const snippets = organicResults
      .map((r: any) => r.snippet || "")
      .join("\n\n");
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

IMPORTANT - AGENT INFORMATION EXTRACTION:
1. Look very carefully for any real estate agent information in the data using multiple pattern recognition approaches.
2. Agent information might appear in various formats:
   - "Listed by: [Agent Name]"
   - "Listing Agent: [Agent Name]"
   - "Contact: [Agent Name]"
   - "[Agent Name] with [Company]"
   - Any section that mentions an agent's name followed by a phone number, license number, or company name

3. Scan the entire content for patterns that might indicate an agent:
   - A person's name followed by a phone number
   - A person's name followed by "DRE" or any license number format
   - A person's name associated with real estate companies like "Realty", "Properties", "Homes", etc.
   - A person's name followed by "REALTOR" or "agent" or "broker"

4. Even if you only find partial agent information (e.g., just a name), extract it rather than returning an empty field.

Return valid JSON with these fields:

address: Full property address

city: City

state: State or province

zip: ZIP/postal code

propertyType: e.g., "Single Family", "Condo"

bedrooms: e.g., "3"

bathrooms: e.g., "2.5"

squareFeet: e.g., "1500"

price: e.g., "$750,000"

yearBuilt: e.g., "1998"

description: Full property description

features: Array of features

listedby: Full details of the listing agent (include everything you find about the agent)

listingAgentName: Just the agent's name without titles or other details

listingAgentPhone: Agent's phone number

listingAgentCompany: Real estate company name

listingAgentLicenseNo: Agent's license number (e.g. "01452902" without "DRE #")

Example agent information formats that might appear:
"Listed by: Gary J. Snow DRE #01452902 415-601-5223, Vantage Realty 415-846-4685"
"Contact John Smith at 555-123-4567 for more information"
"Jane Doe | XYZ Realty | License# 12345"
"Property represented by Bob Johnson (415-555-1234)"

Return only the JSON.`,
        },
        {
          role: "user",
          content: context,
        },
      ],
      response_format: { type: "json_object" },
    });

    // Parse the extracted data
    const extractedData = JSON.parse(
      response.choices[0].message.content || "{}",
    );

    // Process raw data before creating the structured property data
    let listedby = extractedData.listedby || "";
    let agentName = extractedData.listingAgentName || "";
    
    // If we don't have a listedby field but we have agent name, use that for listedby
    if (!listedby && agentName) {
      listedby = agentName;
      
      // If we have agent company, add it to listedby
      if (extractedData.listingAgentCompany) {
        listedby += ` with ${extractedData.listingAgentCompany}`;
      }
      
      // If we have agent phone, add it to listedby
      if (extractedData.listingAgentPhone) {
        listedby += ` ${extractedData.listingAgentPhone}`;
      }
    } 
    // If we have listedby but no agent name, try to extract agent name from listedby
    else if (listedby && !agentName) {
      // Try to extract name from listedby - common patterns:
      // "Listed by: John Smith" or "Listed by John Smith" or "Contact John Smith"
      const nameMatch = listedby.match(/(?:Listed by:?\s*|Contact:?\s*|Agent:?\s*)([A-Z][a-z]+ [A-Z][a-z]+)/i);
      if (nameMatch && nameMatch[1]) {
        agentName = nameMatch[1];
      } else {
        // Fallback: just take first two words that look like a name (start with capital)
        const words = listedby.split(/\s+/);
        const nameWords = words.filter(word => /^[A-Z][a-z]+$/.test(word));
        if (nameWords.length >= 2) {
          agentName = `${nameWords[0]} ${nameWords[1]}`;
        }
      }
    }
    
    // If we have description text but no agent information, try to extract from description
    if ((!listedby || !agentName) && extractedData.description) {
      const desc = extractedData.description;
      
      // Look for common agent patterns in description
      const agentPatterns = [
        /(?:Listed by|Contact|Agent|REALTOR):?\s*([A-Z][a-z]+ [A-Z][a-z]+)/i,
        /([A-Z][a-z]+ [A-Z][a-z]+)\s+(?:is the listing agent|is the agent|is the REALTOR)/i,
        /(?:call|contact|reach)\s+([A-Z][a-z]+ [A-Z][a-z]+)\s+(?:at|on)\s+(\d{3}[-\.\s]??\d{3}[-\.\s]??\d{4})/i
      ];
      
      for (const pattern of agentPatterns) {
        const match = desc.match(pattern);
        if (match && match[1]) {
          // Found a potential agent name
          agentName = agentName || match[1];
          
          // If we got a phone number too, capture it
          if (match[2] && !extractedData.listingAgentPhone) {
            extractedData.listingAgentPhone = match[2];
          }
          
          // Update listedby if empty
          if (!listedby) {
            listedby = match[0];
          }
          
          break;
        }
      }
      
      // Look for real estate company names if we don't have one
      if (!extractedData.listingAgentCompany) {
        const companyPatterns = [
          /([A-Z][A-Za-z\s]+(?:Realty|Properties|Homes|Real Estate|Group|Associates))/,
          /(?:with|at|from)\s+([A-Z][A-Za-z\s]+(?:Realty|Properties|Homes|Real Estate|Group|Associates))/
        ];
        
        for (const pattern of companyPatterns) {
          const match = desc.match(pattern);
          if (match && match[1]) {
            extractedData.listingAgentCompany = match[1].trim();
            break;
          }
        }
      }
    }
    
    // Create the structured property data with our enhanced agent information
    const propertyData: PropertyAIData = {
      address: extractedData.address || "Address unavailable",
      city: extractedData.city || "",
      state: extractedData.state || "",
      zip: extractedData.zip || "",
      propertyType: extractedData.propertyType || "",
      bedrooms: extractedData.bedrooms || "",
      bathrooms: extractedData.bathrooms || "",
      squareFeet: extractedData.squareFeet || "",
      price: extractedData.price || "",
      yearBuilt: extractedData.yearBuilt || "",
      description: extractedData.description || "No description available",
      features: extractedData.features || [],
      listedby: listedby,
      listingAgentName: agentName,
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
 * Use OpenAI to select the best email from multiple options
 *
 * @param emails Array of email addresses found
 * @param agentName Name of the agent
 * @param agentCompany Company of the agent
 * @param agentPhone Phone number of the agent (optional)
 * @param agentLicense License number of the agent (optional)
 * @returns The most likely correct email for the agent
 */
async function selectBestEmail(
  emails: string[],
  listedby: string,
): Promise<string> {
  try {
    console.log(
      `Selecting best email from ${emails.length} options for ${listedby}`,
    );

    // Prepare the email options with analysis
    const emailOptions = emails.map((email) => {
      // Do some basic analysis on each email
      const nameParts = listedby.toLowerCase().split(" ");
      const firstInitial = nameParts[0]?.[0] || "";
      const firstName = nameParts[0] || "";
      const lastName = nameParts[nameParts.length - 1] || "";

      const hasFirstName = email
        .toLowerCase()
        .includes(firstName.toLowerCase());
      const hasLastName = email.toLowerCase().includes(lastName.toLowerCase());
      const hasInitial = email
        .toLowerCase()
        .includes(firstInitial.toLowerCase());
      const hasCompanyDomain = email
        .toLowerCase()
        .includes(listedby.toLowerCase().replace(/\s+/g, ""));

      return {
        email,
        hasFirstName,
        hasLastName,
        hasInitial,
        hasCompanyDomain,
      };
    });

    // Use OpenAI to analyze and choose the best email
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are an AI assistant that specializes in analyzing and selecting the correct email address for real estate agents.
Given a set of email addresses found from web searches, select the most likely correct email for the specific real estate agent.
Return only the email address (no explanation).`,
        },
        {
          role: "user",
          content: `I need to find the correct email address for a real estate agent with these details:
- ${listedby}

These email addresses were found in search results:
${emailOptions
  .map(
    (option) =>
      `- ${option.email} (Contains first name: ${option.hasFirstName}, Contains last name: ${option.hasLastName}, Contains initial: ${option.hasInitial}, Contains company domain: ${option.hasCompanyDomain})`,
  )
  .join("\n")}

Which email is most likely the correct one for this agent? Select exactly one email address from the list.`,
        },
      ],
    });

    const selectedEmail =
      response.choices[0].message.content?.trim() || emails[0];

    // Make sure we return an actual email from our list
    const validatedEmail =
      emails.find((email) => selectedEmail.includes(email)) || emails[0];

    console.log(`OpenAI selected email: ${validatedEmail}`);
    return validatedEmail;
  } catch (error) {
    console.error("Error selecting best email:", error);
    return emails[0]; // Fallback to first email if OpenAI selection fails
  }
}

/**
 * Find an agent's email using SerpAPI
 *
 * @param agentName The name of the real estate agent
 * @param agentCompany The name of the real estate company
 * @param listingAgentPhone Phone number of the agent (optional)
 * @param listingAgentLicenseNo License number of the agent (optional)
 * @returns The agent's email address if found, otherwise empty string
 */
async function findAgentEmail(listedby: string | ""): Promise<string> {
  try {
    console.log("Finding agent email using SerpAPI for:", listedby);
    // Craft a specific search query to find the agent's email
    const searchQuery = `${listedby} "real estate agent" "email" contact`;

    // Make the SerpAPI request
    const response = await axios.get("https://serpapi.com/search.json", {
      params: {
        engine: "google",
        q: searchQuery,
        api_key: process.env.SERPAPI_KEY,
        num: 10, // Increase number of results for better chances
      },
    });

    // Extract the relevant information from the search results
    const organicResults = response.data.organic_results || [];
    console.log(
      `Found ${organicResults.length} organic results for agent email search`,
    );

    // Combine titles and snippets for more thorough email extraction
    const potentialEmailSources = organicResults
      .map((r: any) => `${r.title || ""} ${r.snippet || ""}`)
      .join(" ");

    // Log a portion of the search results for debugging
    console.log(
      "Potential email sources (truncated):",
      potentialEmailSources.substring(0, 200) +
        (potentialEmailSources.length > 200 ? "..." : ""),
    );

    // Use a regex pattern to find email addresses in the text
    const emailPattern = /[\w.+-]+@[\w.-]+\.\w+/g;
    const emailMatches = potentialEmailSources.match(emailPattern) || [];

    console.log(emailMatches);

    // If multiple emails are found, use OpenAI to pick the best one
    if (emailMatches.length > 1) {
      console.log(
        "Multiple emails found, using OpenAI to select the most appropriate one",
      );
      return await selectBestEmail(emailMatches, listedby);
    }

    // Return the first found email, or empty string if none found
    return emailMatches.length > 0 ? emailMatches[0] : "";
  } catch (error) {
    console.error("Agent email search failed:", error);
    return ""; // Return empty string on error
  }
}
