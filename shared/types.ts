import { User, Property, Message, ViewingRequest } from "./schema";

// AI extracted property data
export interface PropertyAIData {
  address: string; // Make address required for form submission but optional for API responses
  city?: string;
  state?: string;
  zip?: string;
  price?: number | string | null;
  bedrooms?: number | string | null;
  bathrooms?: number | string | null;
  squareFeet?: number | string | null;
  propertyType?: string;
  yearBuilt?: number | string | null;
  // Original property source information
  propertyUrl?: string; // Property listing page URL that was extracted from
  sourceUrl?: string; // Original URL entered by the user
  sourceSite?: string; // Source website name (e.g., "zillow.com", "redfin.com")
  // Listing agent information
  sellerName?: string; // Name of the seller/listing agent
  sellerPhone?: string; // Phone number of the seller/listing agent
  sellerEmail?: string; // Email of the seller/listing agent
  sellerCompany?: string; // Real estate company of the seller/listing agent
  sellerLicenseNo?: string; // License number of the seller/listing agent
  // Enhanced listing agent information
  listedby?: string;
  listingAgentName?: string; // Name of the listing agent
  listingAgentEmail?: string; // Email of the listing agent
  listingAgentPhone?: string; // Phone number of the listing agent
  listingAgentCompany?: string; // Real estate company of the listing agent
  listingAgentLicenseNo?: string; // License number of the listing agent
  // Property details
  description?: string; // Property description
  features?: string[]; // Property features/amenities
  imageUrls?: string[]; // Property image URLs
  // Metadata for extraction process (internal use)
  _realtorUrl?: string; // URL from Realtor.com used for extraction via SerpAPI
  _extractionMethod?: string; // Method used to extract property data (direct, serpapi, url-analysis)
  _extractionTimestamp?: string; // Timestamp when the extraction was performed
  _extractionSource?: string; // Original URL that was used for extraction
}

// Similar to PropertyAIData but allows address to be optional when extracting from HTML
export interface PropertyScraperResult extends Omit<PropertyAIData, "address"> {
  address?: string;
}

// Socket message types
export interface ChatMessage {
  id: string | number;
  senderId: number;
  senderName: string;
  receiverId: number;
  content: string;
  timestamp: Date | string;
  propertyId: number;
}

export interface WebSocketMessage {
  type:
    | "message"
    | "notification"
    | "property_update"
    | "claim_lead"
    | "ping"
    | "pong"
    | "auth";
  data: any;
}

// API response types
export interface APIResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface PropertyWithParticipants extends Property {
  seller?: User;
  buyer?: User;
  agent?: User;
}

export interface LeadWithProperty {
  lead: {
    id: number;
    propertyId: number;
    agentId: number;
    status: string;
    createdAt: string | Date | null;
  };
  property: Property;
}

export interface PropertyActivityLogWithUser {
  id: number;
  propertyId: number;
  userId: number | null;
  activity: string;
  timestamp: string | Date;
  details: any;
  user?: {
    firstName: string | null;
    lastName: string | null;
    email: string;
    role: string;
  };
}

export interface ViewingRequestWithParticipants extends ViewingRequest {
  property?: Property;
  buyer?: User;
  agent?: User;

  // Additional fields for UI display
  date?: string | Date; // Alias for requestedDate for display purposes
  timeSlot?: string; // Derived from requestedDate/requestedEndDate
  feedback?: string; // Additional feedback for completed viewings
}
