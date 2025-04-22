// Test script for the property extraction functionality
import { extractPropertyFromUrl } from './server/extraction';

// Test URLs
const urls = [
  'https://www.realtor.com/realestateandhomes-detail/1257-Fulton-St_San-Francisco_CA_94117_M13170-40455',
  'https://www.zillow.com/homedetails/123-Main-St-San-Francisco-CA-94103/123456789_zpid/',
  'https://www.redfin.com/CA/San-Francisco/123-Main-St-94103/home/12345'
];

// Configure API key (will use environment variable)
async function testExtraction() {
  console.log('Testing property extraction from URLs with type normalization...');
  
  for (const url of urls) {
    console.log(`\n------ Testing URL: ${url} ------`);
    
    try {
      console.log('Using the multi-layered extraction approach with data normalization:');
      const result = await extractPropertyFromUrl(url);
      
      // Check the types of numeric fields
      console.log('\nField Types:');
      console.log(`bedrooms: ${typeof result.bedrooms}`);
      console.log(`bathrooms: ${typeof result.bathrooms}`);
      console.log(`squareFeet: ${typeof result.squareFeet}`);
      console.log(`price: ${typeof result.price}`);
      console.log(`yearBuilt: ${typeof result.yearBuilt}`);
      
      console.log('\nComplete Result:');
      console.log(JSON.stringify(result, null, 2));
    } catch (error) {
      console.error('Error in extraction:', error.message);
    }
    
    console.log('\n------ End Test ------');
  }
}

// Run the test
testExtraction().catch(console.error);