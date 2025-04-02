import { 
  User, InsertUser, Property, InsertProperty, 
  Message, InsertMessage, AgentLead, InsertAgentLead,
  users, properties, messages, agentLeads
} from "@shared/schema";
import { LeadWithProperty, PropertyWithParticipants } from "@shared/types";
import { randomBytes } from "crypto";
import { scrypt } from "crypto";
import { promisify } from "util";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq, and, or } from "drizzle-orm";
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
  getMessagesByProperty(propertyId: number): Promise<Message[]>;
  getMessagesBetweenUsers(propertyId: number, user1Id: number, user2Id: number): Promise<Message[]>;
  createMessage(message: InsertMessage): Promise<Message>;
  markMessageAsRead(id: number): Promise<Message>;
  
  // Agent lead methods
  getAgentLead(id: number): Promise<AgentLead | undefined>;
  getAvailableLeadsByAgent(agentId: number): Promise<LeadWithProperty[]>;
  createAgentLead(lead: InsertAgentLead): Promise<AgentLead>;
  updateAgentLead(id: number, data: Partial<AgentLead>): Promise<AgentLead>;
  
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
        const adminPassword = "admin123";
        const salt = randomBytes(16).toString("hex");
        const buf = (await scryptAsync(adminPassword, salt, 64)) as Buffer;
        const hashedPassword = `${buf.toString("hex")}.${salt}`;
        
        await this.createUser({
          email: "admin@propertymatch.com",
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
    const result = await this.db.select().from(properties).where(eq(properties.id, id));
    return result[0];
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
    return await this.db.select().from(properties);
  }

  async getPropertiesByBuyer(buyerId: number): Promise<Property[]> {
    return await this.db.select().from(properties).where(eq(properties.createdBy, buyerId));
  }

  async getPropertiesBySeller(sellerId: number): Promise<Property[]> {
    return await this.db.select().from(properties).where(eq(properties.sellerId, sellerId));
  }

  async getPropertiesByAgent(agentId: number): Promise<Property[]> {
    return await this.db.select().from(properties).where(eq(properties.agentId, agentId));
  }

  async createProperty(propertyData: InsertProperty): Promise<Property> {
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
      status: propertyData.status || "active"
    }).returning();
    
    return result[0];
  }

  async updateProperty(id: number, data: Partial<Property>): Promise<Property> {
    const result = await this.db.update(properties)
      .set(data)
      .where(eq(properties.id, id))
      .returning();
    
    if (result.length === 0) {
      throw new Error(`Property with ID ${id} not found`);
    }
    
    return result[0];
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

  async getMessagesByProperty(propertyId: number): Promise<Message[]> {
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
}

// Use the database storage implementation
export const storage = new PgStorage();
