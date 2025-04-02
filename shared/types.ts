import { User, Property, Message } from "./schema";

// AI extracted property data
export interface PropertyAIData {
  address: string;  // Make address required for form submission but optional for API responses
  city?: string;
  state?: string;
  zip?: string;
  price?: number;
  bedrooms?: number;
  bathrooms?: number;
  squareFeet?: number;
  propertyType?: string;
  yearBuilt?: number;
  sellerName?: string;       // Name of the seller/listing agent
  sellerPhone?: string;      // Phone number of the seller/listing agent
  sellerEmail?: string;      // Email of the seller/listing agent
  sellerCompany?: string;    // Real estate company of the seller/listing agent
  sellerLicenseNo?: string;  // License number of the seller/listing agent
  propertyUrl?: string;      // Original property listing URL
  description?: string;      // Property description
  features?: string[];       // Property features/amenities
  imageUrls?: string[];      // Property image URLs
}

// Similar to PropertyAIData but allows address to be optional when extracting from HTML
export interface PropertyScraperResult extends Omit<PropertyAIData, 'address'> {
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
  type: 'message' | 'notification' | 'property_update' | 'claim_lead' | 'ping';
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
