import { PropertyAIData } from "@shared/types";
import { apiRequest } from "./queryClient";

export async function extractPropertyData(address: string): Promise<PropertyAIData> {
  try {
    const response = await apiRequest("POST", "/api/ai/extract-property", { address });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || "Failed to extract property data");
    }
    
    const responseData = await response.json();
    
    // Handle both formats - the new { success: true, data: propertyData } format 
    // and the old direct data format for backward compatibility
    if (responseData.success && responseData.data) {
      return responseData.data;
    }
    
    return responseData;
  } catch (error) {
    console.error("Error extracting property data:", error);
    throw new Error(error instanceof Error ? error.message : "Failed to extract property data. Please try again.");
  }
}

export async function extractPropertyFromUrl(url: string): Promise<PropertyAIData> {
  try {
    const response = await apiRequest("POST", "/api/ai/extract-property-from-url", { url });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || "Failed to extract property data from URL");
    }
    
    const responseData = await response.json();
    
    // Handle both formats - the new { success: true, data: propertyData } format 
    // and the old direct data format for backward compatibility
    if (responseData.success && responseData.data) {
      return responseData.data;
    }
    
    return responseData;
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
