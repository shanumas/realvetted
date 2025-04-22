// Test script for the property extraction functionality
import { extractPropertyFromUrl, apiExtractPropertyData } from './server/openai.js';

// Test URLs
const urls = [
  'https://www.realtor.com/realestateandhomes-detail/1257-Fulton-St_San-Francisco_CA_94117_M13170-40455',
  'https://www.zillow.com/homedetails/123-Main-St-San-Francisco-CA-94103/123456789_zpid/',
  'https://www.redfin.com/CA/San-Francisco/123-Main-St-94103/home/12345'
];

// Configure API key (will use environment variable)
async function testExtraction() {
  console.log('Testing property extraction from URLs...');
  
  for (const url of urls) {
    console.log(`\n------ Testing URL: ${url} ------`);
    
    try {
      console.log('Method 1: Using the multi-layered extraction approach:');
      const result1 = await extractPropertyFromUrl(url);
      console.log('Result:', JSON.stringify(result1, null, 2));
    } catch (error) {
      console.error('Error in multi-layered extraction:', error.message);
    }
    
    try {
      console.log('\nMethod 2: Using OpenAI-only extraction:');
      const result2 = await apiExtractPropertyData(url);
      console.log('Result:', JSON.stringify(result2, null, 2));
    } catch (error) {
      console.error('Error in OpenAI-only extraction:', error.message);
    }
    
    console.log('\n------ End Test ------');
  }
}

// Run the test
testExtraction().catch(console.error);