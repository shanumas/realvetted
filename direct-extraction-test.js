// Direct test script for property extraction functionality
import { extractPropertyFromUrl } from './server/extraction.ts';

// Test URL - a popular real estate listing
const testUrl = 'https://www.realtor.com/realestateandhomes-detail/1257-Fulton-St_San-Francisco_CA_94117_M13170-40455';

async function testDirectExtraction() {
  console.log('Testing property extraction directly with URL:', testUrl);
  try {
    const result = await extractPropertyFromUrl(testUrl);
    console.log('Extraction successful!');
    console.log('Extracted property data:');
    console.log(JSON.stringify(result, null, 2));
    
    // Check if we have the crucial fields
    console.log('\nExtraction quality check:');
    console.log('- Address:', result.address ? '✓' : '✗');
    console.log('- Price:', result.price ? '✓' : '✗');
    console.log('- Bedrooms:', result.bedrooms ? '✓' : '✗');
    console.log('- Bathrooms:', result.bathrooms ? '✓' : '✗');
    console.log('- Agent Name:', result.listingAgentName ? '✓' : '✗');
    console.log('- Agent Email:', result.listingAgentEmail ? '✓' : '✗');
  } catch (error) {
    console.error('Error testing property extraction:', error);
  }
}

// Run the test
testDirectExtraction();