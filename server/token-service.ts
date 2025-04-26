import { randomBytes } from "crypto";
import { ViewingToken, ViewingRequest, Property, User } from "@shared/schema";
import { storage } from "./storage";

/**
 * Generate a cryptographically secure token
 * @param length The length of the token in bytes (will be twice this in hex)
 * @returns A random hex string
 */
export function generateToken(length: number = 32): string {
  return randomBytes(length).toString("hex");
}

/**
 * Create a token for a viewing request
 * @param viewingRequestId The ID of the viewing request
 * @param expirationDays How many days the token should be valid (default: 7)
 * @returns The created viewing token object
 */
export async function createViewingRequestToken(
  viewingRequestId: number,
  expirationDays: number = 7
): Promise<ViewingToken> {
  // Generate expiration date
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + expirationDays);
  
  // Create token
  const token = generateToken();
  
  // Save token in the database
  const viewingToken = await storage.createViewingToken({
    token,
    viewingRequestId,
    expiresAt,
    active: true,
  });
  
  return viewingToken;
}

/**
 * Create or get a public link for a viewing request
 * @param viewingRequestId The ID of the viewing request
 * @returns The full URL to access the viewing request publicly
 */
export async function getPublicViewingRequestLink(
  viewingRequestId: number
): Promise<string> {
  // Check if an active token exists
  const tokens = await storage.getViewingTokensByRequestId(viewingRequestId);
  const activeToken = tokens.find(t => t.active && new Date(t.expiresAt) > new Date());
  
  if (activeToken) {
    return createPublicLinkFromToken(activeToken.token);
  }
  
  // Create new token
  const newToken = await createViewingRequestToken(viewingRequestId);
  return createPublicLinkFromToken(newToken.token);
}

/**
 * Create the full public URL from a token
 * @param token The viewing token
 * @returns The full URL to access the viewing request
 */
function createPublicLinkFromToken(token: string): string {
  const baseUrl = process.env.PUBLIC_URL || `${process.env.REPL_SLUG}.replit.dev`;
  return `https://${baseUrl}/public/viewing-request/${token}`;
}

/**
 * Validate a viewing token and return the associated data if valid
 * @param token The token to validate
 * @returns An object with the viewing request, property, buyer, and agent if valid
 */
export async function validateViewingToken(token: string): Promise<{
  viewingRequest: ViewingRequest;
  property: Property;
  buyer: User;
  agent?: User;
  isValid: boolean;
  errorMessage?: string;
} | null> {
  try {
    // Get the token from database
    const viewingToken = await storage.getViewingTokenByToken(token);
    
    if (!viewingToken) {
      return {
        isValid: false,
        errorMessage: "Invalid or expired token",
      } as any;
    }
    
    // Check if token is still active
    if (!viewingToken.active) {
      return {
        isValid: false,
        errorMessage: "This link has been deactivated",
      } as any;
    }
    
    // Check if token has expired
    if (new Date(viewingToken.expiresAt) < new Date()) {
      return {
        isValid: false,
        errorMessage: "This link has expired",
      } as any;
    }
    
    // Get the viewing request
    const viewingRequest = await storage.getViewingRequest(viewingToken.viewingRequestId);
    
    if (!viewingRequest) {
      return {
        isValid: false,
        errorMessage: "The viewing request no longer exists",
      } as any;
    }
    
    // Get associated data
    const property = await storage.getProperty(viewingRequest.propertyId);
    const buyer = await storage.getUser(viewingRequest.buyerId);
    const agent = viewingRequest.buyerAgentId 
      ? await storage.getUser(viewingRequest.buyerAgentId)
      : undefined;
    
    if (!property || !buyer) {
      return {
        isValid: false,
        errorMessage: "Related property or buyer information not found",
      } as any;
    }
    
    // Update last accessed time
    await storage.updateViewingToken(viewingToken.id, { 
      lastAccessedAt: new Date() 
    });
    
    return {
      viewingRequest,
      property,
      buyer,
      agent,
      isValid: true
    };
  } catch (error) {
    console.error("Error validating viewing token:", error);
    return {
      isValid: false,
      errorMessage: "An error occurred while validating the token",
    } as any;
  }
}