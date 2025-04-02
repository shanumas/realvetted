import { 
  User, InsertUser, Property, InsertProperty, 
  Message, InsertMessage, AgentLead, InsertAgentLead,
  PropertyActivityLog, InsertPropertyActivityLog,
  users, properties, messages, agentLeads, propertyActivityLogs
} from "@shared/schema";
import { LeadWithProperty, PropertyWithParticipants, PropertyActivityLogWithUser } from "@shared/types";
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
  
  // Property activity log methods
  getPropertyActivityLogs(propertyId: number): Promise<PropertyActivityLogWithUser[]>;
  createPropertyActivityLog(log: InsertPropertyActivityLog): Promise<PropertyActivityLog>;
  
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
}

// Use the database storage implementation
export const storage = new PgStorage();
