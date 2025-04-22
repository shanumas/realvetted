// Test script for running the Zillow scraper

import { extractZillowPropertyData, findZillowUrl } from './server/scrapers/zillow-scraper.js';

async function testZillowScraper() {
  try {
    console.log("Testing the Zillow scraper...");
    
    // Test 1: Test with a direct Zillow URL
    const zillowUrl = "https://www.zillow.com/homedetails/1257-Fulton-St-San-Francisco-CA-94117/2082658425_zpid/";
    console.log(`\nTest 1: Extracting from direct Zillow URL: ${zillowUrl}`);
    
    const propertyData = await extractZillowPropertyData(zillowUrl);
    
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
    console.log(`Raw Listing Agent Text: ${propertyData.listedby}`);
    
    // Test 2: Test the findZillowUrl function with a non-Zillow URL or address
    const address = "123 Main St, San Francisco, CA";
    console.log(`\n\nTest 2: Finding Zillow URL for an address: ${address}`);
    
    const foundZillowUrl = await findZillowUrl(address);
    console.log(`Found Zillow URL: ${foundZillowUrl || "None found"}`);
    
    // Only try to extract from the found URL if one was found
    if (foundZillowUrl) {
      console.log(`\nAttempting to extract data from found URL: ${foundZillowUrl}`);
      const foundPropertyData = await extractZillowPropertyData(foundZillowUrl);
      console.log(`Found Property Address: ${foundPropertyData.address}`);
    }
    
    console.log("\nZillow scraper tests completed.");
    
  } catch (error) {
    console.error("Error testing Zillow scraper:", error.message);
    console.error(error.stack);
  }
}

testZillowScraper();