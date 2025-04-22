import { extractZillowPropertyData, findZillowUrl } from './server/scrapers/zillow-scraper.js';

async function testZillowScraper() {
  try {
    console.log("Testing Zillow URL finder...");
    // Test with a non-Zillow URL
    const nonZillowUrl = "https://www.realtor.com/realestateandhomes-detail/123-Main-St";
    const zillowUrl = await findZillowUrl(nonZillowUrl);
    console.log(`Found Zillow URL: ${zillowUrl || 'None found'}`);
    
    // Test with a direct Zillow URL
    console.log("\nTesting Zillow property extraction...");
    const testUrl = zillowUrl || "https://www.zillow.com/homedetails/1257-Fulton-St-San-Francisco-CA-94117/2082658425_zpid/";
    console.log(`Using URL: ${testUrl}`);
    
    const propertyData = await extractZillowPropertyData(testUrl);
    console.log("Extracted property data:");
    console.log(JSON.stringify(propertyData, null, 2));
    
    // Check specifically for the listing agent and broker data
    console.log("\nListing Agent Information:");
    console.log(`Name: ${propertyData.listingAgentName}`);
    console.log(`Phone: ${propertyData.listingAgentPhone}`);
    console.log(`License: ${propertyData.listingAgentLicenseNo}`);
    console.log(`Company: ${propertyData.listingAgentCompany}`);
    
  } catch (error) {
    console.error("Test failed:", error.message);
  }
}

testZillowScraper();