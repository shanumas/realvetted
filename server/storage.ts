import { 
  User, InsertUser, Property, InsertProperty, 
  Message, InsertMessage, AgentLead, InsertAgentLead 
} from "@shared/schema";
import { LeadWithProperty, PropertyWithParticipants } from "@shared/types";
import { randomBytes } from "crypto";
import { scrypt } from "crypto";
import { promisify } from "util";

const scryptAsync = promisify(scrypt);

export interface IStorage {
  // User methods
  getUser(id: number): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUsersByRole(role: string): Promise<User[]>;
  getAllUsers(): Promise<User[]>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: number, data: Partial<User>): Promise<User>;
  
  // Property methods
  getProperty(id: number): Promise<Property | undefined>;
  getPropertyWithParticipants(id: number): Promise<PropertyWithParticipants | undefined>;
  getAllProperties(): Promise<Property[]>;
  getPropertiesByBuyer(buyerId: number): Promise<Property[]>;
  getPropertiesBySeller(sellerId: number): Promise<Property[]>;
  getPropertiesByAgent(agentId: number): Promise<Property[]>;
  createProperty(property: InsertProperty): Promise<Property>;
  updateProperty(id: number, data: Partial<Property>): Promise<Property>;
  
  // Message methods
  getMessage(id: number): Promise<Message | undefined>;
  getMessagesByProperty(propertyId: number): Promise<Message[]>;
  getMessagesBetweenUsers(propertyId: number, user1Id: number, user2Id: number): Promise<Message[]>;
  createMessage(message: InsertMessage): Promise<Message>;
  markMessageAsRead(id: number): Promise<Message>;
  
  // Agent lead methods
  getAgentLead(id: number): Promise<AgentLead | undefined>;
  getAvailableLeadsByAgent(agentId: number): Promise<LeadWithProperty[]>;
  createAgentLead(lead: InsertAgentLead): Promise<AgentLead>;
  updateAgentLead(id: number, data: Partial<AgentLead>): Promise<AgentLead>;
}

export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private properties: Map<number, Property>;
  private messages: Map<number, Message>;
  private agentLeads: Map<number, AgentLead>;
  private userIdCounter: number;
  private propertyIdCounter: number;
  private messageIdCounter: number;
  private leadIdCounter: number;

  constructor() {
    this.users = new Map();
    this.properties = new Map();
    this.messages = new Map();
    this.agentLeads = new Map();
    this.userIdCounter = 1;
    this.propertyIdCounter = 1;
    this.messageIdCounter = 1;
    this.leadIdCounter = 1;
    
    // Create initial admin user
    this.createUser({
      email: "admin@propertymatch.com",
      password: "admin123",
      firstName: "Admin",
      lastName: "User",
      role: "admin",
      profileStatus: "verified"
    });
  }

  // User methods
  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.email.toLowerCase() === email.toLowerCase()
    );
  }

  async getUsersByRole(role: string): Promise<User[]> {
    return Array.from(this.users.values()).filter(
      (user) => user.role === role
    );
  }

  async getAllUsers(): Promise<User[]> {
    return Array.from(this.users.values());
  }

  async createUser(userData: InsertUser): Promise<User> {
    const id = this.userIdCounter++;
    const now = new Date();
    
    const user: User = {
      id,
      email: userData.email,
      password: userData.password,
      firstName: userData.firstName || null,
      lastName: userData.lastName || null,
      phone: userData.phone || null,
      role: userData.role,
      profileStatus: userData.profileStatus || "pending",
      addressLine1: userData.addressLine1 || null,
      addressLine2: userData.addressLine2 || null,
      city: userData.city || null,
      state: userData.state || null,
      zip: userData.zip || null,
      dateOfBirth: userData.dateOfBirth || null,
      createdAt: now,
      idFrontUrl: userData.idFrontUrl || null,
      idBackUrl: userData.idBackUrl || null,
      isBlocked: false
    };
    
    this.users.set(id, user);
    return user;
  }

  async updateUser(id: number, data: Partial<User>): Promise<User> {
    const user = await this.getUser(id);
    
    if (!user) {
      throw new Error(`User with ID ${id} not found`);
    }
    
    const updatedUser = { ...user, ...data };
    this.users.set(id, updatedUser);
    
    return updatedUser;
  }

  // Property methods
  async getProperty(id: number): Promise<Property | undefined> {
    return this.properties.get(id);
  }

  async getPropertyWithParticipants(id: number): Promise<PropertyWithParticipants | undefined> {
    const property = await this.getProperty(id);
    
    if (!property) {
      return undefined;
    }
    
    const buyerId = property.createdBy;
    const sellerId = property.sellerId;
    const agentId = property.agentId;
    
    const buyer = buyerId ? await this.getUser(buyerId) : undefined;
    const seller = sellerId ? await this.getUser(sellerId) : undefined;
    const agent = agentId ? await this.getUser(agentId) : undefined;
    
    return {
      ...property,
      buyer,
      seller,
      agent
    };
  }

  async getAllProperties(): Promise<Property[]> {
    return Array.from(this.properties.values());
  }

  async getPropertiesByBuyer(buyerId: number): Promise<Property[]> {
    return Array.from(this.properties.values()).filter(
      (property) => property.createdBy === buyerId
    );
  }

  async getPropertiesBySeller(sellerId: number): Promise<Property[]> {
    return Array.from(this.properties.values()).filter(
      (property) => property.sellerId === sellerId
    );
  }

  async getPropertiesByAgent(agentId: number): Promise<Property[]> {
    return Array.from(this.properties.values()).filter(
      (property) => property.agentId === agentId
    );
  }

  async createProperty(propertyData: InsertProperty): Promise<Property> {
    const id = this.propertyIdCounter++;
    const now = new Date();
    
    const property: Property = {
      id,
      address: propertyData.address,
      city: propertyData.city || null,
      state: propertyData.state || null,
      zip: propertyData.zip || null,
      price: propertyData.price || null,
      bedrooms: propertyData.bedrooms || null,
      bathrooms: propertyData.bathrooms || null,
      squareFeet: propertyData.squareFeet || null,
      propertyType: propertyData.propertyType || null,
      yearBuilt: propertyData.yearBuilt || null,
      description: propertyData.description || null,
      createdAt: now,
      createdBy: propertyData.createdBy,
      sellerEmail: propertyData.sellerEmail || null,
      sellerId: propertyData.sellerId || null,
      agentId: propertyData.agentId || null,
      status: propertyData.status || "active"
    };
    
    this.properties.set(id, property);
    return property;
  }

  async updateProperty(id: number, data: Partial<Property>): Promise<Property> {
    const property = await this.getProperty(id);
    
    if (!property) {
      throw new Error(`Property with ID ${id} not found`);
    }
    
    const updatedProperty = { ...property, ...data };
    this.properties.set(id, updatedProperty);
    
    return updatedProperty;
  }

  // Message methods
  async getMessage(id: number): Promise<Message | undefined> {
    return this.messages.get(id);
  }

  async getMessagesByProperty(propertyId: number): Promise<Message[]> {
    return Array.from(this.messages.values()).filter(
      (message) => message.propertyId === propertyId
    ).sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  async getMessagesBetweenUsers(propertyId: number, user1Id: number, user2Id: number): Promise<Message[]> {
    return Array.from(this.messages.values()).filter(
      (message) => 
        message.propertyId === propertyId && 
        ((message.senderId === user1Id && message.receiverId === user2Id) ||
         (message.senderId === user2Id && message.receiverId === user1Id))
    ).sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  async createMessage(messageData: InsertMessage): Promise<Message> {
    const id = this.messageIdCounter++;
    const now = new Date();
    
    const message: Message = {
      id,
      propertyId: messageData.propertyId,
      senderId: messageData.senderId,
      receiverId: messageData.receiverId,
      content: messageData.content,
      timestamp: now,
      isRead: false
    };
    
    this.messages.set(id, message);
    return message;
  }

  async markMessageAsRead(id: number): Promise<Message> {
    const message = await this.getMessage(id);
    
    if (!message) {
      throw new Error(`Message with ID ${id} not found`);
    }
    
    const updatedMessage = { ...message, isRead: true };
    this.messages.set(id, updatedMessage);
    
    return updatedMessage;
  }

  // Agent lead methods
  async getAgentLead(id: number): Promise<AgentLead | undefined> {
    return this.agentLeads.get(id);
  }

  async getAvailableLeadsByAgent(agentId: number): Promise<LeadWithProperty[]> {
    const leads = Array.from(this.agentLeads.values()).filter(
      (lead) => lead.agentId === agentId && lead.status === "available"
    );
    
    const result: LeadWithProperty[] = [];
    
    for (const lead of leads) {
      const property = await this.getProperty(lead.propertyId);
      if (property) {
        result.push({
          lead,
          property
        });
      }
    }
    
    return result;
  }

  async createAgentLead(leadData: InsertAgentLead): Promise<AgentLead> {
    const id = this.leadIdCounter++;
    const now = new Date();
    
    const lead: AgentLead = {
      id,
      propertyId: leadData.propertyId,
      agentId: leadData.agentId,
      status: leadData.status || "available",
      createdAt: now
    };
    
    this.agentLeads.set(id, lead);
    return lead;
  }

  async updateAgentLead(id: number, data: Partial<AgentLead>): Promise<AgentLead> {
    const lead = await this.getAgentLead(id);
    
    if (!lead) {
      throw new Error(`Agent lead with ID ${id} not found`);
    }
    
    const updatedLead = { ...lead, ...data };
    this.agentLeads.set(id, updatedLead);
    
    return updatedLead;
  }
}

export const storage = new MemStorage();
