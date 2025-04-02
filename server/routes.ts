import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth } from "./auth";
import { setupWebSocketServer } from "./websocket";
import { 
  extractPropertyData, 
  verifyKYCDocuments, 
  findAgentsForProperty,
  extractIDData,
  extractPropertyFromUrl
} from "./openai";
import { 
  propertySchema, 
  agentLeadSchema, 
  kycUpdateSchema,
  messageSchema,
  User
} from "@shared/schema";
import { PropertyAIData } from "@shared/types";
import multer from "multer";
import { randomBytes } from "crypto";
import { z } from "zod";

export async function registerRoutes(app: Express): Promise<Server> {
  // Set up HTTP server
  const httpServer = createServer(app);
  
  // Set up authentication
  const { isAuthenticated, hasRole } = setupAuth(app);
  
  // Set up WebSocket server
  setupWebSocketServer(httpServer);
  
  // Configure multer for file uploads
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
  });

  // -------- API Routes --------

  // User routes
  app.put("/api/users/kyc", isAuthenticated, async (req, res) => {
    try {
      const data = kycUpdateSchema.parse(req.body);
      const updatedUser = await storage.updateUser(req.user.id, {
        ...data,
        profileStatus: "pending" // Set status to pending for manual/AI review
      });
      
      // If ID documents are provided, verify with AI
      if (data.idFrontUrl && data.idBackUrl) {
        try {
          const verificationResult = await verifyKYCDocuments(
            req.user.id,
            data.idFrontUrl,
            data.idBackUrl,
            {
              firstName: data.firstName,
              lastName: data.lastName,
              dateOfBirth: data.dateOfBirth,
              addressLine1: data.addressLine1
            }
          );
          
          if (verificationResult.verified) {
            // Update user status to verified
            await storage.updateUser(req.user.id, {
              profileStatus: "verified"
            });
          }
        } catch (error) {
          console.error("KYC verification error:", error);
          // Don't fail the request if AI verification fails
          // Admin can manually verify later
        }
      }
      
      res.json({
        success: true,
        data: updatedUser
      });
    } catch (error) {
      console.error("KYC update error:", error);
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : "Invalid data"
      });
    }
  });

  // Property routes
  app.post("/api/properties", isAuthenticated, hasRole(["buyer"]), async (req, res) => {
    try {
      const propertyData = propertySchema.parse({
        ...req.body,
        createdBy: req.user.id
      });
      
      const property = await storage.createProperty(propertyData);
      
      // If seller email is available, create seller account or associate with existing
      if (property.sellerEmail) {
        let seller = await storage.getUserByEmail(property.sellerEmail);
        
        if (!seller) {
          // Create seller account with random password
          const randomPassword = randomBytes(8).toString("hex");
          seller = await storage.createUser({
            email: property.sellerEmail,
            password: randomPassword, // This would be reset by the seller
            role: "seller",
            profileStatus: "verified" // Sellers don't need KYC
          });
          
          // In a real app, we'd send an email with login instructions
          console.log(`Seller account created: ${property.sellerEmail} with temporary password: ${randomPassword}`);
        }
        
        // Associate property with seller
        await storage.updateProperty(property.id, {
          sellerId: seller.id
        });
      }
      
      // Find and notify potential agents
      try {
        const agents = await findAgentsForProperty(property);
        
        // Create leads for each agent
        for (const agent of agents) {
          await storage.createAgentLead({
            propertyId: property.id,
            agentId: agent.id,
            status: "available"
          });
        }
      } catch (error) {
        console.error("Agent matching error:", error);
        // Don't fail the request if agent matching fails
      }
      
      res.status(201).json({
        success: true,
        data: property
      });
    } catch (error) {
      console.error("Property creation error:", error);
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : "Invalid data"
      });
    }
  });
  
  // Get properties for a buyer
  app.get("/api/properties/by-buyer", isAuthenticated, hasRole(["buyer"]), async (req, res) => {
    try {
      const properties = await storage.getPropertiesByBuyer(req.user.id);
      res.json(properties);
    } catch (error) {
      console.error("Get buyer properties error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch properties"
      });
    }
  });
  
  // Get properties for a seller
  app.get("/api/properties/by-seller", isAuthenticated, hasRole(["seller"]), async (req, res) => {
    try {
      const properties = await storage.getPropertiesBySeller(req.user.id);
      res.json(properties);
    } catch (error) {
      console.error("Get seller properties error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch properties"
      });
    }
  });
  
  // Get properties for an agent
  app.get("/api/properties/by-agent", isAuthenticated, hasRole(["agent"]), async (req, res) => {
    try {
      const properties = await storage.getPropertiesByAgent(req.user.id);
      res.json(properties);
    } catch (error) {
      console.error("Get agent properties error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch properties"
      });
    }
  });
  
  // Get property by ID with participants
  app.get("/api/properties/:id", isAuthenticated, async (req, res) => {
    try {
      const propertyId = parseInt(req.params.id);
      const property = await storage.getPropertyWithParticipants(propertyId);
      
      if (!property) {
        return res.status(404).json({
          success: false,
          error: "Property not found"
        });
      }
      
      // Check if user has access to this property
      const userId = req.user.id;
      const role = req.user.role;
      
      const hasAccess = 
        (role === "admin") ||
        (role === "buyer" && property.createdBy === userId) ||
        (role === "seller" && property.sellerId === userId) ||
        (role === "agent" && property.agentId === userId);
      
      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          error: "You don't have access to this property"
        });
      }
      
      res.json(property);
    } catch (error) {
      console.error("Get property error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch property"
      });
    }
  });
  
  // Delete a property
  app.delete("/api/properties/:id", isAuthenticated, async (req, res) => {
    try {
      const propertyId = parseInt(req.params.id);
      const property = await storage.getProperty(propertyId);
      
      if (!property) {
        return res.status(404).json({
          success: false,
          error: "Property not found"
        });
      }
      
      // Check if user has permission to delete this property
      const userId = req.user.id;
      const role = req.user.role;
      
      // Only the buyer who created the property or an admin can delete it
      const hasPermission = 
        (role === "admin") ||
        (role === "buyer" && property.createdBy === userId);
      
      if (!hasPermission) {
        return res.status(403).json({
          success: false,
          error: "You don't have permission to delete this property"
        });
      }
      
      // Delete the property
      await storage.deleteProperty(propertyId);
      
      res.json({
        success: true,
        message: "Property deleted successfully"
      });
    } catch (error) {
      console.error("Delete property error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to delete property"
      });
    }
  });
  
  // Add/update seller email
  app.post("/api/properties/:id/seller-email", isAuthenticated, hasRole(["agent"]), async (req, res) => {
    try {
      const propertyId = parseInt(req.params.id);
      const { email } = req.body;
      
      if (!email || typeof email !== "string" || !z.string().email().safeParse(email).success) {
        return res.status(400).json({
          success: false,
          error: "Valid email is required"
        });
      }
      
      const property = await storage.getProperty(propertyId);
      
      if (!property) {
        return res.status(404).json({
          success: false,
          error: "Property not found"
        });
      }
      
      if (property.agentId !== req.user.id) {
        return res.status(403).json({
          success: false,
          error: "You are not assigned to this property"
        });
      }
      
      // Check if seller account exists, create if not
      let seller = await storage.getUserByEmail(email);
      
      if (!seller) {
        // Create seller account with random password
        const randomPassword = randomBytes(8).toString("hex");
        seller = await storage.createUser({
          email: email,
          password: randomPassword,
          role: "seller",
          profileStatus: "verified" // Sellers don't need KYC
        });
        
        // In a real app, we'd send an email with login instructions
        console.log(`Seller account created: ${email} with temporary password: ${randomPassword}`);
      }
      
      // Update property with seller email and ID
      const updatedProperty = await storage.updateProperty(propertyId, {
        sellerEmail: email,
        sellerId: seller.id
      });
      
      res.json({
        success: true,
        data: updatedProperty
      });
    } catch (error) {
      console.error("Update seller email error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to update seller email"
      });
    }
  });

  // Agent leads routes
  app.get("/api/leads/available", isAuthenticated, hasRole(["agent"]), async (req, res) => {
    try {
      const leads = await storage.getAvailableLeadsByAgent(req.user.id);
      res.json(leads);
    } catch (error) {
      console.error("Get available leads error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch available leads"
      });
    }
  });
  
  app.post("/api/leads/:id/claim", isAuthenticated, hasRole(["agent"]), async (req, res) => {
    try {
      const leadId = parseInt(req.params.id);
      const lead = await storage.getAgentLead(leadId);
      
      if (!lead) {
        return res.status(404).json({
          success: false,
          error: "Lead not found"
        });
      }
      
      if (lead.status !== "available") {
        return res.status(400).json({
          success: false,
          error: "This lead is no longer available"
        });
      }
      
      if (lead.agentId !== req.user.id) {
        return res.status(403).json({
          success: false,
          error: "This lead is not available to you"
        });
      }
      
      // Update lead status
      const updatedLead = await storage.updateAgentLead(leadId, {
        status: "claimed"
      });
      
      // Assign agent to property
      await storage.updateProperty(lead.propertyId, {
        agentId: req.user.id
      });
      
      res.json({
        success: true,
        data: updatedLead
      });
    } catch (error) {
      console.error("Claim lead error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to claim lead"
      });
    }
  });
  
  // File upload for KYC
  app.post("/api/uploads/id-documents", isAuthenticated, upload.fields([
    { name: 'idFront', maxCount: 1 },
    { name: 'idBack', maxCount: 1 }
  ]), async (req, res) => {
    try {
      // In a real app, these files would be uploaded to a secure storage service
      // For this example, we'll just pretend we've stored them and return URLs
      
      const files = req.files as { [fieldname: string]: Express.Multer.File[] };
      
      if (!files.idFront || !files.idBack) {
        return res.status(400).json({
          success: false,
          error: "Both front and back ID images are required"
        });
      }
      
      // Generate fake URLs - in a real app these would be actual URLs to the stored files
      const idFrontUrl = `https://storage.example.com/user-${req.user.id}/id-front-${Date.now()}.jpg`;
      const idBackUrl = `https://storage.example.com/user-${req.user.id}/id-back-${Date.now()}.jpg`;
      
      res.json({
        idFrontUrl,
        idBackUrl
      });
    } catch (error) {
      console.error("ID document upload error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to upload ID documents"
      });
    }
  });

  // AI routes
  app.post("/api/ai/extract-property", isAuthenticated, hasRole(["buyer"]), async (req, res) => {
    try {
      const { address } = req.body;
      
      if (!address || typeof address !== "string") {
        return res.status(400).json({
          success: false,
          error: "Property address is required"
        });
      }
      
      const propertyData = await extractPropertyData(address);
      
      res.json(propertyData);
    } catch (error) {
      console.error("Property data extraction error:", error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Failed to extract property data"
      });
    }
  });
  
  // Extract property details from a URL using web search (non-scraping approach)
  app.post("/api/ai/extract-property-from-url", isAuthenticated, hasRole(["buyer"]), async (req, res) => {
    try {
      const { url } = req.body;
      
      if (!url || typeof url !== "string") {
        return res.status(400).json({
          success: false,
          error: "Property URL is required"
        });
      }
      
      // Use web search to find information about the property URL
      // This avoids direct scraping and potential blocking from real estate websites
      const propertyData = await extractPropertyFromUrl(url);
      
      res.json(propertyData);
    } catch (error) {
      console.error("Property URL extraction error:", error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Failed to extract property data from URL"
      });
    }
  });
  
  // Extract data from ID documents using OpenAI Vision
  app.post("/api/ai/extract-id-data", isAuthenticated, async (req, res) => {
    try {
      const { idFrontBase64, idBackBase64 } = req.body;
      
      if (!idFrontBase64 || !idBackBase64) {
        return res.status(400).json({
          success: false,
          error: "Both front and back ID images are required in base64 format"
        });
      }
      
      const extractedData = await extractIDData(idFrontBase64, idBackBase64);
      
      res.json({
        success: true,
        data: extractedData
      });
    } catch (error) {
      console.error("ID data extraction error:", error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Failed to extract ID data"
      });
    }
  });
  
  // Messages routes
  app.get("/api/messages/property/:propertyId/user/:userId", isAuthenticated, async (req, res) => {
    try {
      const propertyId = parseInt(req.params.propertyId);
      const userId = parseInt(req.params.userId);
      
      // Verify the current user has access to this property
      const property = await storage.getProperty(propertyId);
      
      if (!property) {
        return res.status(404).json({
          success: false,
          error: "Property not found"
        });
      }
      
      const currentUserId = req.user.id;
      const role = req.user.role;
      
      const hasAccess = 
        (role === "admin") ||
        (role === "buyer" && property.createdBy === currentUserId) ||
        (role === "seller" && property.sellerId === currentUserId) ||
        (role === "agent" && property.agentId === currentUserId);
      
      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          error: "You don't have access to this property's messages"
        });
      }
      
      // Verify the other user is a participant
      const isValidParticipant = 
        property.createdBy === userId || 
        property.sellerId === userId || 
        property.agentId === userId;
      
      if (!isValidParticipant) {
        return res.status(403).json({
          success: false,
          error: "The specified user is not a participant in this property"
        });
      }
      
      // Get messages between the current user and the specified user for this property
      const messages = await storage.getMessagesBetweenUsers(propertyId, currentUserId, userId);
      
      res.json(messages);
    } catch (error) {
      console.error("Get messages error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch messages"
      });
    }
  });
  
  // Admin routes
  app.get("/api/admin/users", isAuthenticated, hasRole(["admin"]), async (req, res) => {
    try {
      const users = await storage.getAllUsers();
      res.json(users);
    } catch (error) {
      console.error("Get all users error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch users"
      });
    }
  });
  
  app.get("/api/admin/properties", isAuthenticated, hasRole(["admin"]), async (req, res) => {
    try {
      const properties = await storage.getAllProperties();
      res.json(properties);
    } catch (error) {
      console.error("Get all properties error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch properties"
      });
    }
  });
  
  app.get("/api/admin/agents", isAuthenticated, hasRole(["admin"]), async (req, res) => {
    try {
      const agents = await storage.getUsersByRole("agent");
      res.json(agents);
    } catch (error) {
      console.error("Get agents error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch agents"
      });
    }
  });
  
  app.put("/api/admin/users/:id/block", isAuthenticated, hasRole(["admin"]), async (req, res) => {
    try {
      const userId = parseInt(req.params.id);
      const { block } = req.body;
      
      if (typeof block !== "boolean") {
        return res.status(400).json({
          success: false,
          error: "Block parameter must be a boolean"
        });
      }
      
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({
          success: false,
          error: "User not found"
        });
      }
      
      // Don't allow blocking other admins
      if (user.role === "admin") {
        return res.status(403).json({
          success: false,
          error: "Cannot block admin users"
        });
      }
      
      const updatedUser = await storage.updateUser(userId, {
        isBlocked: block
      });
      
      res.json({
        success: true,
        data: updatedUser
      });
    } catch (error) {
      console.error("Block user error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to update user"
      });
    }
  });
  
  app.put("/api/admin/properties/:id/reassign", isAuthenticated, hasRole(["admin"]), async (req, res) => {
    try {
      const propertyId = parseInt(req.params.id);
      const { agentId } = req.body;
      
      if (!agentId || typeof agentId !== "number") {
        return res.status(400).json({
          success: false,
          error: "Valid agent ID is required"
        });
      }
      
      // Verify property exists
      const property = await storage.getProperty(propertyId);
      
      if (!property) {
        return res.status(404).json({
          success: false,
          error: "Property not found"
        });
      }
      
      // Verify agent exists and is an agent
      const agent = await storage.getUser(agentId);
      
      if (!agent || agent.role !== "agent") {
        return res.status(400).json({
          success: false,
          error: "Invalid agent ID"
        });
      }
      
      // Update property with new agent
      const updatedProperty = await storage.updateProperty(propertyId, {
        agentId: agentId
      });
      
      res.json({
        success: true,
        data: updatedProperty
      });
    } catch (error) {
      console.error("Reassign agent error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to reassign agent"
      });
    }
  });

  return httpServer;
}
