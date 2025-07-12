import { 
  User, 
  InsertUser, 
  Property, 
  InsertProperty, 
  Agreement, 
  InsertAgreement, 
  Message, 
  InsertMessage, 
  Email, 
  InsertEmail,
  AgentLead,
  InsertAgentLead,
  PropertyActivityLog,
  InsertPropertyActivityLog,
  ViewingRequest,
  InsertViewingRequest,
  SupportMessage,
  InsertSupportMessage,
  ViewingToken,
  InsertViewingToken
} from "@shared/schema";
import { 
  LeadWithProperty, 
  PropertyWithParticipants, 
  PropertyActivityLogWithUser, 
  ViewingRequestWithParticipants 
} from "@shared/types";
import session from "express-session";

// In-memory storage for when database is unavailable
export class FallbackStorage {
  private users: Map<string, User> = new Map();
  private properties: Map<number, Property> = new Map();
  private agreements: Map<number, Agreement> = new Map();
  private messages: Map<number, Message> = new Map();
  private emails: Map<number, Email> = new Map();
  private agentLeads: Map<number, AgentLead> = new Map();
  private propertyActivityLogs: Map<number, PropertyActivityLog> = new Map();
  private viewingRequests: Map<number, ViewingRequest> = new Map();
  private supportMessages: Map<number, SupportMessage> = new Map();
  private viewingTokens: Map<number, ViewingToken> = new Map();
  private nextId = 1;
  public sessionStore: session.Store;

  constructor() {
    // Initialize with default admin user
    this.createDefaultAdmin();
    // Initialize session store
    this.sessionStore = new session.MemoryStore();
  }

  private createDefaultAdmin() {
    // Create a properly formatted hash for password "admin123"
    // This uses the same format as the auth.ts hashPassword function: {hex}.{salt}
    const adminUser: User = {
      id: 1,
      email: 'admin@admin.com',
      password: 'e8a05f3abeaae0557287c28ac609ebecd06485491a9629e1e4abcad1193f138f54595b5192b341114d0882d8b8e52e947b74c114c2005719265991faf732ed01.08185be556467e5079235196da1706f7', // admin123
      firstName: 'Admin',
      lastName: 'User',
      phone: null,
      role: 'admin',
      profileStatus: 'verified',
      addressLine1: null,
      addressLine2: null,
      city: null,
      state: null,
      zip: null,
      dateOfBirth: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      idFrontUrl: null,
      idBackUrl: null,
      isBlocked: false,
    };

    this.users.set('admin@admin.com', adminUser);
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    return this.users.get(email.toLowerCase());
  }

  async createUser(userData: InsertUser): Promise<User> {
    const user: User = {
      id: this.nextId++,
      email: userData.email.toLowerCase(),
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
      createdAt: new Date(),
      updatedAt: new Date(),
      idFrontUrl: userData.idFrontUrl || null,
      idBackUrl: userData.idBackUrl || null,
      isBlocked: false,
    };

    this.users.set(user.email, user);
    return user;
  }

  async getUser(id: number): Promise<User | undefined> {
    for (const user of this.users.values()) {
      if (user.id === id) {
        return user;
      }
    }
    return undefined;
  }

  getUserCount(): number {
    return this.users.size;
  }

  // Agreement methods
  async getAgreement(id: number): Promise<Agreement | undefined> {
    return this.agreements.get(id);
  }

  async getAgreementsByProperty(propertyId: number): Promise<Agreement[]> {
    return Array.from(this.agreements.values()).filter(a => a.propertyId === propertyId);
  }

  async getAgreementsByAgent(agentId: number): Promise<Agreement[]> {
    return Array.from(this.agreements.values()).filter(a => a.agentId === agentId);
  }

  async getAgreementsByType(type: string): Promise<Agreement[]> {
    return Array.from(this.agreements.values()).filter(a => a.type === type);
  }

  async getAgreementsByBuyer(buyerId: number): Promise<Agreement[]> {
    return Array.from(this.agreements.values()).filter(a => a.buyerId === buyerId);
  }

  async getGlobalBRBCForBuyerAgent(buyerId: number, agentId: number): Promise<Agreement | undefined> {
    return Array.from(this.agreements.values()).find(a => 
      a.buyerId === buyerId && a.agentId === agentId && a.type === 'brbc'
    );
  }

  async createAgreement(agreement: InsertAgreement): Promise<Agreement> {
    const newAgreement: Agreement = {
      id: this.nextId++,
      ...agreement,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    this.agreements.set(newAgreement.id, newAgreement);
    return newAgreement;
  }

  async updateAgreement(id: number, data: Partial<Agreement>): Promise<Agreement> {
    const agreement = this.agreements.get(id);
    if (!agreement) {
      throw new Error(`Agreement with id ${id} not found`);
    }
    const updatedAgreement = { ...agreement, ...data, updatedAt: new Date() };
    this.agreements.set(id, updatedAgreement);
    return updatedAgreement;
  }

  // Stub methods for other interfaces - return empty arrays/undefined for now
  async getUsersByRole(role: string): Promise<User[]> {
    return Array.from(this.users.values()).filter(u => u.role === role);
  }

  async getAllUsers(): Promise<User[]> {
    return Array.from(this.users.values());
  }

  async updateUser(id: number, data: Partial<User>): Promise<User> {
    const user = Array.from(this.users.values()).find(u => u.id === id);
    if (!user) {
      throw new Error(`User with id ${id} not found`);
    }
    const updatedUser = { ...user, ...data, updatedAt: new Date() };
    this.users.set(updatedUser.email, updatedUser);
    return updatedUser;
  }

  // Property methods - stubs
  async getProperty(id: number): Promise<Property | undefined> {
    return this.properties.get(id);
  }

  async getPropertyWithParticipants(id: number): Promise<PropertyWithParticipants | undefined> {
    const property = this.properties.get(id);
    if (!property) return undefined;
    return { ...property, participants: [] };
  }

  async getAllProperties(): Promise<Property[]> {
    return Array.from(this.properties.values());
  }

  async getPropertiesByBuyer(buyerId: number): Promise<Property[]> {
    const allProperties = Array.from(this.properties.values());
    console.log(`[DEBUG] Total properties in storage: ${allProperties.length}`);
    console.log(`[DEBUG] Looking for properties with createdBy: ${buyerId}`);
    
    const buyerProperties = allProperties.filter(p => {
      console.log(`[DEBUG] Property ${p.id}: createdBy=${p.createdBy}, matches=${p.createdBy === buyerId}`);
      return p.createdBy === buyerId;
    });
    
    console.log(`[DEBUG] Found ${buyerProperties.length} properties for buyer ${buyerId}`);
    return buyerProperties;
  }

  async getPropertiesBySeller(sellerId: number): Promise<Property[]> {
    return Array.from(this.properties.values()).filter(p => p.sellerId === sellerId);
  }

  async getPropertiesByAgent(agentId: number): Promise<Property[]> {
    return Array.from(this.properties.values()).filter(p => p.agentId === agentId);
  }

  async createProperty(property: InsertProperty): Promise<Property> {
    const newProperty: Property = {
      id: this.nextId++,
      ...property,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    this.properties.set(newProperty.id, newProperty);
    return newProperty;
  }

  async updateProperty(id: number, data: Partial<Property>): Promise<Property> {
    const property = this.properties.get(id);
    if (!property) {
      throw new Error(`Property with id ${id} not found`);
    }
    const updatedProperty = { ...property, ...data, updatedAt: new Date() };
    this.properties.set(id, updatedProperty);
    return updatedProperty;
  }

  async deleteProperty(id: number): Promise<void> {
    this.properties.delete(id);
  }

  // Stub methods for other required interfaces
  async createEmail(email: InsertEmail): Promise<Email> {
    const newEmail: Email = {
      id: this.nextId++,
      ...email,
      timestamp: new Date()
    };
    this.emails.set(newEmail.id, newEmail);
    return newEmail;
  }

  async getEmail(id: number): Promise<Email | undefined> {
    return this.emails.get(id);
  }

  async getAllEmails(): Promise<Email[]> {
    return Array.from(this.emails.values());
  }

  async getEmailsByUser(userId: number): Promise<Email[]> {
    return Array.from(this.emails.values()).filter(e => e.sentById === userId);
  }

  async getEmailsByRole(role: string): Promise<Email[]> {
    return Array.from(this.emails.values()).filter(e => e.sentByRole === role);
  }

  async getEmailsByRelatedEntity(entityType: string, entityId: number): Promise<Email[]> {
    return Array.from(this.emails.values()).filter(e => 
      e.relatedEntityType === entityType && e.relatedEntityId === entityId
    );
  }

  async updateEmailStatus(id: number, status: string, errorMessage?: string): Promise<Email> {
    const email = this.emails.get(id);
    if (!email) {
      throw new Error(`Email with id ${id} not found`);
    }
    const updatedEmail = { ...email, status, errorMessage };
    this.emails.set(id, updatedEmail);
    return updatedEmail;
  }

  // Message methods - stubs
  async getMessage(id: number): Promise<Message | undefined> {
    return this.messages.get(id);
  }

  async getMessagesByProperty(propertyId: number, getAllMessages?: boolean): Promise<Message[]> {
    return Array.from(this.messages.values()).filter(m => m.propertyId === propertyId);
  }

  async getMessagesBetweenUsers(propertyId: number, user1Id: number, user2Id: number): Promise<Message[]> {
    return Array.from(this.messages.values()).filter(m => 
      m.propertyId === propertyId && 
      ((m.senderId === user1Id && m.receiverId === user2Id) || 
       (m.senderId === user2Id && m.receiverId === user1Id))
    );
  }

  async createMessage(message: InsertMessage): Promise<Message> {
    const newMessage: Message = {
      id: this.nextId++,
      ...message,
      timestamp: new Date(),
      isRead: false
    };
    this.messages.set(newMessage.id, newMessage);
    return newMessage;
  }

  async markMessageAsRead(id: number): Promise<Message> {
    const message = this.messages.get(id);
    if (!message) {
      throw new Error(`Message with id ${id} not found`);
    }
    const updatedMessage = { ...message, isRead: true };
    this.messages.set(id, updatedMessage);
    return updatedMessage;
  }

  // Add other required stub methods
  async getAgentLead(id: number): Promise<AgentLead | undefined> {
    return this.agentLeads.get(id);
  }

  async getAvailableLeadsByAgent(agentId: number): Promise<LeadWithProperty[]> {
    return [];
  }

  async createAgentLead(lead: InsertAgentLead): Promise<AgentLead> {
    const newLead: AgentLead = {
      id: this.nextId++,
      ...lead,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    this.agentLeads.set(newLead.id, newLead);
    return newLead;
  }

  async updateAgentLead(id: number, data: Partial<AgentLead>): Promise<AgentLead> {
    const lead = this.agentLeads.get(id);
    if (!lead) {
      throw new Error(`AgentLead with id ${id} not found`);
    }
    const updatedLead = { ...lead, ...data, updatedAt: new Date() };
    this.agentLeads.set(id, updatedLead);
    return updatedLead;
  }

  async getPropertyActivityLogs(propertyId: number): Promise<PropertyActivityLogWithUser[]> {
    return [];
  }

  async createPropertyActivityLog(log: InsertPropertyActivityLog): Promise<PropertyActivityLog> {
    const newLog: PropertyActivityLog = {
      id: this.nextId++,
      ...log,
      timestamp: new Date()
    };
    this.propertyActivityLogs.set(newLog.id, newLog);
    return newLog;
  }

  async getViewingRequest(id: number): Promise<ViewingRequest | undefined> {
    return this.viewingRequests.get(id);
  }

  async getViewingRequestWithParticipants(id: number): Promise<ViewingRequestWithParticipants | undefined> {
    const request = this.viewingRequests.get(id);
    if (!request) return undefined;
    return { ...request, participants: [] };
  }

  async getViewingRequestsByProperty(propertyId: number, getAllRequests?: boolean): Promise<ViewingRequest[]> {
    return Array.from(this.viewingRequests.values()).filter(r => r.propertyId === propertyId);
  }

  async getViewingRequestsByBuyer(buyerId: number): Promise<ViewingRequest[]> {
    return Array.from(this.viewingRequests.values()).filter(r => r.buyerId === buyerId);
  }

  async getViewingRequestsByAgent(agentId: number): Promise<ViewingRequest[]> {
    return Array.from(this.viewingRequests.values()).filter(r => r.agentId === agentId);
  }

  async createViewingRequest(request: InsertViewingRequest): Promise<ViewingRequest> {
    const newRequest: ViewingRequest = {
      id: this.nextId++,
      ...request,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    this.viewingRequests.set(newRequest.id, newRequest);
    return newRequest;
  }

  async updateViewingRequest(id: number, data: Partial<ViewingRequest>): Promise<ViewingRequest> {
    const request = this.viewingRequests.get(id);
    if (!request) {
      throw new Error(`ViewingRequest with id ${id} not found`);
    }
    const updatedRequest = { ...request, ...data, updatedAt: new Date() };
    this.viewingRequests.set(id, updatedRequest);
    return updatedRequest;
  }

  async deleteViewingRequest(id: number): Promise<void> {
    this.viewingRequests.delete(id);
  }

  // Support message methods
  async getSupportMessage(id: number): Promise<SupportMessage | undefined> {
    return this.supportMessages.get(id);
  }

  async getSupportMessagesBySession(sessionId: string): Promise<SupportMessage[]> {
    return Array.from(this.supportMessages.values()).filter(m => m.sessionId === sessionId);
  }

  async createSupportMessage(message: InsertSupportMessage): Promise<SupportMessage> {
    const newMessage: SupportMessage = {
      id: this.nextId++,
      ...message,
      timestamp: new Date(),
      isRead: false
    };
    this.supportMessages.set(newMessage.id, newMessage);
    return newMessage;
  }

  async markSupportMessageAsRead(id: number): Promise<SupportMessage> {
    const message = this.supportMessages.get(id);
    if (!message) {
      throw new Error(`SupportMessage with id ${id} not found`);
    }
    const updatedMessage = { ...message, isRead: true };
    this.supportMessages.set(id, updatedMessage);
    return updatedMessage;
  }

  async getUnreadSupportMessageCount(): Promise<number> {
    return Array.from(this.supportMessages.values()).filter(m => !m.isRead).length;
  }

  async getActiveSupportSessions(): Promise<{ sessionId: string; lastMessage: Date; unreadCount: number }[]> {
    return [];
  }

  // Viewing token methods
  async getViewingToken(token: string): Promise<ViewingToken | undefined> {
    return Array.from(this.viewingTokens.values()).find(t => t.token === token);
  }

  async createViewingToken(token: InsertViewingToken): Promise<ViewingToken> {
    const newToken: ViewingToken = {
      id: this.nextId++,
      ...token,
      createdAt: new Date(),
      lastAccessedAt: null
    };
    this.viewingTokens.set(newToken.id, newToken);
    return newToken;
  }

  async updateViewingToken(id: number, data: Partial<ViewingToken>): Promise<ViewingToken> {
    const token = this.viewingTokens.get(id);
    if (!token) {
      throw new Error(`ViewingToken with id ${id} not found`);
    }
    const updatedToken = { ...token, ...data };
    this.viewingTokens.set(id, updatedToken);
    return updatedToken;
  }

  async deleteExpiredViewingTokens(): Promise<void> {
    const now = new Date();
    for (const [id, token] of this.viewingTokens.entries()) {
      if (token.expiresAt < now) {
        this.viewingTokens.delete(id);
      }
    }
  }
}

export const fallbackStorage = new FallbackStorage();