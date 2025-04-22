import puppeteer from "puppeteer";
import * as cheerio from "cheerio";
import OpenAI from "openai";
import { PropertyAIData } from "@shared/types";

// Initialize the OpenAI client
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * Extract property data directly from the listing URL using Puppeteer and Cheerio
 *
 * This function opens a headless browser, navigates to the property listing URL,
 * extracts the HTML content, and uses OpenAI to parse the relevant property information.
 *
 * @param url The URL of the property listing
 * @returns Structured property data
 */
export async function extractPropertyWithDirectScraping(
  url: string,
): Promise<PropertyAIData> {
  console.log(`Direct scraping of property data from URL: ${url}`);

  let browser;
  try {
    // Launch a headless browser
    browser = await puppeteer.launch({
      headless: "new",
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-accelerated-2d-canvas",
        "--disable-gpu",
      ],
    });

    // Open a new page
    const page = await browser.newPage();

    // Set user agent to avoid detection
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
    );

    // Navigate to the URL
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });

    // Wait for the content to load
    await page.waitForSelector("body", { timeout: 5000 });

    // Extract the HTML content
    const htmlContent = await page.content();

    console.log("htmlContent 0 :" + htmlContent);

    // Parse the HTML with cheerio
    const $ = cheerio.load(htmlContent);

    // Extract basic metadata like title and description
    const title = $("title").text() || "";
    const metaDescription = $('meta[name="description"]').attr("content") || "";

    // Simplify HTML for the AI to process by keeping only relevant parts
    let simplifiedHtml = "";

    // Try to extract relevant sections
    const mainContent =
      $("main").html() ||
      $('div[id*="main"]').html() ||
      $('div[class*="main"]').html();
    if (mainContent) {
      simplifiedHtml += mainContent;
    }

    // Also grab anything that might contain agent or property information
    const propertyDetailSection =
      $(
        'div[id*="property"], div[class*="property"], section[id*="property"], section[class*="property"]',
      ).html() || "";
    const agentSection =
      $(
        'div[id*="agent"], div[class*="agent"], section[id*="agent"], section[class*="agent"]',
      ).html() || "";

    if (propertyDetailSection) {
      simplifiedHtml += propertyDetailSection;
    }

    console.log("simplifiedHtml  :" + simplifiedHtml);

    if (agentSection) {
      simplifiedHtml += agentSection;
    }

    // If we couldn't find any specific sections, use the whole body (limited)
    if (!simplifiedHtml) {
      simplifiedHtml = $("body").html()?.substring(0, 50000) || "";
    }

    // Close the browser
    await browser.close();

    // Extract structured data using OpenAI
    const extractedData = await extractDataWithOpenAI(
      title,
      metaDescription,
      simplifiedHtml,
      url,
    );

    // Process agent license number
    if (extractedData.listingAgentLicenseNo) {
      extractedData.listingAgentLicenseNo = cleanLicenseNumber(
        extractedData.listingAgentLicenseNo,
      );
    }

    if (extractedData.sellerLicenseNo) {
      extractedData.sellerLicenseNo = cleanLicenseNumber(
        extractedData.sellerLicenseNo,
      );
    }

    // Process numeric fields
    if (typeof extractedData.price === "string" && extractedData.price) {
      // Remove non-numeric characters and convert to number
      const priceNum = extractedData.price.replace(/[^0-9]/g, "");
      if (priceNum) {
        extractedData.price = parseInt(priceNum, 10) || "";
      }
    }

    if (typeof extractedData.bedrooms === "string" && extractedData.bedrooms) {
      const bedroomsNum = extractedData.bedrooms.replace(/[^0-9.]/g, "");
      if (bedroomsNum) {
        extractedData.bedrooms = bedroomsNum;
      }
    }

    if (
      typeof extractedData.bathrooms === "string" &&
      extractedData.bathrooms
    ) {
      const bathroomsNum = extractedData.bathrooms.replace(/[^0-9.]/g, "");
      if (bathroomsNum) {
        extractedData.bathrooms = bathroomsNum;
      }
    }

    if (
      typeof extractedData.squareFeet === "string" &&
      extractedData.squareFeet
    ) {
      const sqftNum = extractedData.squareFeet.replace(/[^0-9]/g, "");
      if (sqftNum) {
        extractedData.squareFeet = sqftNum;
      }
    }

    if (
      typeof extractedData.yearBuilt === "string" &&
      extractedData.yearBuilt
    ) {
      const yearNum = extractedData.yearBuilt.replace(/[^0-9]/g, "");
      if (yearNum) {
        extractedData.yearBuilt = yearNum;
      }
    }

    return extractedData;
  } catch (error) {
    console.error("Direct HTML scraping failed:", error);
    if (browser) {
      await browser.close();
    }
    throw new Error(
      "Failed to extract property data from direct HTML scraping",
    );
  }
}

/**
 * Extract structured property data from HTML content using OpenAI
 *
 * @param title The page title
 * @param metaDescription The meta description
 * @param htmlContent The HTML content of the property listing
 * @param originalUrl The original property URL
 * @returns Structured property data
 */
async function extractDataWithOpenAI(
  title: string,
  metaDescription: string,
  htmlContent: string,
  originalUrl: string,
): Promise<PropertyAIData> {
  try {
    // Construct the prompt with the HTML content
    const context = `
URL: ${originalUrl}
Page Title: ${title}
Meta Description: ${metaDescription}

HTML Content (truncated):
${htmlContent.substring(0, 100000)} 
`;

    // Extract structured data using OpenAI
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `Extract listing info and output ONLY this JSON:

{
  address:"",
  city:"",
  state:"",
  zip:"",
  propertyType:"",
  bedrooms:"",
  bathrooms:"",
  squareFeet:"",
  price:"",
  yearBuilt:"",
  description:"",
  features:[],
  listedby:"",
  listingAgentName:"",
  listingAgentPhone:"",
  listingAgentCompany:"",
  listingAgentLicenseNo:""
}

• Agent block can read like  
  "Listed by: Gary J. Snow DRE #01452902 415‑601‑5223, Vantage Realty 415‑846‑4685".
  Order and punctuation may vary.

• Strip license prefixes:  
  *"DRE" (with **optional** "#" and/or space)*, CalDRE, Lic., License, BRE.

• listingAgentPhone = first phone found.  
• If a field is missing, output "" (or [] for features).

Return nothing else.
`,
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
      const nameMatch = listedby.match(
        /(?:Listed by:?\s*|Contact:?\s*|Agent:?\s*)([A-Z][a-z]+ [A-Z][a-z]+)/i,
      );
      if (nameMatch && nameMatch[1]) {
        agentName = nameMatch[1];
      } else {
        // Fallback: just take first two words that look like a name (start with capital)
        const words = listedby.split(/\s+/);
        const nameWords = words.filter((word: string) =>
          /^[A-Z][a-z]+$/.test(word),
        );
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
        /(?:call|contact|reach)\s+([A-Z][a-z]+ [A-Z][a-z]+)\s+(?:at|on)\s+(\d{3}[-\.\s]??\d{3}[-\.\s]??\d{4})/i,
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
          /(?:with|at|from)\s+([A-Z][A-Za-z\s]+(?:Realty|Properties|Homes|Real Estate|Group|Associates))/,
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
      listingAgentEmail: "", // Will be populated later if needed
      propertyUrl: originalUrl,
      imageUrls: [], // Images would need to be extracted separately
      sellerName: extractedData.listingAgentName || "",
      sellerPhone: extractedData.listingAgentPhone || "",
      sellerCompany: extractedData.listingAgentCompany || "",
      sellerLicenseNo: extractedData.listingAgentLicenseNo || "",
      sellerEmail: "",
    };

    return propertyData;
  } catch (error) {
    console.error("OpenAI extraction failed:", error);
    throw error;
  }
}

/**
 * Helper function to strip license prefixes
 * @param licenseNo License number with possible prefix
 * @returns Clean license number without prefix
 */
function cleanLicenseNumber(
  licenseNo: string | null | undefined,
): string | null | undefined {
  if (!licenseNo) return licenseNo;

  // Remove any prefix like "DRE", "DRE #", "CalDRE", etc. and keep only the numbers
  return licenseNo
    .replace(/^(DRE\s*#?|CalDRE\s*#?|Lic\.|License|BRE\s*#?)\s*/i, "")
    .trim();
}
