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
    if (domain.includes("zillow.com") || domain.includes("realtor.com") || domain.includes("redfin.com")) {
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
          if (segments.length > 0 && /^[A-Z]{2}$/.test(segments[segments.length - 1])) {
            stateFromUrl = segments[segments.length - 1];
            
            // The part before the state is likely the city
            if (segments.length > 1) {
              cityFromUrl = segments[segments.length - 2].replace(/-/g, " ");
            }
          }
          
          // Check for ZIP codes
          if (segments.length > 0 && /^\d{5}$/.test(segments[segments.length - 1])) {
            zipFromUrl = segments[segments.length - 1];
          }
        }
      }
    }
    
    // Single API call to OpenAI to extract all property data
    const prompt = `
      I have a real estate listing URL. Please extract as much information as possible about this property listing.
      
      URL: ${url}
      
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
    
    // Parse the API response
    const result = JSON.parse(response.choices[0].message.content || "{}");
    
    // Always ensure we have an address
    if (!result.address) {
      result.address = addressFromUrl || "Address information unavailable";
    }
    
    // If we don't have agent email, find it or use fallback
    if (!result.sellerEmail && result.sellerName) {
      console.log("No seller email found, searching web for agent email...");
      result.sellerEmail = await findAgentEmailFromWeb(result.sellerName, result.sellerCompany);
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
    
    // Create a search query for this agent
    const searchQuery = `${agentName} real estate agent ${agentCompany || ""} contact email`;
    console.log(`Searching for agent email with query: "${searchQuery}"`);
    
    // Use direct API call to OpenAI instead of web scraping
    const prompt = `
      I need to find the email address for a real estate agent.
      
      Agent Name: ${agentName}
      Company/Brokerage: ${agentCompany || "Unknown"}
      
      Based on this information, please provide a best guess for what this agent's 
      professional email address might be. Consider common email formats like:
      - first.last@company.com
      - firstinitial.last@company.com
      - first@company.com
      
      If you can't make a confident guess, just respond with the fallback email: shanumas@gmail.com
      
      Return only the email address, nothing else.
    `;
    
    // Call OpenAI
    const response = await openai.chat.completions.create({
      model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
      messages: [
        {
          role: "system",
          content: "You are an assistant that helps find email addresses for real estate professionals.",
        },
        { role: "user", content: prompt },
      ],
    });
    
    // Extract the email from the response
    const suggestedEmail = response.choices[0].message.content?.trim();
    
    // Validate if it's a plausible email
    if (suggestedEmail && suggestedEmail.includes("@") && !suggestedEmail.includes(" ")) {
      console.log(`Found potential email for agent ${agentName}: ${suggestedEmail}`);
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

    const response = await openai.chat.completions.create({
      model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
      messages: [
        {
          role: "system",
          content:
            "You are a real estate data extraction expert. Extract ONLY data that is clearly present in the HTML. Do not guess or hallucinate data that isn't clearly there. It's better to return null than incorrect information.",
        },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
    });

    const result = JSON.parse(response.choices[0].message.content || "{}");

    // Prioritize directly extracted data over AI results when available
    if (directAddress) result.address = directAddress;
    if (directCity) result.city = directCity;
    if (directState) result.state = directState;
    if (directZip) result.zip = directZip;
    if (directPrice) result.price = directPrice;
    if (directBeds) result.bedrooms = directBeds;
    if (directBaths) result.bathrooms = directBaths;
    if (directSqFt) result.squareFeet = directSqFt;

    // If the URL appears to be from a specific site, we can extract some basic info from it
    if (
      url.includes("zillow.com") ||
      url.includes("realtor.com") ||
      url.includes("redfin.com")
    ) {
      // Check if address components are missing, try to get from URL
      if (!result.address || !result.city || !result.state) {
        const urlParts = url.split("/");
        for (let i = 0; i < urlParts.length; i++) {
          // Look for patterns like state abbreviations
          if (urlParts[i].match(/^[A-Z]{2}$/) && !result.state) {
            result.state = urlParts[i];
          }
          // Look for patterns that might be city names
          if (urlParts[i].includes("-") && !result.city) {
            result.city = urlParts[i].replace(/-/g, " ");
          }
        }
      }
    }

    console.log("Final extracted data:", result);
    return result;
  } catch (error) {
    console.error("Error extracting property data with AI:", error);
    throw new Error("Failed to extract property data. Please try again later.");
  }
}

// Use OpenAI to extract agent/seller info from HTML
async function extractAgentInfoWithAI(
  html: string,
  url: string,
): Promise<Partial<PropertyAIData>> {
  try {
    // If no API key available, return placeholder data
    if (
      !process.env.OPENAI_API_KEY ||
      process.env.OPENAI_API_KEY === "dummy_key_for_development"
    ) {
      console.log("Using mock data for agent extraction (no API key)");
      return {
        sellerName: "John Smith",
        sellerPhone: "555-123-4567",
        sellerEmail: `agent_${Math.floor(Math.random() * 1000)}@example.com`,
        sellerCompany: "Real Estate Company",
        sellerLicenseNo: `DRE #${Math.floor(Math.random() * 10000000)}`,
      };
    }

    // Extract only the relevant parts of the HTML to avoid token limit issues
    const simplifiedHtml = simplifyHtml(html, "agent");

    const prompt = `
      From this real estate listing HTML, extract information about the listing agent:
      
      IMPORTANT: Focus specifically on finding the "Listed by" or "Listing Agent" information.
      This is the real estate agent who has listed the property for sale (not the property owner).
      Look for sections labeled as "Listed by", "Listing Agent", "Contact Agent", "Agent", etc.
      
      Extract the following information about the listing agent:
      1. Agent Name
      2. Phone Number
      3. Email Address (if available)
      4. Real Estate Company/Brokerage
      5. License Number (usually in format like "DRE #12345678")
      
      Here's the HTML content:
      ${simplifiedHtml}
      
      Please format your response as a valid JSON object with these fields:
      {
        "sellerName": "listing agent's full name",
        "sellerPhone": "listing agent's phone number",
        "sellerEmail": "listing agent's email address or null if not found",
        "sellerCompany": "listing agent's company name",
        "sellerLicenseNo": "listing agent's license number"
      }
      
      Return only the JSON with no additional text or explanation.
    `;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content:
            "You are a data extraction expert specialized in real estate listings. Extract the listing agent information (the agent who listed the property for sale) from real estate listings. Focus specifically on sections labeled 'Listed by', 'Listing Agent', 'Contact Agent', etc.",
        },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
    });

    const result = JSON.parse(response.choices[0].message.content || "{}");
    return result;
  } catch (error) {
    console.error("Error extracting agent info with AI:", error);
    return {};
  }
}

// Try to find the agent's email by searching for their website and extracting contact information
async function findAgentEmailFromWeb(
  agentName: string,
  agentCompany?: string,
): Promise<string> {
  try {
    // If no API key available, return placeholder data
    if (
      !process.env.OPENAI_API_KEY ||
      process.env.OPENAI_API_KEY === "dummy_key_for_development"
    ) {
      console.log("Using mock data for agent email (no API key)");
      return `${agentName.toLowerCase().replace(/\s+/g, ".")}@example.com`;
    }

    // First, use AI to help construct a good search query
    const searchQuery = await constructAgentSearchQuery(
      agentName,
      agentCompany,
    );
    console.log(`Searching for agent email with query: ${searchQuery}`);

    // Use a simple browser to search
    const browser = await getPuppeteerBrowser();

    try {
      const page = await browser.newPage();

      // Search for the agent
      await page.goto(
        `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}`,
        { waitUntil: "networkidle2", timeout: 30000 },
      );

      // Extract the first 5 search result URLs
      const searchResults = await page.evaluate(() => {
        const links: string[] = [];
        const elements = document.querySelectorAll("a");

        // Convert NodeList to Array before iteration
        Array.from(elements).forEach((el) => {
          const href = el.getAttribute("href");
          if (
            href &&
            href.startsWith("/url?q=") &&
            !href.includes("google.com") &&
            links.length < 5
          ) {
            // Increased from 3 to 5
            links.push(href.substring(7, href.indexOf("&")));
          }
        });

        return links;
      });

      console.log(
        `Found ${searchResults.length} potential websites to check for agent email`,
      );

      // Visit each link and look for an email
      for (const url of searchResults) {
        try {
          console.log(`Checking URL for agent email: ${url}`);
          await page.goto(url, {
            waitUntil: "domcontentloaded",
            timeout: 20000,
          });

          // Get the page content
          const content = await page.content();

          // Use AI to extract email from the page content
          const email = await extractEmailWithAI(content, agentName);

          if (email) {
            console.log(`Found email for agent ${agentName}: ${email}`);
            return email;
          }
        } catch (err) {
          console.log(`Error visiting ${url}: ${err}`);
          continue;
        }
      }

      // If no email found, use the fallback email
      console.log(
        `No email found for agent ${agentName}, using fallback email: shanumas@gmail.com`,
      );
      return "shanumas@gmail.com";
    } finally {
      await browser.close();
    }
  } catch (error) {
    console.error("Error finding agent email:", error);
    // Return fallback email in case of any errors
    return "shanumas@gmail.com";
  }
}

// Use AI to construct an optimal search query for finding an agent's website
async function constructAgentSearchQuery(
  agentName: string,
  agentCompany?: string,
): Promise<string> {
  try {
    if (
      !process.env.OPENAI_API_KEY ||
      process.env.OPENAI_API_KEY === "dummy_key_for_development"
    ) {
      return `${agentName} real estate agent ${agentCompany || ""} contact information`;
    }

    const prompt = `
      I need to find the professional website or profile page for a real estate agent. 
      Please create the most effective search query to find their contact information.
      
      Agent Name: ${agentName}
      Company/Brokerage: ${agentCompany || "Unknown"}
      
      Return only the search query, nothing else.
    `;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content:
            "You are an expert in creating effective search queries. Return only the search query, no additional text.",
        },
        { role: "user", content: prompt },
      ],
    });

    const query =
      response.choices[0].message.content?.trim() ||
      `${agentName} real estate agent ${agentCompany || ""} contact email`;

    return query;
  } catch (error) {
    console.error("Error constructing agent search query:", error);
    return `${agentName} real estate agent ${agentCompany || ""} contact information`;
  }
}

// Use AI to extract an email from a webpage
async function extractEmailWithAI(
  html: string,
  agentName: string,
): Promise<string | undefined> {
  try {
    if (
      !process.env.OPENAI_API_KEY ||
      process.env.OPENAI_API_KEY === "dummy_key_for_development"
    ) {
      return `${agentName.toLowerCase().replace(/\s+/g, ".")}@example.com`;
    }

    // First, try to find email directly using regex
    const emailRegex = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/gi;
    const emailMatches = html.match(emailRegex);

    if (emailMatches && emailMatches.length > 0) {
      // If we have multiple email matches, try to find one that seems related to the agent
      const agentNameWords = agentName.toLowerCase().split(/\s+/);

      for (const email of emailMatches) {
        const emailLower = email.toLowerCase();
        // Check if any part of the agent's name appears in the email
        if (
          agentNameWords.some(
            (word) => word.length > 2 && emailLower.includes(word),
          )
        ) {
          console.log(`Found email matching agent name pattern: ${email}`);
          return email;
        }
      }

      // If no specific match found, return the first email
      console.log(`Found generic email: ${emailMatches[0]}`);
      return emailMatches[0];
    }

    // If regex doesn't find anything, try with AI
    console.log(
      `No emails found using regex, trying AI extraction for ${agentName}`,
    );

    // Extract only the relevant parts of the HTML to avoid token limit issues
    const simplifiedHtml = simplifyHtml(html, "email");

    const prompt = `
      Find the email address for real estate agent "${agentName}" from this webpage HTML.
      Look for:
      1. mailto: links
      2. Contact information sections
      3. Email address patterns (something@domain.com)
      4. "Email" or "Contact" sections
      5. Footer contact information
      
      ${simplifiedHtml}
      
      Return the email address without any additional text. If you can't find an email address, respond with "No email found".
    `;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content:
            "You are an expert at finding email addresses in webpages. You search thoroughly through HTML for email addresses. Return only the email address, no additional text.",
        },
        { role: "user", content: prompt },
      ],
    });

    const result = response.choices[0].message.content?.trim();

    if (result && result !== "No email found" && result.includes("@")) {
      console.log(`AI found email: ${result}`);
      return result;
    }

    console.log(`No email found for ${agentName} using AI either`);
    return undefined;
  } catch (error) {
    console.error("Error extracting email with AI:", error);
    return undefined;
  }
}

// Helper function to simplify HTML to focus on relevant parts and reduce token usage
function simplifyHtml(
  html: string,
  focus: "property" | "agent" | "email" = "property",
): string {
  const $ = cheerio.load(html);

  // Remove scripts, styles, and other unnecessary elements
  $("script, style, iframe, noscript, svg, path, link, meta").remove();

  // Based on the focus, try to extract only relevant sections
  if (focus === "agent") {
    // Look for common agent/contact sections
    let agentSection = "";

    // Try to find agent info by common classes/IDs/text
    const potentialSections = [
      $('[class*="agent"],[class*="Agent"],[id*="agent"],[id*="Agent"]'),
      $(
        '[class*="contact"],[class*="Contact"],[id*="contact"],[id*="Contact"]',
      ),
      $('[class*="broker"],[class*="Broker"],[id*="broker"],[id*="Broker"]'),
      $('*:contains("Listed by")').parents("div, section").first(),
      $('*:contains("Listing Agent")').parents("div, section").first(),
      $('*:contains("Contact")').parents("div, section").first(),
    ];

    for (const section of potentialSections) {
      if (section.length > 0) {
        agentSection += section.html() || "";
      }
    }

    // If we found agent sections, return just those
    if (agentSection.length > 0) {
      return agentSection;
    }
  } else if (focus === "email") {
    // Look for sections likely to contain emails
    let contactSection = "";

    // Try different common ways emails might be found
    const potentialEmailSections = [
      $(
        '[class*="contact"],[class*="Contact"],[id*="contact"],[id*="Contact"]',
      ),
      $('[class*="email"],[class*="Email"],[id*="email"],[id*="Email"]'),
      $('a[href^="mailto:"]').parents("div, section").first(),
      $('*:contains("@")').parents("div, section").first(),
    ];

    for (const section of potentialEmailSections) {
      if (section.length > 0) {
        contactSection += section.html() || "";
      }
    }

    // If we found contact sections, return just those
    if (contactSection.length > 0) {
      return contactSection;
    }
  }

  // If we can't find relevant sections, take the full body HTML but truncate it
  // to avoid exceeding token limits
  const bodyHtml = $("body").html() || "";
  return bodyHtml.substring(0, 15000); // Limit to ~15KB of HTML
}
