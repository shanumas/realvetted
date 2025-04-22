/**
 * SerpAPI-based property extractor for real estate listings
 * 
 * This module uses SerpAPI to search for a property on Realtor.com
 * based on a property URL from any real estate site
 */

import { getJson } from 'serpapi';
import { PropertyAIData } from '@shared/types';

// Get the SerpAPI key from environment variables
const SERPAPI_KEY = process.env.SERPAPI_KEY;

/**
 * Extract a Realtor.com URL for a property based on any real estate URL
 * 
 * @param originalUrl The original property URL (from Zillow, Redfin, etc.)
 * @returns The corresponding Realtor.com URL, or null if not found
 */
export async function getRealtorUrlFromAnyRealEstateUrl(originalUrl: string): Promise<string | null> {
  try {
    console.log(`Using SerpAPI to find Realtor.com URL for: ${originalUrl}`);
    
    // Extract address information from the original URL
    const addressInfo = extractAddressFromUrl(originalUrl);
    
    if (!addressInfo) {
      console.log('Could not extract address information from URL');
      return null;
    }
    
    // Create a search query for the property
    const { streetAddress, city, state, zip } = addressInfo;
    const searchQuery = `${streetAddress} ${city} ${state} ${zip} site:realtor.com`;
    
    // Use SerpAPI to search for the property on Realtor.com
    const result = await getJson({
      engine: "google",
      q: searchQuery,
      api_key: SERPAPI_KEY,
      num: 5, // Get top 5 results
    });
    
    // Extract the URL from the search results
    const organicResults = result.organic_results || [];
    
    // Find the first result from realtor.com that contains "/realestateandhomes-detail/"
    const realtorResult = organicResults.find((result: any) => {
      const link = result.link || '';
      return link.includes('realtor.com') && link.includes('/realestateandhomes-detail/');
    });
    
    if (realtorResult && realtorResult.link) {
      console.log(`Found Realtor.com URL: ${realtorResult.link}`);
      return realtorResult.link;
    } else {
      console.log('No matching Realtor.com URL found in search results');
      return null;
    }
  } catch (error) {
    console.error('Error in SerpAPI search:', error);
    return null;
  }
}

/**
 * Process a property URL using SerpAPI first, then fallback to direct scraping
 * 
 * @param url The original property URL
 * @param extractFunction The function to extract data from the URL
 * @returns The property data or null if extraction failed
 */
export async function processPropertyWithSerpApi(
  url: string,
  extractFunction: (url: string) => Promise<PropertyAIData>
): Promise<PropertyAIData | null> {
  try {
    // First try to get a Realtor.com URL for the property
    const realtorUrl = await getRealtorUrlFromAnyRealEstateUrl(url);
    
    if (realtorUrl) {
      // If we found a Realtor.com URL, extract data from it
      console.log(`Extracting property data from Realtor.com URL: ${realtorUrl}`);
      const propertyData = await extractFunction(realtorUrl);
      
      // Add the original URL to the property data
      return {
        ...propertyData,
        propertyUrl: url, // Keep the original URL as the source
        _realtorUrl: realtorUrl, // Add the Realtor.com URL as metadata
      };
    } else {
      // If we couldn't find a Realtor.com URL, try direct extraction with the original URL
      console.log(`No Realtor.com URL found, falling back to direct extraction from: ${url}`);
      return await extractFunction(url);
    }
  } catch (error) {
    console.error('Error in processPropertyWithSerpApi:', error);
    return null;
  }
}

/**
 * Extract address components from a real estate URL
 * 
 * This function tries to parse the URL structure to get the address, city, state, and zip
 * 
 * @param url The real estate property URL
 * @returns Object containing address components or null if parsing failed
 */
function extractAddressFromUrl(url: string): { streetAddress: string, city: string, state: string, zip: string } | null {
  try {
    // Create URL object
    const urlObj = new URL(url);
    const path = urlObj.pathname;
    
    // Parse different real estate sites
    if (url.includes('zillow.com')) {
      // Example: https://www.zillow.com/homedetails/123-Main-St-San-Francisco-CA-94111/12345_zpid/
      const addressMatch = path.match(/\/homedetails\/([^\/]+)/);
      if (addressMatch && addressMatch[1]) {
        const addressParts = addressMatch[1].split('-');
        
        // Find the state (usually 2 uppercase letters)
        let stateIndex = -1;
        for (let i = 0; i < addressParts.length; i++) {
          if (addressParts[i].length === 2 && addressParts[i] === addressParts[i].toUpperCase()) {
            stateIndex = i;
            break;
          }
        }
        
        if (stateIndex > 0) {
          const state = addressParts[stateIndex];
          const city = addressParts.slice(stateIndex - 1, stateIndex).join(' ');
          const zip = addressParts[stateIndex + 1] || '';
          const streetAddress = addressParts.slice(0, stateIndex - 1).join(' ');
          
          return { streetAddress, city, state, zip };
        }
      }
    } else if (url.includes('redfin.com')) {
      // Example: https://www.redfin.com/CA/San-Francisco/123-Main-St-94111/home/12345
      const stateMatch = path.match(/\/([A-Z]{2})\/([^\/]+)/);
      if (stateMatch && stateMatch[1] && stateMatch[2]) {
        const state = stateMatch[1];
        const cityAndAddress = stateMatch[2].split('/');
        
        if (cityAndAddress.length >= 2) {
          const city = cityAndAddress[0].replace(/-/g, ' ');
          let streetAddress = cityAndAddress[1].replace(/-/g, ' ');
          
          // Check if there's a zip code at the end of the street address
          const zipMatch = streetAddress.match(/(\d{5})$/);
          let zip = '';
          
          if (zipMatch) {
            zip = zipMatch[1];
            streetAddress = streetAddress.replace(/-\d{5}$/, '');
          }
          
          return { streetAddress, city, state, zip };
        }
      }
    } else if (url.includes('realtor.com')) {
      // Example: https://www.realtor.com/realestateandhomes-detail/123-Main-St_San-Francisco_CA_94111_M12345-67890
      const addressMatch = path.match(/\/realestateandhomes-detail\/([^\/]+)/);
      if (addressMatch && addressMatch[1]) {
        const parts = addressMatch[1].split('_');
        
        if (parts.length >= 4) {
          const streetAddress = parts[0].replace(/-/g, ' ');
          const city = parts[1].replace(/-/g, ' ');
          const state = parts[2];
          const zip = parts[3];
          
          return { streetAddress, city, state, zip };
        }
      }
    } else if (url.includes('trulia.com')) {
      // Example: https://www.trulia.com/p/ca/san-francisco/123-main-st-san-francisco-ca-94111--2084636767
      const addressMatch = path.match(/\/p\/([^\/]+)\/([^\/]+)/);
      if (addressMatch && addressMatch[1] && addressMatch[2]) {
        const state = addressMatch[1].toUpperCase();
        const cityAndAddress = addressMatch[2].split('/');
        
        if (cityAndAddress.length >= 1) {
          const fullAddress = cityAndAddress[0];
          
          // Try to extract city, state and zip from the full address
          const cityStateMatch = fullAddress.match(/(.+?)-([a-z-]+)-([a-z]{2})-(\d{5})/i);
          if (cityStateMatch) {
            const streetAddress = cityStateMatch[1].replace(/-/g, ' ');
            const city = cityStateMatch[2].replace(/-/g, ' ');
            const state = cityStateMatch[3].toUpperCase();
            const zip = cityStateMatch[4];
            
            return { streetAddress, city, state, zip };
          }
        }
      }
    }
    
    // If we get here, try a generic approach based on URL path segments
    // Extract what looks like a street address, city, state, and zip
    const segments = path.split('/').filter(s => s).map(s => s.replace(/-/g, ' '));
    
    // Look for segments that might contain address information
    for (const segment of segments) {
      // Look for a state code (2 uppercase letters) followed by a zip code
      const stateZipMatch = segment.match(/\b([A-Z]{2})\s+(\d{5})\b/);
      if (stateZipMatch) {
        const state = stateZipMatch[1];
        const zip = stateZipMatch[2];
        
        // Try to extract city and street address from context
        const parts = segment.split(stateZipMatch[0]);
        const beforeStateParts = parts[0].trim().split(' ');
        
        // Assume last word before state is city, everything before is address
        if (beforeStateParts.length > 1) {
          const city = beforeStateParts.pop() || '';
          const streetAddress = beforeStateParts.join(' ');
          
          return { streetAddress, city, state, zip };
        }
      }
    }
    
    // If we still don't have an address, look for address-like structure in URL
    const addressLikeRegex = /(\d+)[-\s]+([^-\s]+)[-\s]+([^-\s]+)[-\s]+([^-\s,]+)[,-\s]+([A-Za-z]{2})(?:[-\s]+(\d{5}))?/;
    const match = url.match(addressLikeRegex);
    
    if (match) {
      const streetNumber = match[1];
      const streetName = `${match[2]} ${match[3]}`;
      const city = match[4];
      const state = match[5].toUpperCase();
      const zip = match[6] || '';
      
      return {
        streetAddress: `${streetNumber} ${streetName}`,
        city,
        state,
        zip
      };
    }
    
    // Cannot parse the URL
    return null;
  } catch (error) {
    console.error('Error extracting address from URL:', error);
    return null;
  }
}