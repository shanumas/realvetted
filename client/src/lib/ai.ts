import { PropertyAIData } from "@shared/types";
import { apiRequest } from "./queryClient";

export async function extractPropertyData(address: string): Promise<PropertyAIData> {
  try {
    const response = await apiRequest("POST", "/api/ai/extract-property", { address });
    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Error extracting property data:", error);
    throw new Error("Failed to extract property data. Please try again.");
  }
}

/**
 * Extract property data from a URL
 * This function uses client-side scraping for Realtor.com URLs
 * and a hybrid approach for other sites
 * 
 * The process is:
 * 1. For Realtor.com URLs: Extract directly in the browser
 * 2. For other sites: Try to find a Realtor.com equivalent and scrape that
 * 3. As a fallback, extract data from the URL structure
 * 
 * @param url URL of the property listing
 * @returns Extracted property data
 */
export async function extractPropertyFromUrl(url: string): Promise<PropertyAIData> {
  try {
    console.log('Client extraction starting for URL:', url);
    
    // Import the client scraper dynamically to avoid server-side import issues
    const { extractPropertyFromAnyUrl } = await import('../utils/clientScraper');
    
    // Use our client-side extraction function
    const propertyData = await extractPropertyFromAnyUrl(url);
    
    // If we're using Realtor.com or got successful client-side extraction, use it directly
    if (propertyData._extractionMethod && 
        (propertyData._extractionMethod === 'client-side-direct' || 
         propertyData._extractionMethod === 'client-side-via-realtor')) {
      console.log('Using client-side extracted data with method:', propertyData._extractionMethod);
      return propertyData;
    }
    
    // For URL-based extraction (which is limited), try to augment with server data
    // but send the client-extracted data to avoid re-scraping Realtor.com on the server
    if (propertyData._extractionMethod === 'url-analysis') {
      console.log('Using URL-based extraction with limited data, augmenting with server data');
      try {
        const response = await apiRequest("POST", "/api/ai/extract-property-from-url", { 
          url,
          clientExtracted: propertyData // Send what we've already extracted
        });
        
        if (response.ok) {
          const serverData = await response.json();
          return serverData;
        }
      } catch (serverError) {
        console.error('Server augmentation failed, using client-only data:', serverError);
        // Continue with client-only data
      }
    }
    
    // Return whatever we have
    return propertyData;
  } catch (error) {
    console.error("Error extracting property data from URL:", error);
    throw new Error(error instanceof Error ? error.message : "Failed to extract property data. Please try again.");
  }
}

export async function deleteProperty(propertyId: number): Promise<{ success: boolean; message: string }> {
  try {
    const response = await apiRequest("DELETE", `/api/properties/${propertyId}`);
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || "Failed to delete property");
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Error deleting property:", error);
    throw new Error(error instanceof Error ? error.message : "Failed to delete property. Please try again.");
  }
}

export async function matchAgentsForProperty(propertyId: number): Promise<any> {
  try {
    const response = await apiRequest("POST", "/api/ai/match-agents", { propertyId });
    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Error matching agents:", error);
    throw new Error("Failed to match agents. Please try again.");
  }
}

export async function verifyKYCDocuments(userId: number, idFrontUrl: string, idBackUrl: string): Promise<any> {
  try {
    const response = await apiRequest("POST", "/api/ai/verify-kyc", { 
      userId, 
      idFrontUrl, 
      idBackUrl 
    });
    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Error verifying KYC documents:", error);
    throw new Error("Failed to verify documents. Please try again.");
  }
}
