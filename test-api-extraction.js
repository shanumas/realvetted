/**
 * Test script for property extraction API endpoints
 * 
 * This script tests the extraction API with various real estate property URLs
 */

import axios from 'axios';

// Create axios instance with cookie support
const api = axios.create({ 
  baseURL: 'http://localhost:5000',
  withCredentials: true
});

// Login credentials (use test account)
const credentials = {
  email: '76@0.com',
  password: 'password'
};

// Test URLs from different real estate sites
const testUrls = [
  // Zillow (has strongest anti-bot protection)
  "https://www.zillow.com/homedetails/1033-Girard-St-San-Francisco-CA-94134/15172734_zpid/",
  
  // Redfin (mid-tier protection)
  "https://www.redfin.com/CA/San-Francisco/1450-Post-St-94109/unit-907/home/49254099",
  
  // Realtor.com (for comparison)
  "https://www.realtor.com/realestateandhomes-detail/1230-Page-St_San-Francisco_CA_94117_M18600-18071"
];

// Format the output for readability
function formatPropertyData(data) {
  if (!data) return "No data returned";
  
  const { address, city, state, zip, bedrooms, bathrooms, price, _realtorUrl, _extractionMethod } = data;
  
  return {
    address: address || "Not found",
    location: `${city || ""}, ${state || ""} ${zip || ""}`.trim(),
    bedrooms: bedrooms || "Not found",
    bathrooms: bathrooms || "Not found",
    price: price || "Not found",
    listingAgent: data.listingAgentName || 'Not found',
    agentCompany: data.listingAgentCompany || 'Not found',
    agentPhone: data.listingAgentPhone || 'Not found',
    agentLicense: data.listingAgentLicenseNo || 'Not found',
    extractionMethod: _extractionMethod || 'Not specified',
    realtorUrl: _realtorUrl || 'Direct extraction'
  };
}

// Test the property API endpoint
async function testPropertyExtraction() {
  console.log("\n===== TESTING PROPERTY EXTRACTION API ENDPOINT =====\n");
  
  // Login first to get session
  try {
    console.log("Logging in...");
    const loginResponse = await api.post('/api/auth/login', credentials);
    console.log(`Login successful: ${loginResponse.data.email}`);
  } catch (error) {
    console.error("Login failed:", error.response?.data || error.message);
    return;
  }
  
  // Test extraction for each URL
  for (const url of testUrls) {
    console.log(`\nTesting extraction for URL: ${url}`);
    
    try {
      const startTime = Date.now();
      const response = await api.post('/api/ai/extract-property-from-url', { url });
      const endTime = Date.now();
      
      if (response.data && response.data.address) {
        console.log(`✅ Extraction completed in ${(endTime - startTime) / 1000} seconds`);
        console.log(`Property data extracted:`, formatPropertyData(response.data));
      } else {
        console.log(`❌ Extraction failed or returned no data`);
        console.log(response.data);
      }
    } catch (error) {
      console.error(`Error in API extraction:`, error.response?.data || error.message);
    }
    
    console.log("-".repeat(80));
  }
}

// Run the test
testPropertyExtraction().catch(error => {
  console.error('Test execution failed:', error);
});