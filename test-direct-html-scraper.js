// Test script for the direct HTML scraper

import axios from 'axios';
import { extractDirectHtml } from './server/scrapers/direct-html-scraper.ts';

// Test URLs from different non-Zillow sources
const testUrls = [
  'https://www.realtor.com/realestateandhomes-detail/123-Main-St_San-Francisco_CA_94109_M12345-67890',
  'https://www.redfin.com/CA/San-Francisco/123-Main-St-94109/home/12345678',
  'https://www.trulia.com/p/ca/san-francisco/123-main-st-san-francisco-ca-94109--2012345678'
];

// Main test function
async function testDirectHtmlScraper() {
  console.log("==== Testing Direct HTML Scraper ====\n");
  
  for (const url of testUrls) {
    try {
      console.log(`Testing URL: ${url}`);
      
      // Test with our direct HTML scraper
      const result = await extractDirectHtml(url);
      
      // Display extracted data
      console.log("\nExtracted Data:");
      console.log(`Address: ${result.address || 'Not extracted'}`);
      console.log(`City: ${result.city || 'Not extracted'}`);
      console.log(`State: ${result.state || 'Not extracted'}`);
      console.log(`ZIP: ${result.zip || 'Not extracted'}`);
      console.log(`Property Type: ${result.propertyType || 'Not extracted'}`);
      console.log(`Bedrooms: ${result.bedrooms || 'Not extracted'}`);
      console.log(`Bathrooms: ${result.bathrooms || 'Not extracted'}`);
      console.log(`Square Feet: ${result.squareFeet || 'Not extracted'}`);
      console.log(`Price: ${result.price || 'Not extracted'}`);
      
      console.log("\nAgent Information:");
      console.log(`Listing Agent: ${result.listingAgentName || 'Not extracted'}`);
      console.log(`Listing Agent Company: ${result.listingAgentCompany || 'Not extracted'}`);
      console.log(`Listing Agent License: ${result.listingAgentLicenseNo || 'Not extracted'}`);
      console.log(`Listing Agent Phone: ${result.listingAgentPhone || 'Not extracted'}`);
      
      console.log("\n-----------------------------------\n");
      
    } catch (error) {
      console.error(`Error for URL ${url}:`, error.message);
      console.log("\n-----------------------------------\n");
    }
  }
}

// Run the test
testDirectHtmlScraper().catch(error => {
  console.error('Testing failed:', error);
});