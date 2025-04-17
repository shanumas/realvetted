import { 
  User, InsertUser, Property, InsertProperty, 
  Message, InsertMessage, AgentLead, InsertAgentLead,
  PropertyActivityLog, InsertPropertyActivityLog,
  Agreement, InsertAgreement,
  ViewingRequest, InsertViewingRequest,
  users, properties, messages, agentLeads, propertyActivityLogs, agreements, viewingRequests
} from "@shared/schema";
import { 
  LeadWithProperty, PropertyWithParticipants, PropertyActivityLogWithUser, 
  ViewingRequestWithParticipants 
} from "@shared/types";
import { randomBytes } from "crypto";
import { scrypt } from "crypto";
import { promisify } from "util";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq, and, or, desc } from "drizzle-orm";
import session from "express-session";
import connectPg from "connect-pg-simple";

const scryptAsync = promisify(scrypt);
const PostgresSessionStore = connectPg(session);

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
  deleteProperty(id: number): Promise<void>;
  
  // Message methods
  getMessage(id: number): Promise<Message | undefined>;
  getMessagesByProperty(propertyId: number, getAllMessages?: boolean): Promise<Message[]>;
  getMessagesBetweenUsers(propertyId: number, user1Id: number, user2Id: number): Promise<Message[]>;
  createMessage(message: InsertMessage): Promise<Message>;
  markMessageAsRead(id: number): Promise<Message>;
  
  // Agent lead methods
  getAgentLead(id: number): Promise<AgentLead | undefined>;
  getAvailableLeadsByAgent(agentId: number): Promise<LeadWithProperty[]>;
  createAgentLead(lead: InsertAgentLead): Promise<AgentLead>;
  updateAgentLead(id: number, data: Partial<AgentLead>): Promise<AgentLead>;
  
  // Property activity log methods
  getPropertyActivityLogs(propertyId: number): Promise<PropertyActivityLogWithUser[]>;
  createPropertyActivityLog(log: InsertPropertyActivityLog): Promise<PropertyActivityLog>;
  
  // Agreement methods
  getAgreement(id: number): Promise<Agreement | undefined>;
  getAgreementsByProperty(propertyId: number): Promise<Agreement[]>;
  getAgreementsByAgent(agentId: number): Promise<Agreement[]>;
  getAgreementsByType(type: string): Promise<Agreement[]>;
  getAgreementsByBuyer(buyerId: number): Promise<Agreement[]>;
  getGlobalBRBCForBuyerAgent(buyerId: number, agentId: number): Promise<Agreement | undefined>;
  createAgreement(agreement: InsertAgreement): Promise<Agreement>;
  updateAgreement(id: number, data: Partial<Agreement>): Promise<Agreement>;
  
  // Viewing request methods
  getViewingRequest(id: number): Promise<ViewingRequest | undefined>;
  getViewingRequestWithParticipants(id: number): Promise<ViewingRequestWithParticipants | undefined>;
  getViewingRequestsByProperty(propertyId: number, getAllRequests?: boolean): Promise<ViewingRequest[]>;
  getViewingRequestsByBuyer(buyerId: number): Promise<ViewingRequest[]>;
  getViewingRequestsByAgent(agentId: number): Promise<ViewingRequest[]>;
  createViewingRequest(request: InsertViewingRequest): Promise<ViewingRequest>;
  updateViewingRequest(id: number, data: Partial<ViewingRequest>): Promise<ViewingRequest>;
  deleteViewingRequest(id: number): Promise<void>;
  
  // Session store
  sessionStore: session.Store;
}

export class PgStorage implements IStorage {
  private db: ReturnType<typeof drizzle>;
  private pool: pg.Pool;
  sessionStore: session.Store;

  constructor() {
    // Create database connection
    this.pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
    });
    
    // Create Drizzle ORM instance
    this.db = drizzle(this.pool);
    
    // Create session store
    this.sessionStore = new PostgresSessionStore({
      pool: this.pool,
      createTableIfMissing: true,
    });
    
    // Create admin user if none exists (async, will complete in background)
    this.initializeAdminUser();
  }
  
  private async initializeAdminUser() {
    try {
      // Check if admin user exists
      const adminUser = await this.db.select().from(users)
        .where(eq(users.role, 'admin'))
        .limit(1);
      
      // If no admin user, create one
      if (adminUser.length === 0) {
        const adminPassword = "Kuttybuski123*";
        const salt = randomBytes(16).toString("hex");
        const buf = (await scryptAsync(adminPassword, salt, 64)) as Buffer;
        const hashedPassword = `${buf.toString("hex")}.${salt}`;
        
        await this.createUser({
          email: "admin@admin.com",
          password: hashedPassword,
          firstName: "Admin",
          lastName: "User",
          role: "admin",
          profileStatus: "verified"
        });
      }
    } catch (error) {
      console.error("Error initializing admin user:", error);
    }
  }

  // User methods
  async getUser(id: number): Promise<User | undefined> {
    const result = await this.db.select().from(users).where(eq(users.id, id));
    return result[0];
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const result = await this.db.select().from(users)
      .where(eq(users.email, email.toLowerCase()));
    return result[0];
  }

  async getUsersByRole(role: string): Promise<User[]> {
    return await this.db.select().from(users).where(eq(users.role, role));
  }

  async getAllUsers(): Promise<User[]> {
    return await this.db.select().from(users);
  }

  async createUser(userData: InsertUser): Promise<User> {
    const result = await this.db.insert(users).values({
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
      idFrontUrl: userData.idFrontUrl || null,
      idBackUrl: userData.idBackUrl || null,
      isBlocked: false
    }).returning();
    
    return result[0];
  }

  async updateUser(id: number, data: Partial<User>): Promise<User> {
    const result = await this.db.update(users)
      .set(data)
      .where(eq(users.id, id))
      .returning();
    
    if (result.length === 0) {
      throw new Error(`User with ID ${id} not found`);
    }
    
    return result[0];
  }

  // Property methods
  async getProperty(id: number): Promise<Property | undefined> {
    try {
      // Ensure the emailSent column exists
      await this.pool.query(`
        ALTER TABLE properties 
        ADD COLUMN IF NOT EXISTS email_sent BOOLEAN DEFAULT FALSE
      `);
      
      const result = await this.db.select().from(properties).where(eq(properties.id, id));
      return result[0];
    } catch (error) {
      console.error("Error in getProperty:", error);
      // Fallback to raw query if there's a schema issue
      const result = await this.pool.query(`SELECT * FROM properties WHERE id = $1`, [id]);
      return result.rows[0];
    }
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
    try {
      // First, ensure the emailSent column exists
      await this.pool.query(`
        ALTER TABLE properties 
        ADD COLUMN IF NOT EXISTS email_sent BOOLEAN DEFAULT FALSE
      `);
      
      return await this.db.select().from(properties);
    } catch (error) {
      console.error("Error in getAllProperties:", error);
      // If there's an error with the column, return properties without using the schema
      const result = await this.pool.query(`SELECT * FROM properties`);
      return result.rows;
    }
  }

  async getPropertiesByBuyer(buyerId: number): Promise<Property[]> {
    try {
      // Ensure the emailSent column exists
      await this.pool.query(`
        ALTER TABLE properties 
        ADD COLUMN IF NOT EXISTS email_sent BOOLEAN DEFAULT FALSE
      `);
      
      return await this.db.select().from(properties).where(eq(properties.createdBy, buyerId));
    } catch (error) {
      console.error("Error in getPropertiesByBuyer:", error);
      // Fallback to raw query if there's a schema issue
      const result = await this.pool.query(`SELECT * FROM properties WHERE created_by = $1`, [buyerId]);
      return result.rows;
    }
  }

  async getPropertiesBySeller(sellerId: number): Promise<Property[]> {
    try {
      // Ensure the emailSent column exists
      await this.pool.query(`
        ALTER TABLE properties 
        ADD COLUMN IF NOT EXISTS email_sent BOOLEAN DEFAULT FALSE
      `);
      
      return await this.db.select().from(properties).where(eq(properties.sellerId, sellerId));
    } catch (error) {
      console.error("Error in getPropertiesBySeller:", error);
      // Fallback to raw query if there's a schema issue
      const result = await this.pool.query(`SELECT * FROM properties WHERE seller_id = $1`, [sellerId]);
      return result.rows;
    }
  }

  async getPropertiesByAgent(agentId: number): Promise<Property[]> {
    try {
      // Ensure the emailSent column exists
      await this.pool.query(`
        ALTER TABLE properties 
        ADD COLUMN IF NOT EXISTS email_sent BOOLEAN DEFAULT FALSE
      `);
      
      return await this.db.select().from(properties).where(eq(properties.agentId, agentId));
    } catch (error) {
      console.error("Error in getPropertiesByAgent:", error);
      // Fallback to raw query if there's a schema issue
      const result = await this.pool.query(`SELECT * FROM properties WHERE agent_id = $1`, [agentId]);
      return result.rows;
    }
  }

  async createProperty(propertyData: InsertProperty): Promise<Property> {
    // Let's first run a raw query to add the email_sent column if it doesn't exist
    try {
      await this.pool.query(`
        ALTER TABLE properties 
        ADD COLUMN IF NOT EXISTS email_sent BOOLEAN DEFAULT FALSE
      `);
    } catch (error) {
      console.error("Error adding email_sent column:", error);
    }
    
    const result = await this.db.insert(properties).values({
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
      createdAt: new Date(),
      createdBy: propertyData.createdBy,
      sellerEmail: propertyData.sellerEmail || null,
      sellerId: propertyData.sellerId || null,
      agentId: propertyData.agentId || null,
      status: propertyData.status || "active",
      emailSent: propertyData.emailSent || false
    }).returning();
    
    return result[0];
  }

  async updateProperty(id: number, data: Partial<Property>): Promise<Property> {
    try {
      // Ensure the emailSent column exists before updating
      if ('emailSent' in data) {
        // Make sure the column exists
        await this.pool.query(`
          ALTER TABLE properties 
          ADD COLUMN IF NOT EXISTS email_sent BOOLEAN DEFAULT FALSE
        `);
      }
      
      // Update using Drizzle ORM
      const result = await this.db.update(properties)
        .set(data)
        .where(eq(properties.id, id))
        .returning();
      
      if (result.length === 0) {
        throw new Error(`Property with ID ${id} not found`);
      }
      
      return result[0];
    } catch (error) {
      console.error("Error updating property:", error);
      
      // Fallback manual update if the ORM approach fails
      const current = await this.getProperty(id);
      if (!current) {
        throw new Error(`Property with ID ${id} not found`);
      }
      
      // Handle each field individually to avoid SQL errors
      for (const [key, value] of Object.entries(data)) {
        if (key === 'emailSent') {
          try {
            // Try to update the email_sent column
            await this.pool.query(`
              UPDATE properties SET email_sent = $1 WHERE id = $2
            `, [value, id]);
          } catch (err) {
            console.error("Error updating emailSent:", err);
            // If that fails, try to add the column first
            await this.pool.query(`
              ALTER TABLE properties 
              ADD COLUMN IF NOT EXISTS email_sent BOOLEAN DEFAULT FALSE
            `);
            await this.pool.query(`
              UPDATE properties SET email_sent = $1 WHERE id = $2
            `, [value, id]);
          }
        } else {
          // Convert camelCase to snake_case for column names
          const columnName = key.replace(/([A-Z])/g, '_$1').toLowerCase();
          await this.pool.query(`
            UPDATE properties SET ${columnName} = $1 WHERE id = $2
          `, [value, id]);
        }
      }
      
      // Return the updated property
      return await this.getProperty(id) as Property;
    }
  }
  
  async deleteProperty(id: number): Promise<void> {
    // First check if property exists
    const property = await this.getProperty(id);
    if (!property) {
      throw new Error(`Property with ID ${id} not found`);
    }
    
    // Delete any agent leads associated with this property
    await this.db.delete(agentLeads)
      .where(eq(agentLeads.propertyId, id));
    
    // Delete any messages associated with this property
    await this.db.delete(messages)
      .where(eq(messages.propertyId, id));
    
    // Finally delete the property
    await this.db.delete(properties)
      .where(eq(properties.id, id));
  }

  // Message methods
  async getMessage(id: number): Promise<Message | undefined> {
    const result = await this.db.select().from(messages).where(eq(messages.id, id));
    return result[0];
  }

  async getMessagesByProperty(propertyId: number, getAllMessages: boolean = false): Promise<Message[]> {
    if (getAllMessages) {
      // Return all messages across all properties
      return await this.db.select()
        .from(messages)
        .orderBy(messages.timestamp);
    }
    
    return await this.db.select()
      .from(messages)
      .where(eq(messages.propertyId, propertyId))
      .orderBy(messages.timestamp);
  }

  async getMessagesBetweenUsers(propertyId: number, user1Id: number, user2Id: number): Promise<Message[]> {
    return await this.db.select()
      .from(messages)
      .where(
        and(
          eq(messages.propertyId, propertyId),
          or(
            and(
              eq(messages.senderId, user1Id),
              eq(messages.receiverId, user2Id)
            ),
            and(
              eq(messages.senderId, user2Id),
              eq(messages.receiverId, user1Id)
            )
          )
        )
      )
      .orderBy(messages.timestamp);
  }

  async createMessage(messageData: InsertMessage): Promise<Message> {
    const result = await this.db.insert(messages).values({
      propertyId: messageData.propertyId,
      senderId: messageData.senderId,
      receiverId: messageData.receiverId,
      content: messageData.content,
      timestamp: new Date(),
      isRead: false
    }).returning();
    
    return result[0];
  }

  async markMessageAsRead(id: number): Promise<Message> {
    const result = await this.db.update(messages)
      .set({ isRead: true })
      .where(eq(messages.id, id))
      .returning();
    
    if (result.length === 0) {
      throw new Error(`Message with ID ${id} not found`);
    }
    
    return result[0];
  }

  // Agent lead methods
  async getAgentLead(id: number): Promise<AgentLead | undefined> {
    const result = await this.db.select().from(agentLeads).where(eq(agentLeads.id, id));
    return result[0];
  }

  async getAvailableLeadsByAgent(agentId: number): Promise<LeadWithProperty[]> {
    const leads = await this.db.select()
      .from(agentLeads)
      .where(
        and(
          eq(agentLeads.agentId, agentId),
          eq(agentLeads.status, "available")
        )
      );
    
    const result: LeadWithProperty[] = [];
    
    for (const lead of leads) {
      const property = await this.getProperty(lead.propertyId);
      if (property) {
        result.push({
          lead: {
            id: lead.id,
            propertyId: lead.propertyId,
            agentId: lead.agentId,
            status: lead.status,
            createdAt: lead.createdAt || new Date()
          },
          property
        });
      }
    }
    
    return result;
  }

  async createAgentLead(leadData: InsertAgentLead): Promise<AgentLead> {
    const result = await this.db.insert(agentLeads).values({
      propertyId: leadData.propertyId,
      agentId: leadData.agentId,
      status: leadData.status || "available",
      createdAt: new Date()
    }).returning();
    
    return result[0];
  }

  async updateAgentLead(id: number, data: Partial<AgentLead>): Promise<AgentLead> {
    const result = await this.db.update(agentLeads)
      .set(data)
      .where(eq(agentLeads.id, id))
      .returning();
    
    if (result.length === 0) {
      throw new Error(`Agent lead with ID ${id} not found`);
    }
    
    return result[0];
  }

  // Property activity log methods
  async getPropertyActivityLogs(propertyId: number): Promise<PropertyActivityLogWithUser[]> {
    const logs = await this.db.select()
      .from(propertyActivityLogs)
      .where(eq(propertyActivityLogs.propertyId, propertyId))
      .orderBy(propertyActivityLogs.timestamp, "desc");
    
    const result: PropertyActivityLogWithUser[] = [];
    
    for (const log of logs) {
      let user = undefined;
      
      if (log.userId) {
        const userData = await this.getUser(log.userId);
        if (userData) {
          user = {
            firstName: userData.firstName,
            lastName: userData.lastName,
            email: userData.email,
            role: userData.role
          };
        }
      }
      
      result.push({
        ...log,
        user
      });
    }
    
    return result;
  }
  
  async createPropertyActivityLog(logData: InsertPropertyActivityLog): Promise<PropertyActivityLog> {
    const result = await this.db.insert(propertyActivityLogs).values({
      propertyId: logData.propertyId,
      userId: logData.userId || null,
      activity: logData.activity,
      timestamp: new Date(),
      details: logData.details || {}
    }).returning();
    
    return result[0];
  }
  
  // Agreement methods
  async getAgreement(id: number): Promise<Agreement | undefined> {
    const result = await this.db.select().from(agreements).where(eq(agreements.id, id));
    return result[0];
  }
  
  async getAgreementsByProperty(propertyId: number): Promise<Agreement[]> {
    const propertyAgreements = await this.db.select()
      .from(agreements)
      .where(eq(agreements.propertyId, propertyId))
      .orderBy(agreements.createdAt, "desc");
      
    // Process agreements to deduplicate by agreement type
    // So we only show the latest version of each agreement type
    const latestAgreementsByType = new Map<string, Agreement>();
    
    propertyAgreements.forEach(agreement => {
      if (!latestAgreementsByType.has(agreement.type) || 
          new Date(agreement.createdAt || 0) > new Date(latestAgreementsByType.get(agreement.type)?.createdAt || 0)) {
        latestAgreementsByType.set(agreement.type, agreement);
      }
    });
    
    // Convert the map values back to an array and sort by creation date (newest first)
    return Array.from(latestAgreementsByType.values())
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
  }
  
  async getAgreementsByAgent(agentId: number): Promise<Agreement[]> {
    const agentAgreements = await this.db.select({
      agreement: agreements,
      property: properties
    })
    .from(agreements)
    .leftJoin(properties, eq(agreements.propertyId, properties.id))
    .where(eq(agreements.agentId, agentId))
    .orderBy(agreements.createdAt, "desc");
    
    // Process agreements to deduplicate by property and agreement type
    // So we only show the latest version of each agreement type for a property
    const latestAgreements = new Map<string, any>();
    
    agentAgreements.forEach(item => {
      const key = `${item.agreement.propertyId}_${item.agreement.type}`;
      
      // If this property+type combination doesn't exist in the map yet,
      // or the current agreement is newer, update the map
      if (!latestAgreements.has(key) || 
          new Date(item.agreement.createdAt || 0) > new Date(latestAgreements.get(key).agreement.createdAt || 0)) {
        latestAgreements.set(key, item);
      }
    });
    
    // Convert the map values back to an array and format the result
    return Array.from(latestAgreements.values())
      .map(item => ({
        ...item.agreement,
        property: item.property
      }))
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
  }
  
  async getAgreementsByType(type: string): Promise<Agreement[]> {
    return await this.db.select()
      .from(agreements)
      .where(eq(agreements.type, type))
      .orderBy(agreements.createdAt, "desc");
  }
  
  async getAgreementsByBuyer(buyerId: number): Promise<Agreement[]> {
    // Get all agreements where the current user is the buyer
    const buyerAgreements = await this.db.select({
      agreement: agreements,
      property: properties
    })
    .from(agreements)
    .leftJoin(properties, eq(agreements.propertyId, properties.id))
    .where(eq(agreements.buyerId, buyerId))
    .orderBy(agreements.createdAt, "desc");
    
    // Process agreements to deduplicate by property and agreement type
    // So we only show the latest version of each agreement type for a property
    const latestAgreements = new Map<string, any>();
    
    buyerAgreements.forEach(item => {
      const key = `${item.agreement.propertyId}_${item.agreement.type}`;
      
      // If this property+type combination doesn't exist in the map yet,
      // or the current agreement is newer, update the map
      if (!latestAgreements.has(key) || 
          new Date(item.agreement.createdAt || 0) > new Date(latestAgreements.get(key).agreement.createdAt || 0)) {
        latestAgreements.set(key, item);
      }
    });
    
    // Convert the map values back to an array and format the result
    return Array.from(latestAgreements.values())
      .map(item => ({
        ...item.agreement,
        property: item.property
      }))
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
  }
  
  async createAgreement(agreementData: InsertAgreement): Promise<Agreement> {
    const result = await this.db.insert(agreements).values({
      propertyId: agreementData.propertyId,
      agentId: agreementData.agentId,
      buyerId: agreementData.buyerId,
      type: agreementData.type || "standard",
      agreementText: agreementData.agreementText,
      agentSignature: agreementData.agentSignature,
      buyerSignature: agreementData.buyerSignature || null,
      sellerSignature: agreementData.sellerSignature || null,
      date: agreementData.date,
      status: agreementData.status || "pending_buyer",
      createdAt: new Date()
    }).returning();
    
    return result[0];
  }
  
  async updateAgreement(id: number, data: Partial<Agreement>): Promise<Agreement> {
    const result = await this.db.update(agreements)
      .set(data)
      .where(eq(agreements.id, id))
      .returning();
    
    if (result.length === 0) {
      throw new Error(`Agreement with ID ${id} not found`);
    }
    
    return result[0];
  }
  
  // Viewing request methods
  async getViewingRequest(id: number): Promise<ViewingRequest | undefined> {
    const result = await this.db.select().from(viewingRequests).where(eq(viewingRequests.id, id));
    return result[0];
  }
  
  async getViewingRequestWithParticipants(id: number): Promise<ViewingRequestWithParticipants | undefined> {
    const request = await this.getViewingRequest(id);
    
    if (!request) {
      return undefined;
    }
    
    const property = await this.getProperty(request.propertyId);
    const buyer = await this.getUser(request.buyerId);
    // Use buyerAgentId instead of agentId
    const agent = request.buyerAgentId ? await this.getUser(request.buyerAgentId) : undefined;
    
    return {
      ...request,
      property,
      buyer,
      agent
    };
  }
  
  async getViewingRequestsByProperty(propertyId: number, getAllRequests: boolean = false): Promise<ViewingRequest[]> {
    if (getAllRequests) {
      // Return all viewing requests across all properties
      return await this.db.select()
        .from(viewingRequests)
        .orderBy(desc(viewingRequests.requestedDate));
    }
    
    return await this.db.select()
      .from(viewingRequests)
      .where(eq(viewingRequests.propertyId, propertyId))
      .orderBy(desc(viewingRequests.requestedDate));
  }
  
  async getViewingRequestsByBuyer(buyerId: number): Promise<ViewingRequest[]> {
    return await this.db.select()
      .from(viewingRequests)
      .where(eq(viewingRequests.buyerId, buyerId))
      .orderBy(desc(viewingRequests.requestedDate));
  }
  
  async getViewingRequestsByAgent(agentId: number): Promise<ViewingRequest[]> {
    return await this.db.select()
      .from(viewingRequests)
      .where(
        or(
          eq(viewingRequests.buyerAgentId, agentId),
          eq(viewingRequests.sellerAgentId, agentId)
        )
      )
      .orderBy(desc(viewingRequests.requestedDate));
  }
  
  async createViewingRequest(request: InsertViewingRequest): Promise<ViewingRequest> {
    const result = await this.db.insert(viewingRequests).values({
      propertyId: request.propertyId,
      buyerId: request.buyerId,
      buyerAgentId: request.buyerAgentId || null,
      sellerAgentId: request.sellerAgentId || null,
      requestedDate: request.requestedDate,
      requestedEndDate: request.requestedEndDate,
      status: request.status || "pending",
      notes: request.notes || null,
      createdAt: new Date()
    }).returning();
    
    return result[0];
  }
  
  async updateViewingRequest(id: number, data: Partial<ViewingRequest>): Promise<ViewingRequest> {
    const result = await this.db.update(viewingRequests)
      .set(data)
      .where(eq(viewingRequests.id, id))
      .returning();
    
    if (result.length === 0) {
      throw new Error(`Viewing request with ID ${id} not found`);
    }
    
    return result[0];
  }
  
  async deleteViewingRequest(id: number): Promise<void> {
    // First check if viewing request exists
    const viewingRequest = await this.getViewingRequest(id);
    if (!viewingRequest) {
      throw new Error(`Viewing request with ID ${id} not found`);
    }
    
    // Delete the viewing request
    await this.db.delete(viewingRequests)
      .where(eq(viewingRequests.id, id));
  }
}

// Use the database storage implementation
export const storage = new PgStorage();
