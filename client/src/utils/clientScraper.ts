import type { PropertyAIData } from '../../../shared/types';

/**
 * Client-side property data extractor
 * This function extracts property data directly from Realtor.com pages in the browser
 * It avoids server-side scraping which gets rate-limited/blocked
 * 
 * @param url The Realtor.com URL to extract data from
 * @returns Promise with the extracted property data
 */
export async function extractPropertyFromRealtorUrl(url: string): Promise<PropertyAIData> {
  try {
    // Validate it's a Realtor.com URL
    if (!url.includes('realtor.com')) {
      throw new Error('This function only works with Realtor.com URLs');
    }

    // Create a fetch request with browser-like headers
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'DNT': '1',
        'Upgrade-Insecure-Requests': '1',
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch Realtor.com page: ${response.status} ${response.statusText}`);
    }

    // Get the HTML content
    const htmlContent = await response.text();
    
    // Parse the HTML to extract property data
    const propertyData = parseRealtorHtml(htmlContent, url);
    
    return {
      ...propertyData,
      propertyUrl: url,
      _extractionMethod: 'client-side-direct',
      _extractionTimestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error('Client-side extraction error:', error);
    
    // Return a minimal data structure with error info
    return {
      propertyUrl: url,
      address: 'Extraction failed',
      _extractionMethod: 'client-side-failed',
      _extractionError: error instanceof Error ? error.message : String(error),
      _extractionTimestamp: new Date().toISOString(),
    } as PropertyAIData;
  }
}

/**
 * Parse Realtor.com HTML to extract property data
 * Uses DOM parsing to extract key property details
 * 
 * @param html The HTML content from Realtor.com
 * @param url The original URL for reference
 * @returns The extracted property data
 */
function parseRealtorHtml(html: string, url: string): PropertyAIData {
  // Create a DOM parser to extract information
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  // Check if we hit a CAPTCHA or blocking page
  if (html.includes('Your request could not be processed') || 
      html.includes('detected as a bot') || 
      html.includes('CAPTCHA')) {
    throw new Error('Realtor.com has blocked this request. Try again later or from a different network.');
  }

  // Initialize empty property data
  const propertyData: PropertyAIData = {
    propertyUrl: url,
    address: '',
  };

  try {
    // Extract address information
    const addressElement = doc.querySelector('[data-testid="address"]');
    if (addressElement) {
      propertyData.address = addressElement.textContent?.trim() || '';
      
      // Try to parse city, state, zip from address
      const addressParts = propertyData.address.split(',');
      if (addressParts.length >= 2) {
        const stateZipPart = addressParts[addressParts.length - 1].trim();
        const stateZipMatch = stateZipPart.match(/([A-Z]{2})\s+(\d{5})/);
        
        if (stateZipMatch) {
          propertyData.state = stateZipMatch[1];
          propertyData.zip = stateZipMatch[2];
        }
        
        if (addressParts.length >= 2) {
          propertyData.city = addressParts[addressParts.length - 2].trim();
        }
      }
    }
    
    // Extract price
    const priceElement = doc.querySelector('[data-testid="price"]');
    if (priceElement) {
      const priceText = priceElement.textContent || '';
      // Convert price like "$1,299,000" to numeric 1299000
      propertyData.price = Number(priceText.replace(/[$,]/g, ''));
    }
    
    // Extract bedrooms and bathrooms
    const bedsBathsArea = doc.querySelector('[data-testid="bed-bath-beyond"]');
    if (bedsBathsArea) {
      const bedsElement = bedsBathsArea.querySelector('[data-testid="property-meta-beds"]');
      if (bedsElement) {
        const bedsText = bedsElement.textContent || '';
        const bedsMatch = bedsText.match(/(\d+)/);
        if (bedsMatch) {
          propertyData.bedrooms = Number(bedsMatch[1]);
        }
      }
      
      const bathsElement = bedsBathsArea.querySelector('[data-testid="property-meta-baths"]');
      if (bathsElement) {
        const bathsText = bathsElement.textContent || '';
        const bathsMatch = bathsText.match(/(\d+(\.\d+)?)/);
        if (bathsMatch) {
          propertyData.bathrooms = Number(bathsMatch[1]);
        }
      }
      
      const sqftElement = bedsBathsArea.querySelector('[data-testid="property-meta-sq-ft"]');
      if (sqftElement) {
        const sqftText = sqftElement.textContent || '';
        const sqftMatch = sqftText.match(/(\d+,?\d*)/);
        if (sqftMatch) {
          propertyData.squareFeet = Number(sqftMatch[1].replace(/,/g, ''));
        }
      }
    }
    
    // Extract agent information
    const agentSection = doc.querySelector('[data-testid="listing-agent-container"]');
    if (agentSection) {
      const agentName = agentSection.querySelector('[data-testid="listing-agent-name"]');
      if (agentName) {
        propertyData.listingAgentName = agentName.textContent?.trim() || '';
      }
      
      const agentCompany = agentSection.querySelector('[data-testid="listing-agent-brokerage"]');
      if (agentCompany) {
        propertyData.listingAgentCompany = agentCompany.textContent?.trim() || '';
      }
      
      const agentPhone = agentSection.querySelector('[data-testid="listing-agent-phone"]');
      if (agentPhone) {
        propertyData.listingAgentPhone = agentPhone.textContent?.trim().replace(/[^0-9]/g, '') || '';
      }
    }

    // Extract property details
    const propertyDetails = doc.querySelector('[data-testid="property-detail-container"]');
    if (propertyDetails) {
      const yearBuiltSection = Array.from(propertyDetails.querySelectorAll('div')).find(div => 
        div.textContent?.includes('Year built')
      );
      
      if (yearBuiltSection) {
        const yearMatch = yearBuiltSection.textContent?.match(/Year built[:\s]+(\d{4})/) || [];
        if (yearMatch[1]) {
          propertyData.yearBuilt = Number(yearMatch[1]);
        }
      }
      
      const propertyTypeSection = Array.from(propertyDetails.querySelectorAll('div')).find(div => 
        div.textContent?.includes('Property type')
      );
      
      if (propertyTypeSection) {
        const typeMatch = propertyTypeSection.textContent?.match(/Property type[:\s]+(.+?)(?:$|\n)/) || [];
        if (typeMatch[1]) {
          propertyData.propertyType = typeMatch[1].trim();
        }
      }
    }
    
  } catch (parseError) {
    console.error('Error parsing Realtor.com HTML:', parseError);
    // We don't throw here, just return what we have so far
  }

  return propertyData;
}

/**
 * Convert a Zillow or other real estate URL to a Realtor.com URL using server API
 * This function calls your backend API which uses SerpAPI safely
 * 
 * @param url The original property URL (from Zillow, Redfin, etc.)
 * @returns Promise with the Realtor.com URL if found
 */
export async function findRealtorUrlFromOtherSite(url: string): Promise<string | null> {
  try {
    const response = await fetch('/api/property/find-realtor-url', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ originalUrl: url }),
    });
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    return data.realtorUrl || null;
  } catch (error) {
    console.error('Error finding Realtor.com URL:', error);
    return null;
  }
}

/**
 * Extract property information directly from the URL structure
 * This is a fallback method when we can't scrape the website directly
 * Uses simple pattern matching to extract address, city, state, zip
 * 
 * @param url Property URL to analyze
 * @returns Basic property data extracted from URL patterns
 */
export function extractFromUrlStructure(url: string): PropertyAIData {
  const propertyData: PropertyAIData = {
    address: 'Address unavailable',
    propertyUrl: url,
    _extractionMethod: 'url-analysis',
    _extractionTimestamp: new Date().toISOString(),
  };
  
  try {
    // Remove protocol and www
    const cleanUrl = url.replace(/^https?:\/\/(www\.)?/, '');
    
    // Extract domain
    const domain = cleanUrl.split('/')[0];
    propertyData.sourceSite = domain;
    
    // Different patterns for different sites
    if (domain.includes('zillow.com')) {
      // Example: zillow.com/homedetails/1234-Main-St-San-Francisco-CA-94117/123456_zpid/
      const addressMatch = cleanUrl.match(/homedetails\/([^\/]+)/);
      if (addressMatch && addressMatch[1]) {
        const addressPart = addressMatch[1].replace(/-/g, ' ');
        
        // Try to extract city, state, zip
        const cityStateMatch = addressPart.match(/([A-Za-z\s]+)\s([A-Z]{2})\s(\d{5})/);
        if (cityStateMatch) {
          propertyData.address = addressPart.replace(cityStateMatch[0], '').trim();
          propertyData.city = cityStateMatch[1].trim();
          propertyData.state = cityStateMatch[2];
          propertyData.zip = cityStateMatch[3];
        } else {
          propertyData.address = addressPart;
        }
      }
    } else if (domain.includes('redfin.com')) {
      // Example: redfin.com/CA/San-Francisco/123-Main-St-94117/home/12345
      const stateMatch = cleanUrl.match(/\/([A-Z]{2})\/([^\/]+)/);
      if (stateMatch) {
        propertyData.state = stateMatch[1];
        
        const cityStreetMatch = stateMatch[2].split('/');
        if (cityStreetMatch.length >= 2) {
          propertyData.city = cityStreetMatch[0].replace(/-/g, ' ');
          
          // Extract address and potentially zip
          const streetZipMatch = cityStreetMatch[1].match(/(.+)-(\d{5})/);
          if (streetZipMatch) {
            propertyData.address = streetZipMatch[1].replace(/-/g, ' ');
            propertyData.zip = streetZipMatch[2];
          } else {
            propertyData.address = cityStreetMatch[1].replace(/-/g, ' ');
          }
        }
      }
    } else if (domain.includes('realtor.com')) {
      // Example: realtor.com/realestateandhomes-detail/123-Main-St_San-Francisco_CA_94117_M12345-67890
      const detailMatch = cleanUrl.match(/detail\/([^\/]+)/);
      if (detailMatch) {
        const parts = detailMatch[1].split('_');
        if (parts.length >= 4) {
          propertyData.address = parts[0].replace(/-/g, ' ');
          propertyData.city = parts[1].replace(/-/g, ' ');
          propertyData.state = parts[2];
          propertyData.zip = parts[3];
        }
      }
    }
    
    // Make sure address is presentable
    if (propertyData.address && propertyData.address !== 'Address unavailable') {
      // Capitalize first letter of each word in address
      propertyData.address = propertyData.address
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
    }
    
    if (propertyData.city) {
      // Capitalize first letter of each word in city
      propertyData.city = propertyData.city
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
    }
    
    return propertyData;
  } catch (error) {
    console.error('Error extracting from URL structure:', error);
    return propertyData;
  }
}

/**
 * Client-side property extraction for any real estate website
 * Uses a hybrid approach that runs completely in the browser:
 * 1. For Realtor.com URLs: Extract directly using DOM parsing
 * 2. For other sites: First try to find a Realtor.com equivalent URL, then extract
 * 3. If #2 fails, extract what we can from the URL structure
 * 
 * This approach avoids server-side scraping completely to prevent IP blocking
 * 
 * @param url Any real estate property URL
 * @returns The extracted property data
 */
export async function extractPropertyFromAnyUrl(url: string): Promise<PropertyAIData> {
  try {
    console.log('Extracting property data from URL:', url);
    
    // If it's already a Realtor.com URL, extract directly
    if (url.includes('realtor.com')) {
      console.log('Direct client extraction for Realtor.com URL');
      return await extractPropertyFromRealtorUrl(url);
    }
    
    // For other sites, try to find a Realtor.com equivalent first
    console.log('Finding Realtor.com equivalent URL...');
    const realtorUrl = await findRealtorUrlFromOtherSite(url);
    
    if (realtorUrl) {
      console.log('Found Realtor.com equivalent:', realtorUrl);
      // We found a Realtor.com URL, extract from it
      try {
        const data = await extractPropertyFromRealtorUrl(realtorUrl);
        return {
          ...data,
          sourceUrl: url, // Original URL entered by the user
          propertyUrl: realtorUrl, // The URL we extracted from
          _realtorUrl: realtorUrl, // Store the Realtor URL we used
          _extractionMethod: 'client-side-via-realtor',
        };
      } catch (realtorError) {
        console.error('Failed to extract from Realtor.com equivalent:', realtorError);
        // If Realtor.com extraction fails, fall back to URL analysis
      }
    } else {
      console.log('No Realtor.com equivalent found. Using URL analysis fallback.');
    }
    
    // Last resort: Try to extract information from the URL itself
    // This won't have detailed information, but can provide basic address data
    console.log('Falling back to URL structure analysis');
    const urlBasedData = extractFromUrlStructure(url);
    
    return {
      ...urlBasedData,
      sourceUrl: url,
      _extractionMethod: 'url-analysis',
      _extractionSource: 'Limited data extracted from URL structure. No Realtor.com equivalent found or extraction failed.',
    };
  } catch (error) {
    console.error('Property extraction error:', error);
    
    // Return minimal data with error info
    return {
      propertyUrl: url,
      address: 'Extraction failed',
      _extractionMethod: 'failed',
      _extractionError: error instanceof Error ? error.message : String(error),
      _extractionTimestamp: new Date().toISOString(),
    } as PropertyAIData;
  }
}