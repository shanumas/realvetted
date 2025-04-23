import { User, Property, Message, ViewingRequest } from "./schema";

// AI extracted property data
export interface PropertyAIData {
  address: string; // Make address required for form submission but optional for API

  price?: number | string | null;
  bedrooms?: number | string | null;
  bathrooms?: number | string | null;
  // Original property source information
  propertyUrl?: string; // Property listing page URL that was extracted from

  listingAgentName?: string; // Name of the listing agent
  listingAgentEmail?: string; // Email of the listing agent
  listingAgentPhone?: string; // Phone number of the listing agent
  listingAgentLicenseNo?: string; // License number of the listing agent
  listingAgentCompany?: string; // Real estate company of the listing agent

  // Property details
  description?: string; // Property description
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
