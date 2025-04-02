import axios from 'axios';
import * as cheerio from 'cheerio';
import puppeteer from 'puppeteer';
import OpenAI from "openai";
import { PropertyAIData, PropertyScraperResult } from '@shared/types';

const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY || "dummy_key_for_development" 
});

// Main function to scrape a property listing URL
export async function scrapePropertyListing(url: string): Promise<PropertyAIData> {
  try {
    // Validate URL (basic check)
    if (!url.match(/^https?:\/\//i)) {
      throw new Error('Invalid URL format. Please provide a complete URL starting with http:// or https://');
    }

    // Check if it's a Zillow URL
    if (url.includes('zillow.com')) {
      return await scrapeZillowListing(url);
    }
    
    // For other sites, use a generic scraper
    return await scrapeGenericListing(url);
  } catch (error) {
    console.error('Property scraping error:', error);
    throw new Error(`Failed to scrape property details: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Scraper for Zillow listings
async function scrapeZillowListing(url: string): Promise<PropertyAIData> {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  try {
    const page = await browser.newPage();
    
    // Set user agent to avoid detection
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
    
    // Navigate to the URL
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    
    // Wait for the content to load
    await page.waitForSelector('body', { timeout: 5000 });
    
    // Extract the HTML content
    const htmlContent = await page.content();
    
    // Parse the HTML with cheerio
    const $ = cheerio.load(htmlContent);
    
    // Use AI to extract structured data from the HTML
    const extractedData = await extractPropertyDataWithAI(htmlContent, url);
    
    // Find the agent/seller information section
    const agentInfo = await extractAgentInfoWithAI(htmlContent, url);
    
    // If agent email isn't found in the listing, try to find it from their website
    if (agentInfo.sellerName && !agentInfo.sellerEmail) {
      agentInfo.sellerEmail = await findAgentEmailFromWeb(agentInfo.sellerName, agentInfo.sellerCompany);
    }
    
    // Create a scraper result with possibly undefined address
    const scrapedResult: PropertyScraperResult = {
      ...extractedData,
      ...agentInfo,
      propertyUrl: url
    };
    
    // Make sure we have the required address field
    if (!scrapedResult.address) {
      scrapedResult.address = "Address information unavailable"; 
    }
    
    // Return with required address field populated
    return scrapedResult as PropertyAIData;
    
  } catch (error) {
    console.error('Zillow scraping error:', error);
    throw error;
  } finally {
    await browser.close();
  }
}

// Generic scraper for other real estate sites
async function scrapeGenericListing(url: string): Promise<PropertyAIData> {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  try {
    const page = await browser.newPage();
    
    // Set user agent to avoid detection
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
    
    // Navigate to the URL
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    
    // Wait for the content to load
    await page.waitForSelector('body', { timeout: 5000 });
    
    // Extract the HTML content
    const htmlContent = await page.content();
    
    // Use AI to extract structured data from the HTML
    const extractedData = await extractPropertyDataWithAI(htmlContent, url);
    
    // Find the agent/seller information
    const agentInfo = await extractAgentInfoWithAI(htmlContent, url);
    
    // If agent email isn't found in the listing, try to find it from their website
    if (agentInfo.sellerName && !agentInfo.sellerEmail) {
      agentInfo.sellerEmail = await findAgentEmailFromWeb(agentInfo.sellerName, agentInfo.sellerCompany);
    }
    
    // Create a scraper result with possibly undefined address
    const scrapedResult: PropertyScraperResult = {
      ...extractedData,
      ...agentInfo,
      propertyUrl: url
    };
    
    // Make sure we have the required address field
    if (!scrapedResult.address) {
      scrapedResult.address = "Address information unavailable"; 
    }
    
    // Return with required address field populated
    return scrapedResult as PropertyAIData;
    
  } catch (error) {
    console.error('Generic scraping error:', error);
    throw error;
  } finally {
    await browser.close();
  }
}

// Use OpenAI to extract structured property data from HTML
async function extractPropertyDataWithAI(html: string, url: string): Promise<Partial<PropertyAIData>> {
  try {
    // If no API key available, return placeholder data
    if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === "dummy_key_for_development") {
      console.log("Using mock data for property extraction (no API key)");
      return generateMockPropertyData(url);
    }
    
    // Extract only the relevant parts of the HTML to avoid token limit issues
    const simplifiedHtml = simplifyHtml(html);
    
    const prompt = `
      I have a real estate listing HTML content. Please extract the following property details from it:
      - Full Address (street, city, state, zip)
      - Property Type (Single Family, Condo, etc.)
      - Number of Bedrooms
      - Number of Bathrooms
      - Square Footage
      - Price
      - Year Built
      - Property Description (brief)
      - Features/Amenities (list of key features)
      
      Here's the HTML content:
      ${simplifiedHtml}
      
      Please format your response as a valid JSON object with these fields: 
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
        "features": ["feature1", "feature2", ...]
      }
      
      Return only the JSON with no additional text or explanation.
    `;
    
    const response = await openai.chat.completions.create({
      model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
      messages: [
        {
          role: "system",
          content: "You are a real estate data extraction expert. Extract structured property data from HTML."
        },
        { role: "user", content: prompt }
      ],
      response_format: { type: "json_object" }
    });
    
    const result = JSON.parse(response.choices[0].message.content || "{}");
    return result;
  } catch (error) {
    console.error("Error extracting property data with AI:", error);
    throw new Error("Failed to extract property data. Please try again later.");
  }
}

// Use OpenAI to extract agent/seller info from HTML
async function extractAgentInfoWithAI(html: string, url: string): Promise<Partial<PropertyAIData>> {
  try {
    // If no API key available, return placeholder data
    if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === "dummy_key_for_development") {
      console.log("Using mock data for agent extraction (no API key)");
      return {
        sellerName: "John Smith",
        sellerPhone: "555-123-4567",
        sellerEmail: `agent_${Math.floor(Math.random() * 1000)}@example.com`,
        sellerCompany: "Real Estate Company",
        sellerLicenseNo: `DRE #${Math.floor(Math.random() * 10000000)}`
      };
    }
    
    // Extract only the relevant parts of the HTML to avoid token limit issues
    const simplifiedHtml = simplifyHtml(html, 'agent');
    
    const prompt = `
      From this real estate listing HTML, extract information about the listing agent or seller:
      
      1. Agent/Seller Name
      2. Phone Number
      3. Email Address (if available)
      4. Real Estate Company/Brokerage
      5. License Number (usually in format like "DRE #12345678")
      
      Here's the HTML content:
      ${simplifiedHtml}
      
      Please format your response as a valid JSON object with these fields:
      {
        "sellerName": "full name",
        "sellerPhone": "phone number",
        "sellerEmail": "email address or null if not found",
        "sellerCompany": "company name",
        "sellerLicenseNo": "license number"
      }
      
      Return only the JSON with no additional text or explanation.
    `;
    
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "You are a data extraction expert. Extract agent/seller information from real estate listings."
        },
        { role: "user", content: prompt }
      ],
      response_format: { type: "json_object" }
    });
    
    const result = JSON.parse(response.choices[0].message.content || "{}");
    return result;
  } catch (error) {
    console.error("Error extracting agent info with AI:", error);
    return {};
  }
}

// Try to find the agent's email by searching for their website and extracting contact information
async function findAgentEmailFromWeb(agentName: string, agentCompany?: string): Promise<string | undefined> {
  try {
    // If no API key available, return placeholder data
    if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === "dummy_key_for_development") {
      console.log("Using mock data for agent email (no API key)");
      return `${agentName.toLowerCase().replace(/\s+/g, '.')}@example.com`;
    }
    
    // First, use AI to help construct a good search query
    const searchQuery = await constructAgentSearchQuery(agentName, agentCompany);
    
    // Use a simple browser to search
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    try {
      const page = await browser.newPage();
      
      // Search for the agent
      await page.goto(`https://www.google.com/search?q=${encodeURIComponent(searchQuery)}`, 
        { waitUntil: 'networkidle2', timeout: 30000 });
      
      // Extract the first few search result URLs
      const searchResults = await page.evaluate(() => {
        const links: string[] = [];
        const elements = document.querySelectorAll('a');
        
        for (const el of elements) {
          const href = el.getAttribute('href');
          if (href && href.startsWith('/url?q=') && 
              !href.includes('google.com') && 
              links.length < 3) {
            links.push(href.substring(7, href.indexOf('&')));
          }
        }
        
        return links;
      });
      
      // Visit each link and look for an email
      for (const url of searchResults) {
        try {
          await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
          
          // Get the page content
          const content = await page.content();
          
          // Use AI to extract email from the page content
          const email = await extractEmailWithAI(content, agentName);
          
          if (email) {
            return email;
          }
        } catch (err) {
          console.log(`Error visiting ${url}: ${err}`);
          continue;
        }
      }
      
      return undefined;
    } finally {
      await browser.close();
    }
  } catch (error) {
    console.error("Error finding agent email:", error);
    return undefined;
  }
}

// Use AI to construct an optimal search query for finding an agent's website
async function constructAgentSearchQuery(agentName: string, agentCompany?: string): Promise<string> {
  try {
    if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === "dummy_key_for_development") {
      return `${agentName} real estate agent ${agentCompany || ''} contact information`;
    }
    
    const prompt = `
      I need to find the professional website or profile page for a real estate agent. 
      Please create the most effective search query to find their contact information.
      
      Agent Name: ${agentName}
      Company/Brokerage: ${agentCompany || 'Unknown'}
      
      Return only the search query, nothing else.
    `;
    
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "You are an expert in creating effective search queries. Return only the search query, no additional text."
        },
        { role: "user", content: prompt }
      ]
    });
    
    const query = response.choices[0].message.content?.trim() || 
      `${agentName} real estate agent ${agentCompany || ''} contact email`;
    
    return query;
  } catch (error) {
    console.error("Error constructing agent search query:", error);
    return `${agentName} real estate agent ${agentCompany || ''} contact information`;
  }
}

// Use AI to extract an email from a webpage
async function extractEmailWithAI(html: string, agentName: string): Promise<string | undefined> {
  try {
    if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === "dummy_key_for_development") {
      return `${agentName.toLowerCase().replace(/\s+/g, '.')}@example.com`;
    }
    
    // Extract only the relevant parts of the HTML to avoid token limit issues
    const simplifiedHtml = simplifyHtml(html, 'email');
    
    const prompt = `
      Find the email address for real estate agent "${agentName}" from this webpage HTML:
      
      ${simplifiedHtml}
      
      Return the email address without any additional text. If you can't find an email address, respond with "No email found".
    `;
    
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "You are an expert at finding email addresses in webpages. Return only the email address, no additional text."
        },
        { role: "user", content: prompt }
      ]
    });
    
    const result = response.choices[0].message.content?.trim();
    
    if (result && result !== "No email found" && result.includes('@')) {
      return result;
    }
    
    return undefined;
  } catch (error) {
    console.error("Error extracting email with AI:", error);
    return undefined;
  }
}

// Helper function to simplify HTML to focus on relevant parts and reduce token usage
function simplifyHtml(html: string, focus: 'property' | 'agent' | 'email' = 'property'): string {
  const $ = cheerio.load(html);
  
  // Remove scripts, styles, and other unnecessary elements
  $('script, style, iframe, noscript, svg, path, link, meta').remove();
  
  // Based on the focus, try to extract only relevant sections
  if (focus === 'agent') {
    // Look for common agent/contact sections
    let agentSection = '';
    
    // Try to find agent info by common classes/IDs/text
    const potentialSections = [
      $('[class*="agent"],[class*="Agent"],[id*="agent"],[id*="Agent"]'),
      $('[class*="contact"],[class*="Contact"],[id*="contact"],[id*="Contact"]'),
      $('[class*="broker"],[class*="Broker"],[id*="broker"],[id*="Broker"]'),
      $('*:contains("Listed by")').parents('div, section').first(),
      $('*:contains("Listing Agent")').parents('div, section').first(),
      $('*:contains("Contact")').parents('div, section').first()
    ];
    
    for (const section of potentialSections) {
      if (section.length > 0) {
        agentSection += section.html() || '';
      }
    }
    
    // If we found agent sections, return just those
    if (agentSection.length > 0) {
      return agentSection;
    }
  } else if (focus === 'email') {
    // Look for sections likely to contain emails
    let contactSection = '';
    
    // Try different common ways emails might be found
    const potentialEmailSections = [
      $('[class*="contact"],[class*="Contact"],[id*="contact"],[id*="Contact"]'),
      $('[class*="email"],[class*="Email"],[id*="email"],[id*="Email"]'),
      $('a[href^="mailto:"]').parents('div, section').first(),
      $('*:contains("@")').parents('div, section').first()
    ];
    
    for (const section of potentialEmailSections) {
      if (section.length > 0) {
        contactSection += section.html() || '';
      }
    }
    
    // If we found contact sections, return just those
    if (contactSection.length > 0) {
      return contactSection;
    }
  }
  
  // If we can't find relevant sections, take the full body HTML but truncate it
  // to avoid exceeding token limits
  const bodyHtml = $('body').html() || '';
  return bodyHtml.substring(0, 15000); // Limit to ~15KB of HTML
}

// Generate mock data when no API key is available
function generateMockPropertyData(url: string): PropertyAIData {
  const addressMatch = url.match(/([0-9]+)-([A-Za-z\-]+)-([A-Za-z\-]+)-([A-Z]{2})-([0-9]+)/);
  let address = "123 Main St";
  let city = "San Francisco";
  let state = "CA";
  let zip = "94114";
  
  if (addressMatch && addressMatch.length >= 6) {
    address = `${addressMatch[1]} ${addressMatch[2].replace(/-/g, ' ')}`;
    city = addressMatch[3].replace(/-/g, ' ');
    state = addressMatch[4];
    zip = addressMatch[5];
  }
  
  const mockData: PropertyAIData = {
    address: address,
    city: city,
    state: state,
    zip: zip,
    propertyType: "Single Family",
    bedrooms: 3 + Math.floor(Math.random() * 3),
    bathrooms: 2 + Math.floor(Math.random() * 2),
    squareFeet: 1500 + Math.floor(Math.random() * 1000),
    price: 500000 + Math.floor(Math.random() * 1000000),
    yearBuilt: 1980 + Math.floor(Math.random() * 40),
    description: "Beautiful home in a great neighborhood with modern amenities and convenient location.",
    sellerName: "Jane Realtor",
    sellerPhone: "415-555-" + Math.floor(1000 + Math.random() * 9000),
    sellerEmail: `agent_${Math.floor(Math.random() * 1000)}@example.com`,
    sellerCompany: "Prestige Real Estate",
    sellerLicenseNo: `DRE #${Math.floor(Math.random() * 10000000)}`,
    propertyUrl: url,
    features: [
      "Hardwood floors",
      "Updated kitchen",
      "Spacious backyard",
      "Close to parks and schools",
      "Attached garage"
    ],
    imageUrls: [
      "https://example.com/property-image-1.jpg",
      "https://example.com/property-image-2.jpg",
      "https://example.com/property-image-3.jpg"
    ]
  };
  
  return mockData;
}