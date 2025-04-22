// Test script to verify integrated property extraction capabilities

import axios from 'axios';

// Test URLs from different formats and sources
const testUrls = [
  "https://www.zillow.com/homedetails/122-N-Clark-Dr-Los-Angeles-CA-90048/20516854_zpid/",
  "https://www.zillow.com/homedetails/456-Park-Ave-New-York-NY-10022/12345_zpid/",
  "https://www.zillow.com/homedetails/123-Main-St-San-Jose-CA-95113/12345_zpid/"
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