// Test script for Puppeteer extraction with multiple site testing
import { extractPropertyFromUrl } from './server/extraction';

async function testExtraction() {
  // Test with several real estate listing sites to find one with less aggressive bot protection
  const testUrls = [
    // Try a small local real estate site first (often have less protection)
    "https://www.homes.com/property/509-lake-shore-ter-s-lake-quivira-ks-66217/id-400026765562/",
    
    // Try a mid-tier real estate site 
    "https://www.trulia.com/p/ca/santa-clara/1883-hillebrant-pl-santa-clara-ca-95050--2084636767",
    
    // Try Realtor.com which might have more moderate protection
    "https://www.realtor.com/realestateandhomes-detail/321-Cedros-Ave-Unit-A_Solana-Beach_CA_92075_M25131-96845",
    
    // Finally, try Zillow as a last resort (most aggressive protection)
    "https://www.zillow.com/homedetails/1033-Girard-St-San-Francisco-CA-94134/15172734_zpid/"
  ];
  
  // Setting shorter timeout for faster overall testing
  const TIMEOUT_MS = 45000; // 45 seconds per site
  let succeeded = false;
  
  for (const url of testUrls) {
    if (succeeded) break;
    
    const siteName = new URL(url).hostname.replace('www.', '');
    
    console.log(`\nTesting extraction from ${siteName}...`);
    try {
      // Create a timeout promise
      const timeoutPromise = new Promise<any>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Extraction from ${siteName} timed out after ${TIMEOUT_MS/1000} seconds`));
        }, TIMEOUT_MS);
      });
      
      // Race between the extraction and the timeout
      const result = await Promise.race([
        extractPropertyFromUrl(url),
        timeoutPromise
      ]);
      
      console.log(`Extraction from ${siteName} completed. Checking result quality...`);
      
      // Verify that we actually got meaningful data
      const hasAddress = result.address && result.address !== "Address unavailable";
      const hasContent = Boolean(
        result.price || 
        result.bedrooms || 
        result.bathrooms || 
        result.squareFeet || 
        (result.features && result.features.length > 0) ||
        (result.imageUrls && result.imageUrls.length > 0)
      );
      
      if (hasAddress || hasContent) {
        console.log(`Extraction from ${siteName} provided meaningful data:`);
        console.log(JSON.stringify(result, null, 2));
        
        succeeded = true;
        console.log(`\n✅ Successfully extracted rich data from ${siteName}`);
      } else {
        console.log(`Extraction from ${siteName} returned empty/minimal data (likely from fallback method):`);
        console.log(JSON.stringify(result, null, 2));
        throw new Error("Data too minimal, likely from fallback URL parser");
      }
      
    } catch (error) {
      console.error(`❌ Extraction from ${siteName} failed:`, error.message);
      console.log("Trying next site...");
    }
  }
  
  if (!succeeded) {
    console.log("\n⚠️ All extraction attempts failed");
    console.log("The fallback URL extraction method should have provided some basic data");
    console.log("Consider using an API-based approach instead of direct scraping");
  }
}

testExtraction();