import { pgTable, text, serial, integer, boolean, timestamp, json } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// User table that stores all types of users (buyer, seller, agent, admin)
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  firstName: text("first_name"),
  lastName: text("last_name"),
  phone: text("phone"),
  role: text("role").notNull(), // "buyer", "seller", "agent", "admin"
  profileStatus: text("profile_status").notNull().default("pending"), // "pending", "verified", "rejected"
  addressLine1: text("address_line1"),
  addressLine2: text("address_line2"),
  city: text("city"),
  state: text("state"),
  zip: text("zip"),
  dateOfBirth: text("date_of_birth"),
  createdAt: timestamp("created_at").defaultNow(),
  idFrontUrl: text("id_front_url"),
  idBackUrl: text("id_back_url"),
  isBlocked: boolean("is_blocked").default(false),
});

// Property listings
export const properties = pgTable("properties", {
  id: serial("id").primaryKey(),
  address: text("address").notNull(),
  city: text("city"),
  state: text("state"),
  zip: text("zip"),
  price: integer("price"),
  bedrooms: integer("bedrooms"),
  bathrooms: integer("bathrooms"),
  squareFeet: integer("square_feet"),
  propertyType: text("property_type"),
  yearBuilt: integer("year_built"),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow(),
  createdBy: integer("created_by").notNull(), // Buyer ID
  sellerEmail: text("seller_email"),
  sellerId: integer("seller_id"), // Seller user ID (if they've signed up)
  agentId: integer("agent_id"), // Assigned agent ID
  status: text("status").notNull().default("active"), // "active", "pending", "sold", etc.
});

// Messages for chat functionality
export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  propertyId: integer("property_id").notNull(),
  senderId: integer("sender_id").notNull(),
  receiverId: integer("receiver_id").notNull(),
  content: text("content").notNull(),
  timestamp: timestamp("timestamp").defaultNow(),
  isRead: boolean("is_read").default(false),
});

// Agent leads
export const agentLeads = pgTable("agent_leads", {
  id: serial("id").primaryKey(),
  propertyId: integer("property_id").notNull(),
  agentId: integer("agent_id").notNull(),
  status: text("status").notNull().default("available"), // "available", "claimed", "closed"
  createdAt: timestamp("created_at").defaultNow(),
});

// Zod schemas for validation
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
});

export const loginUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(["buyer", "seller", "agent", "admin"]),
});

export const registerUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(["buyer", "seller", "agent", "admin"]),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
});

export const kycUpdateSchema = z.object({
  firstName: z.string(),
  lastName: z.string(),
  dateOfBirth: z.string(),
  addressLine1: z.string(),
  addressLine2: z.string().optional(),
  city: z.string(),
  state: z.string(),
  zip: z.string(),
  idFrontUrl: z.string().optional(),
  idBackUrl: z.string().optional(),
});

export const propertySchema = createInsertSchema(properties).omit({
  id: true,
  createdAt: true,
});

export const messageSchema = createInsertSchema(messages).omit({
  id: true,
  timestamp: true,
});

export const agentLeadSchema = createInsertSchema(agentLeads).omit({
  id: true,
  createdAt: true,
});

// Export types
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type Property = typeof properties.$inferSelect;
export type InsertProperty = z.infer<typeof propertySchema>;
export type Message = typeof messages.$inferSelect;
export type InsertMessage = z.infer<typeof messageSchema>;
export type AgentLead = typeof agentLeads.$inferSelect;
export type InsertAgentLead = z.infer<typeof agentLeadSchema>;
