// Test script for improved Puppeteer extraction with system chromium
import { extractPropertyWithPuppeteer } from './server/scrapers/puppeteer-direct-scraper.ts';

async function testScraper() {
  try {
    console.log("Starting scraper test...");
    
    // Test with a Redfin URL instead of Zillow (which has strong anti-bot measures)
    const result = await extractPropertyWithPuppeteer("https://www.redfin.com/CA/San-Francisco/1257-Fulton-St-94117/home/1220650");
    
    console.log("Extraction result:");
    console.log(JSON.stringify(result, null, 2));
    
    console.log("Scraper test completed successfully");
  } catch (error) {
    console.error("Scraper test failed:", error);
  }
}

testScraper();