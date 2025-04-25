import { pgTable, text, serial, integer, boolean, timestamp, json, jsonb } from "drizzle-orm/pg-core";
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
  profilePhotoUrl: text("profile_photo_url"), // URL to the user's profile photo
  licenseNumber: text("license_number"), // Real estate license number for agents
  brokerageName: text("brokerage_name"), // Brokerage name for agents
  isBlocked: boolean("is_blocked").default(false),
  // New fields for verification
  verificationMethod: text("verification_method"), // "kyc" or "prequalification"
  prequalificationDocUrl: text("prequalification_doc_url"), // URL to pre-qualification document
  prequalificationValidated: boolean("prequalification_validated").default(false), // Whether the pre-qualification has been validated by AI
  prequalificationData: json("prequalification_data"), // Extracted data from pre-qualification document
  prequalificationMessage: text("prequalification_message"), // Validation message or rejection reason
  manualApprovalRequested: boolean("manual_approval_requested").default(false), // Whether the user has requested manual approval
  prequalificationAttempts: integer("prequalification_attempts").default(0), // Number of attempted uploads
  failedPrequalificationUrls: text("failed_prequalification_urls").array(), // Array of URLs to failed pre-qualification documents
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
  // Additional columns for seller/listing details
  sellerName: text("seller_name"),
  sellerPhone: text("seller_phone"),
  sellerCompany: text("seller_company"),
  sellerLicenseNo: text("seller_license_no"),
  // Property source information
  propertyUrl: text("property_url"), // Listing page URL that was extracted
  sourceUrl: text("source_url"), // Original URL entered by the user
  sourceSite: text("source_site"), // Source website name (e.g., "zillow", "redfin")
  // Listing agent details
  listingAgentName: text("listing_agent_name"),
  listingAgentEmail: text("listing_agent_email"),
  listingAgentPhone: text("listing_agent_phone"),
  listingAgentCompany: text("listing_agent_company"),
  listingAgentLicenseNo: text("listing_agent_license_no"),
  // Property details
  features: text("features").array(),
  imageUrls: text("image_urls").array(),
  emailSent: boolean("email_sent").default(false),
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

// Property activity logs
export const propertyActivityLogs = pgTable("property_activity_logs", {
  id: serial("id").primaryKey(),
  propertyId: integer("property_id").notNull(),
  userId: integer("user_id"), // Can be null for system events
  activity: text("activity").notNull(),
  timestamp: timestamp("timestamp").defaultNow(),
  details: json("details"),
});

// Buyer representation agreements
export const agreements = pgTable("agreements", {
  id: serial("id").primaryKey(),
  propertyId: integer("property_id"), // Made optional to support global agreements
  agentId: integer("agent_id").notNull(),
  buyerId: integer("buyer_id").notNull(),
  type: text("type").notNull().default("standard"), // standard, agency_disclosure, agent_referral, global_brbc
  agreementText: text("agreement_text").notNull(),
  agentSignature: text("agent_signature"),
  buyerSignature: text("buyer_signature"),
  sellerSignature: text("seller_signature"),
  date: timestamp("date").notNull(),
  status: text("status").notNull().default("pending_buyer"), // pending_buyer, signed_by_buyer, signed_by_seller, completed, rejected
  createdAt: timestamp("created_at").defaultNow(),
  documentUrl: text("document_url"), // URL to the PDF document
  editedPdfContent: text("edited_pdf_content"), // Store the binary content of the edited PDF
  isGlobal: boolean("is_global").default(false), // Flag to indicate if this is a global agreement applicable for all properties
});

// Property tour requests
export const tourRequests = pgTable("viewing_requests", { // Keeping the DB table name to avoid migration issues
  id: serial("id").primaryKey(),
  propertyId: integer("property_id").notNull(),
  buyerId: integer("buyer_id").notNull(),
  buyerAgentId: integer("buyer_agent_id"),
  sellerAgentId: integer("seller_agent_id"),
  requestedDate: timestamp("requested_date").notNull(),
  requestedEndDate: timestamp("requested_end_date").notNull(),
  confirmedDate: timestamp("confirmed_date"),
  confirmedEndDate: timestamp("confirmed_end_date"),
  status: text("status").notNull().default("pending"), // pending, accepted, rejected, rescheduled, completed, cancelled
  notes: text("notes"),
  confirmedById: integer("confirmed_by_id"), // ID of the agent who confirmed the tour
  responseMessage: text("response_message"), // Message from the confirming agent with any changes
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
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
  profilePhotoUrl: z.string().optional(),
  licenseNumber: z.string().optional(),
})
.superRefine((data, ctx) => {
  // Profile photo and license number for agents are now collected after registration
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

export const propertyActivityLogSchema = createInsertSchema(propertyActivityLogs).omit({
  id: true,
  timestamp: true,
});

export const agreementSchema = createInsertSchema(agreements).omit({
  id: true,
  createdAt: true,
});

export const tourRequestSchema = createInsertSchema(tourRequests)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    // Convert string dates to Date objects
    requestedDate: z.string().transform((str) => new Date(str)),
    requestedEndDate: z.string().transform((str) => new Date(str)),
    // Override flag (not stored in DB, used for API logic)
    override: z.boolean().optional(),
  });

// Create schema for pre-qualification document upload
export const prequalificationDocSchema = z.object({
  file: z.any()
    .refine(file => file?.size !== undefined, {
      message: "File is required"
    })
    .refine(file => file?.size <= 1024 * 1024, {
      message: "File size must be less than 1MB"
    }), // File upload with 1MB size limit
  verificationMethod: z.literal("prequalification"), // Set this method
});

// Email records for the outbox
export const emails = pgTable("emails", {
  id: serial("id").primaryKey(),
  externalId: text("external_id"),
  to: text("to").array().notNull(),
  cc: text("cc").array(),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  status: text("status").notNull().default("sent"), // sent, failed
  errorMessage: text("error_message"),
  timestamp: timestamp("timestamp").defaultNow(),
  sentById: integer("sent_by_id").notNull(),
  sentByRole: text("sent_by_role").notNull(),
  relatedEntityType: text("related_entity_type").notNull(), // viewing_request, property, agreement
  relatedEntityId: integer("related_entity_id").notNull(),
});

// Email schema
export const emailSchema = createInsertSchema(emails).omit({
  id: true,
  timestamp: true,
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
export type PropertyActivityLog = typeof propertyActivityLogs.$inferSelect;
export type InsertPropertyActivityLog = z.infer<typeof propertyActivityLogSchema>;
export type Agreement = typeof agreements.$inferSelect;
export type InsertAgreement = z.infer<typeof agreementSchema>;
export type TourRequest = typeof tourRequests.$inferSelect;
export type InsertTourRequest = z.infer<typeof tourRequestSchema>;
export type Email = typeof emails.$inferSelect;
export type InsertEmail = z.infer<typeof emailSchema>;

// For backward compatibility during transition
export type ViewingRequest = TourRequest;
export type InsertViewingRequest = InsertTourRequest;
export const viewingRequestSchema = tourRequestSchema;
