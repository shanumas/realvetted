// Test script for Puppeteer extraction
import { extractPropertyFromUrl } from './server/extraction';

async function testExtraction() {
  try {
    console.log("Starting extraction test...");
    
    const result = await extractPropertyFromUrl("https://www.zillow.com/homedetails/1033-Girard-St-San-Francisco-CA-94134/15172734_zpid/");
    
    console.log("Extraction result:");
    console.log(JSON.stringify(result, null, 2));
    
    console.log("Extraction test completed successfully");
  } catch (error) {
    console.error("Extraction test failed:", error);
  }
}

testExtraction();