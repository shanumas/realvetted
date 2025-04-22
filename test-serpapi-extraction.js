/**
 * Test the integration of SerpAPI with our property extraction system
 * 
 * This test script verifies that:
 * 1. We can extract address information from a URL
 * 2. We can find a Realtor.com URL for a property using SerpAPI
 * 3. The complete extraction flow works with the SerpAPI step
 */

import { getRealtorUrlFromAnyRealEstateUrl } from './server/scrapers/serpapi-extractor.js';
import { extractPropertyFromUrl } from './server/extraction.js';

// Test URLs from different real estate sites
const testUrls = [
  // Zillow (has strongest anti-bot protection)
  "https://www.zillow.com/homedetails/1257-Fulton-St-San-Francisco-CA-94117/2082658425_zpid/",
  
  // Redfin (mid-tier protection)
  "https://www.redfin.com/CA/San-Francisco/1450-Post-St-94109/unit-907/home/49254099",
  
  // Realtor.com (for comparison)
  "https://www.realtor.com/realestateandhomes-detail/1230-Page-St_San-Francisco_CA_94117_M18600-18071"
];

// Format the output for readability
function formatPropertyData(data) {
  const { address, city, state, zip, bedrooms, bathrooms, price, _realtorUrl } = data;
  
  return {
    address,
    location: `${city}, ${state} ${zip}`,
    bedrooms,
    bathrooms,
    price,
    listingAgent: data.listingAgentName || 'Not found',
    agentCompany: data.listingAgentCompany || 'Not found',
    agentPhone: data.listingAgentPhone || 'Not found',
    agentLicense: data.listingAgentLicenseNo || 'Not found',
    _realtorUrl: _realtorUrl || 'Direct extraction'
  };
}

// Test just the SerpAPI step
async function testRealtorUrlExtraction() {
  console.log("\n========= TESTING REALTOR.COM URL EXTRACTION WITH SERPAPI =========\n");
  
  for (const url of testUrls) {
    console.log(`\nTesting URL: ${url}`);
    
    try {
      const realtorUrl = await getRealtorUrlFromAnyRealEstateUrl(url);
      
      if (realtorUrl) {
        console.log(`✅ Found Realtor.com URL: ${realtorUrl}`);
      } else {
        console.log(`❌ Could not find a Realtor.com URL for this property`);
      }
    } catch (error) {
      console.error(`Error extracting Realtor.com URL: ${error.message}`);
    }
    
    console.log("-".repeat(80));
  }
}

// Test the full extraction process with SerpAPI integration
async function testFullExtractionWithSerpApi() {
  console.log("\n========= TESTING FULL EXTRACTION WITH SERPAPI INTEGRATION =========\n");
  
  for (const url of testUrls) {
    console.log(`\nTesting full extraction for URL: ${url}`);
    
    try {
      const startTime = Date.now();
      const propertyData = await extractPropertyFromUrl(url);
      const endTime = Date.now();
      
      console.log(`✅ Extraction completed in ${(endTime - startTime) / 1000} seconds`);
      console.log(`Property data extracted:`, formatPropertyData(propertyData));
      
      if (propertyData._realtorUrl) {
        console.log(`Used Realtor.com URL: ${propertyData._realtorUrl}`);
      } else {
        console.log(`Used direct extraction (no Realtor.com URL found or needed)`);
      }
    } catch (error) {
      console.error(`Error in full extraction: ${error.message}`);
    }
    
    console.log("-".repeat(80));
  }
}

// Run all tests
async function runTests() {
  // Test 1: Just the SerpAPI step
  await testRealtorUrlExtraction();
  
  // Test 2: Full extraction with SerpAPI integration
  await testFullExtractionWithSerpApi();
}

// Execute tests
runTests().catch(error => {
  console.error('Test execution failed:', error);
});