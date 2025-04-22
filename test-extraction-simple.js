/**
 * Simple test for extraction functions
 * 
 * This script accesses the backend API endpoint directly
 */

import fetch from 'node-fetch';

async function testExtraction() {
  console.log("Testing property extraction via API endpoint");
  
  // Test URLs
  const testUrls = [
    // Zillow
    "https://www.zillow.com/homedetails/1257-Fulton-St-San-Francisco-CA-94117/2082658425_zpid/",
    
    // Redfin
    "https://www.redfin.com/CA/San-Francisco/1450-Post-St-94109/unit-907/home/49254099",
    
    // Realtor.com
    "https://www.realtor.com/realestateandhomes-detail/1230-Page-St_San-Francisco_CA_94117_M18600-18071"
  ];

  // Test extraction via API endpoint
  for (const url of testUrls) {
    console.log(`\nTesting extraction for: ${url}`);
    
    try {
      // Call the property extraction API endpoint
      const response = await fetch('http://localhost:5000/api/extract-property', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url }),
      });
      
      const result = await response.json();
      
      if (result.success) {
        const property = result.data;
        console.log(`✅ Successfully extracted property data:`);
        console.log(`- Address: ${property.address}`);
        console.log(`- Location: ${property.city}, ${property.state} ${property.zip}`);
        console.log(`- Price: ${property.price}`);
        console.log(`- Beds/Baths: ${property.bedrooms}bd / ${property.bathrooms}ba`);
        console.log(`- Agent: ${property.listingAgentName || 'Unknown'}`);
        console.log(`- Extraction method: ${property._extractionMethod || 'direct'}`);
        
        if (property._realtorUrl) {
          console.log(`- Used Realtor.com URL: ${property._realtorUrl}`);
        }
      } else {
        console.log(`❌ Extraction failed: ${result.error}`);
      }
    } catch (error) {
      console.error(`Error testing extraction: ${error.message}`);
    }
    
    console.log('-'.repeat(80));
  }
}

// Run the test
testExtraction().catch(error => {
  console.error('Test failed:', error);
});