// Test script to call the property extraction API

import fetch from 'node-fetch';

async function testExtractionApi() {
  try {
    // First, login to get a session cookie
    console.log("Logging in...");
    const loginResponse = await fetch('http://localhost:5000/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        email: "76@0.com", 
        password: "password" 
      }),
    });
    
    if (!loginResponse.ok) {
      throw new Error(`Login failed with status: ${loginResponse.status}`);
    }
    
    // Get cookies from the login response
    const cookies = loginResponse.headers.get('set-cookie');
    console.log("Login successful, got authentication cookies");
    
    // Test with a direct Zillow URL
    const zillowUrl = "https://www.zillow.com/homedetails/1257-Fulton-St-San-Francisco-CA-94117/2082658425_zpid/";
    
    console.log(`Testing property extraction API with URL: ${zillowUrl}`);
    
    const response = await fetch('http://localhost:5000/api/ai/extract-property-from-url', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': cookies,
      },
      body: JSON.stringify({ url: zillowUrl }),
    });
    
    if (!response.ok) {
      throw new Error(`API request failed with status: ${response.status}`);
    }
    
    const data = await response.json();
    console.log('API Response:');
    console.log(JSON.stringify(data, null, 2));
    
    // Check specifically for the listing agent and broker data
    console.log("\nListing Agent Information from API:");
    console.log(`Name: ${data.listingAgentName || 'Not found'}`);
    console.log(`Phone: ${data.listingAgentPhone || 'Not found'}`);
    console.log(`License: ${data.listingAgentLicenseNo || 'Not found'}`);
    console.log(`Company: ${data.listingAgentCompany || 'Not found'}`);
    
  } catch (error) {
    console.error("Test failed:", error.message);
  }
}

testExtractionApi();