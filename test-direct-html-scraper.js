// Test script for direct HTML scraper

import { extractPropertyData } from './server/scrapers/direct-html-scraper.js';

async function testDirectHtmlScraper() {
  try {
    console.log("Testing the direct HTML scraper...");
    
    // Test with a real estate listing URL
    const listingUrl = "https://www.realtor.com/realestateandhomes-detail/123-Main-St_San-Francisco_CA_94111";
    
    console.log(`Attempting to extract data from: ${listingUrl}`);
    
    const propertyData = await extractPropertyData(listingUrl);
    
    console.log("\nProperty Data Extracted:");
    console.log("=======================");
    console.log(`Address: ${propertyData.address}`);
    console.log(`City: ${propertyData.city}`);
    console.log(`State: ${propertyData.state}`);
    console.log(`Zip: ${propertyData.zip}`);
    console.log(`Price: ${propertyData.price}`);
    console.log(`Bedrooms: ${propertyData.bedrooms}`);
    console.log(`Bathrooms: ${propertyData.bathrooms}`);
    console.log(`Square Feet: ${propertyData.squareFeet}`);
    console.log(`Year Built: ${propertyData.yearBuilt}`);
    console.log(`Property Type: ${propertyData.propertyType}`);
    
    console.log("\nListing Agent Information:");
    console.log("=========================");
    console.log(`Listing Agent Name: ${propertyData.listingAgentName}`);
    console.log(`Listing Agent Phone: ${propertyData.listingAgentPhone}`);
    console.log(`Listing Agent License #: ${propertyData.listingAgentLicenseNo}`);
    console.log(`Listing Agent Company: ${propertyData.listingAgentCompany}`);
    console.log(`Listing Agent Email: ${propertyData.listingAgentEmail}`);
    
    console.log("\nDirect HTML scraper test completed.");
    
  } catch (error) {
    console.error("Error testing direct HTML scraper:", error.message);
    console.error(error.stack);
  }
}

testDirectHtmlScraper();