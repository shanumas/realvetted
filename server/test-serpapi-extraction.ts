// Test script for the new SerpAPI-based property extraction
import { extractPropertyFromUrl } from './openai';

// Test URLs to extract property data from
const testUrls = [
  'https://www.realtor.com/realestateandhomes-detail/1257-Fulton-St_San-Francisco_CA_94117_M13170-40455',
  'https://www.zillow.com/homedetails/123-Main-St-San-Francisco-CA-94103/123456789_zpid/',
  'https://www.redfin.com/CA/San-Francisco/123-Main-St-94103/home/12345'
];

// Run the test
async function testSerpApiExtraction() {
  console.log('Testing SerpAPI property extraction...\n');
  
  for (const url of testUrls) {
    console.log(`Testing URL: ${url}`);
    
    try {
      const result = await extractPropertyFromUrl(url);
      console.log('Extraction successful!');
      console.log('Extracted data:', JSON.stringify(result, null, 2));
    } catch (error) {
      console.error('Error during extraction:', error);
    }
    
    console.log('\n---\n');
  }
}

// Execute the test
testSerpApiExtraction().catch(console.error);