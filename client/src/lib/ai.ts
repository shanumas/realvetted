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
