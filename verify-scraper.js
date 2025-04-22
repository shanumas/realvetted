import { scrapePropertyListing } from './server/scrapers/property-scraper-with-serp.js';

// Test URL - a realtor.com listing
const testUrl = 'https://www.realtor.com/realestateandhomes-detail/1257-Fulton-St_San-Francisco_CA_94117_M13170-40455';

async function testScraper() {
  console.log('Testing property scraper with URL:', testUrl);
  
  try {
    const result = await scrapePropertyListing(testUrl);
    console.log('Scraper test completed successfully!');
    console.log('Result data:', JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('Error in scraper test:', error.message);
    if (error.stack) {
      console.error('Stack trace:', error.stack);
    }
  }
}

testScraper().catch(console.error);