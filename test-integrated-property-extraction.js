// Test script to verify integrated property extraction capabilities

import axios from 'axios';

// Test URLs from different real estate sites to find one that works best
const testUrls = [
  // Smaller regional/local sites (typically have less anti-bot protection)
  "https://www.homes.com/property/509-lake-shore-ter-s-lake-quivira-ks-66217/id-400026765562/",
  "https://www.homefinder.com/property/4-bedrooms-2-bathrooms-Residential-115246227-9902-Corella-Ave-Whittier-California-90603",
  
  // Mid-tier sites
  "https://www.trulia.com/p/ca/santa-clara/1883-hillebrant-pl-santa-clara-ca-95050--2084636767",
  "https://www.redfin.com/TX/Austin/4513-Spanish-Oak-Trl-78731/home/31264436",
  
  // Major sites (have the most aggressive protection)
  "https://www.realtor.com/realestateandhomes-detail/321-Cedros-Ave-Unit-A_Solana-Beach_CA_92075_M25131-96845",
  "https://www.zillow.com/homedetails/122-N-Clark-Dr-Los-Angeles-CA-90048/20516854_zpid/"
];

// Helper function to format the result data
function formatResult(result) {
  const { url, data } = result;
  console.log(`\n=== Testing URL: ${url} ===`);
  
  // List key extracted fields
  console.log(`Address: ${data.address}`);
  console.log(`City: ${data.city}`);
  console.log(`State: ${data.state}`);
  console.log(`ZIP: ${data.zip}`);
  
  // Agent information
  console.log(`\nAgent Information:`);
  console.log(`Listing Agent: ${data.listingAgentName || 'Not found'}`);
  console.log(`Listing Agent Company: ${data.listingAgentCompany || 'Not found'}`);
  console.log(`Listing Agent License: ${data.listingAgentLicenseNo || 'Not found'}`);
  console.log(`Listing Agent Phone: ${data.listingAgentPhone || 'Not found'}`);
  
  // Property details
  console.log(`\nProperty Details:`);
  console.log(`Property Type: ${data.propertyType || 'Not found'}`);
  console.log(`Bedrooms: ${data.bedrooms || 'Not found'}`);
  console.log(`Bathrooms: ${data.bathrooms || 'Not found'}`);
  console.log(`Square Feet: ${data.squareFeet || 'Not found'}`);
  console.log(`Price: ${data.price || 'Not found'}`);
  console.log(`Year Built: ${data.yearBuilt || 'Not found'}`);
  
  console.log('\n-----------------------------------\n');
}

// Main test function
async function testPropertyExtraction() {
  console.log("==== Testing Integrated Property Extraction ====\n");
  
  const results = [];
  
  // Process each URL
  for (const url of testUrls) {
    try {
      console.log(`Testing URL: ${url}`);
      
      const response = await axios.post('http://localhost:5000/api/test/extract-property-from-url', {
        url
      });
      
      results.push({
        url,
        data: response.data,
        success: true
      });
      
    } catch (error) {
      console.error(`Error testing URL ${url}:`, error.message);
      results.push({
        url,
        error: error.message,
        success: false
      });
    }
  }
  
  // Format and display results
  console.log("\n==== Test Results ====\n");
  
  results.forEach(result => {
    if (result.success) {
      formatResult(result);
    } else {
      console.log(`\n=== Failed Test: ${result.url} ===`);
      console.log(`Error: ${result.error}`);
      console.log('\n-----------------------------------\n');
    }
  });
  
  // Summary
  const successCount = results.filter(r => r.success).length;
  console.log(`\n==== Summary ====`);
  console.log(`Total tests: ${results.length}`);
  console.log(`Successful: ${successCount}`);
  console.log(`Failed: ${results.length - successCount}`);
}

// Run the test
testPropertyExtraction().catch(error => {
  console.error('Test failed with error:', error);
});