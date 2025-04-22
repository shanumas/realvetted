/**
 * Property data scraper using SerpAPI to avoid detection
 * 
 * This uses SerpAPI to search for property details, bypassing anti-scraping measures
 * on real estate websites like Zillow, Redfin, etc.
 */

import axios from 'axios';
import { PropertyAIData } from '@shared/types';
import { cleanLicenseNumber } from './zillow-scraper';

// Check if SERPAPI_KEY is available
const SERPAPI_KEY = process.env.SERPAPI_KEY;

/**
 * Extract property data using SerpAPI
 * @param url Property URL or address to extract data for
 * @returns Structured property data
 */
export async function extractPropertyWithSerpApi(url: string): Promise<PropertyAIData> {
  if (!SERPAPI_KEY) {
    throw new Error('SERPAPI_KEY environment variable is not set');
  }

  console.log(`Extracting property data from ${url} using SerpAPI`);
  
  // Determine if the input is a URL or an address
  const isUrl = url.startsWith('http');
  
  let searchQuery: string;
  
  if (isUrl) {
    // If it's a URL, we need to extract what to search for
    try {
      const urlObj = new URL(url);
      const domain = urlObj.hostname;
      
      // Extract path components that might have property information
      const pathParts = urlObj.pathname.split('/').filter(Boolean);
      
      if (domain.includes('zillow.com')) {
        // For Zillow, we extract the address from the URL
        const addressPart = pathParts.find(part => part.includes('-') && (part.includes('CA-') || part.includes('NY-') || part.includes('FL-')));
        
        if (addressPart) {
          // Convert hyphens to spaces for better search
          searchQuery = addressPart.replace(/-/g, ' ') + ' property details';
        } else {
          searchQuery = url; // Just use the full URL if we can't extract
        }
      } else if (domain.includes('redfin.com')) {
        // For Redfin URLs
        const addressParts = pathParts.filter(part => !part.includes('home') && !part.match(/^\d+$/));
        searchQuery = addressParts.join(' ') + ' property details';
      } else {
        // Generic case - use cleaned up path for search
        searchQuery = pathParts.join(' ') + ' real estate listing';
      }
    } catch (error) {
      // If URL parsing fails, use the URL as is
      searchQuery = url;
    }
  } else {
    // If it's an address, use it directly
    searchQuery = url + ' property details';
  }
  
  try {
    // Make SerpAPI request to get property information
    const response = await axios.get('https://serpapi.com/search', {
      params: {
        api_key: SERPAPI_KEY,
        q: searchQuery,
        engine: 'google',
        gl: 'us',
        hl: 'en',
        location: 'United States'
      }
    });
    
    const data = response.data;
    
    // Initialize with default values
    const propertyData: PropertyAIData = {
      address: "Address unavailable",
      city: "",
      state: "",
      zip: "",
      propertyType: "",
      bedrooms: "",
      bathrooms: "",
      squareFeet: "",
      price: "",
      yearBuilt: "",
      description: "No description available",
      features: [],
      listedby: "",
      listingAgentName: "",
      listingAgentPhone: "",
      listingAgentCompany: "",
      listingAgentLicenseNo: "",
      listingAgentEmail: "",
      propertyUrl: url,
      imageUrls: [],
      sellerName: "",
      sellerPhone: "",
      sellerCompany: "",
      sellerLicenseNo: "",
      sellerEmail: ""
    };
    
    // Process SerpAPI results to extract property details
    if (data.organic_results && data.organic_results.length > 0) {
      // Look for real estate listings first
      const realEstateResults = data.organic_results.filter((result: any) => {
        const domain = new URL(result.link).hostname;
        return domain.includes('zillow.com') || 
               domain.includes('redfin.com') || 
               domain.includes('trulia.com') || 
               domain.includes('realtor.com') ||
               domain.includes('homes.com');
      });
      
      // Use either real estate results or all results
      const relevantResults = realEstateResults.length > 0 ? realEstateResults : data.organic_results;
      
      if (relevantResults.length > 0) {
        const mainResult = relevantResults[0];
        
        // Extract address and basic info
        if (mainResult.title) {
          // Address is often in the title
          const titleParts = mainResult.title.split(' - ');
          if (titleParts.length > 0) {
            propertyData.address = titleParts[0].trim();
            
            // Extract address components if possible
            const addressParts = propertyData.address.split(',');
            if (addressParts.length >= 3) {
              // Format might be "123 Main St, City, State ZIP"
              propertyData.city = addressParts[addressParts.length - 2].trim();
              
              // State and ZIP often come together
              const stateZipPart = addressParts[addressParts.length - 1].trim();
              const stateZipMatch = stateZipPart.match(/([A-Z]{2})\s+(\d{5})/);
              
              if (stateZipMatch) {
                propertyData.state = stateZipMatch[1];
                propertyData.zip = stateZipMatch[2];
              }
            }
          }
        }
        
        // Extract price, beds, baths from snippet or description
        if (mainResult.snippet) {
          const priceMatch = mainResult.snippet.match(/\$([0-9,]+)/);
          if (priceMatch) {
            propertyData.price = priceMatch[0];
          }
          
          const bedsMatch = mainResult.snippet.match(/(\d+)\s*bed/i);
          if (bedsMatch) {
            propertyData.bedrooms = bedsMatch[1];
          }
          
          const bathsMatch = mainResult.snippet.match(/(\d+(?:\.\d+)?)\s*bath/i);
          if (bathsMatch) {
            propertyData.bathrooms = bathsMatch[1];
          }
          
          const sqftMatch = mainResult.snippet.match(/(\d+(?:,\d+)?)\s*sq\s*ft/i);
          if (sqftMatch) {
            propertyData.squareFeet = sqftMatch[1].replace(',', '');
          }
          
          propertyData.description = mainResult.snippet;
        }
        
        // Update property URL if we found a better link
        if (mainResult.link && (mainResult.link.includes('zillow.com') || 
                                mainResult.link.includes('redfin.com') ||
                                mainResult.link.includes('realtor.com'))) {
          propertyData.propertyUrl = mainResult.link;
        }
      }
      
      // Try to extract agent information from knowledge graph if available
      if (data.knowledge_graph) {
        const kg = data.knowledge_graph;
        
        // Check for listing agent
        if (kg.listing_agent || kg.agent || kg.real_estate_agent) {
          const agentInfo = kg.listing_agent || kg.agent || kg.real_estate_agent;
          
          if (typeof agentInfo === 'string') {
            // Simple case - just the name
            propertyData.listingAgentName = agentInfo;
          } else if (typeof agentInfo === 'object') {
            // Object with more details
            propertyData.listingAgentName = agentInfo.name || '';
            propertyData.listingAgentPhone = agentInfo.phone || '';
            
            // License might be in a few different formats
            const license = agentInfo.license || agentInfo.license_number || '';
            if (license) {
              propertyData.listingAgentLicenseNo = cleanLicenseNumber(license) || license;
            }
            
            // Company or brokerage
            propertyData.listingAgentCompany = agentInfo.company || agentInfo.brokerage || '';
          }
        }
        
        // Property details
        if (kg.property_type) {
          propertyData.propertyType = kg.property_type;
        }
        
        if (kg.year_built) {
          propertyData.yearBuilt = kg.year_built.toString();
        }
        
        // Features often come as a list
        if (kg.features && Array.isArray(kg.features)) {
          propertyData.features = kg.features;
        }
      }
    }
    
    return propertyData;
    
  } catch (error) {
    console.error('SerpAPI extraction error:', error);
    throw new Error(`Failed to extract property data using SerpAPI: ${error instanceof Error ? error.message : String(error)}`);
  }
}