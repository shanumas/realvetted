import { User, Property, Message } from "./schema";

// AI extracted property data
export interface PropertyAIData {
  address: string;
  city?: string;
  state?: string;
  zip?: string;
  price?: number;
  bedrooms?: number;
  bathrooms?: number;
  squareFeet?: number;
  propertyType?: string;
  yearBuilt?: number;
  sellerEmail?: string;
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
    status: string;
    createdAt: string | Date;
  };
  property: Property;
}
