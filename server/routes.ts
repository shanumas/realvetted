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
  agreementSchema,
  viewingRequestSchema,
  User,
  ViewingRequest
} from "@shared/schema";
import { PropertyAIData, ViewingRequestWithParticipants, WebSocketMessage } from "@shared/types";
import multer from "multer";
import { randomBytes } from "crypto";
import { scrypt, timingSafeEqual } from "crypto";
import { promisify } from "util";

const scryptAsync = promisify(scrypt);

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}
import { z } from "zod";

export async function registerRoutes(app: Express): Promise<Server> {
  // Set up HTTP server
  const httpServer = createServer(app);
  
  // Set up authentication
  const { isAuthenticated, hasRole } = setupAuth(app);
  
  // Set up WebSocket server
  const websocketServer = setupWebSocketServer(httpServer);
  
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
            
            // If this is an agent, create leads for existing properties
            if (req.user.role === "agent") {
              try {
                // Create leads for this agent for appropriate properties
                const properties = await storage.getAllProperties();
                const agent = await storage.getUser(req.user.id);
                
                if (agent && properties.length > 0) {
                  console.log(`Creating leads for newly verified agent ${agent.id} (${agent.email})`);
                  
                  // Find properties in the same state as the agent
                  const matchingProperties = properties.filter(property => 
                    // Match by state if available
                    (agent.state && property.state && 
                     agent.state.toLowerCase() === property.state.toLowerCase())
                  );
                  
                  // Use properties from same state, or fall back to first 3 if none match
                  const propertiesToMatch = matchingProperties.length > 0 
                    ? matchingProperties.slice(0, 3) 
                    : properties.slice(0, 3);
                  
                  // Create leads
                  for (const property of propertiesToMatch) {
                    await storage.createAgentLead({
                      propertyId: property.id,
                      agentId: agent.id,
                      status: "available"
                    });
                    console.log(`Created lead for agent ${agent.id} on property ${property.id}`);
                    
                    // Send WebSocket notification
                    if (websocketServer) {
                      websocketServer.broadcastToUsers([agent.id], {
                        type: 'notification',
                        data: {
                          message: 'New lead available! A property matches your location.',
                          propertyId: property.id
                        }
                      });
                    }
                  }
                }
              } catch (leadError) {
                console.error("Error creating leads for new agent:", leadError);
                // Don't fail verification if lead creation fails
              }
            }
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
      
      // Log property creation
      try {
        await storage.createPropertyActivityLog({
          propertyId: property.id,
          userId: req.user!.id,
          activity: "Property created",
          details: {
            address: property.address,
            price: property.price,
            createdBy: {
              id: req.user!.id,
              role: req.user!.role
            }
          }
        });
      } catch (logError) {
        console.error("Failed to create activity log for property creation, but property was created:", logError);
        // Continue without failing the whole request
      }
      
      // If seller email is available, create seller account or associate with existing
      if (property.sellerEmail) {
        let seller = await storage.getUserByEmail(property.sellerEmail);
        
        if (!seller) {
          // Create seller account with default password
          const defaultSellerPassword = "Kuttybuski123*";
          // Hash the password before storing it
          const hashedPassword = await hashPassword(defaultSellerPassword);
          seller = await storage.createUser({
            email: property.sellerEmail,
            password: hashedPassword, // Hashed password for sellers
            role: "seller",
            profileStatus: "verified" // Sellers don't need KYC
          });
          
          // In a real app, we'd send an email with login instructions
          console.log(`Seller account created: ${property.sellerEmail} with standard password: ${defaultSellerPassword}`);
        }
        
        // Associate property with seller
        await storage.updateProperty(property.id, {
          sellerId: seller.id
        });
      }
      
      // Find and notify potential agents
      try {
        const agents = await findAgentsForProperty(property);
        console.log(`Found ${agents.length} matching agents for property ${property.id}`);
        
        // Create leads for top 3 agents only
        const topAgents = agents.slice(0, 3);
        
        // Auto-assign the first agent if available
        if (topAgents.length > 0) {
          const assignedAgent = topAgents[0];
          
          // Update property with assigned agent
          await storage.updateProperty(property.id, {
            agentId: assignedAgent.id
          });
          
          // Log agent assignment
          await storage.createPropertyActivityLog({
            propertyId: property.id,
            userId: assignedAgent.id,
            activity: "Agent automatically assigned",
            details: {
              agentId: assignedAgent.id,
              agentEmail: assignedAgent.email
            }
          });
          
          console.log(`Automatically assigned agent ${assignedAgent.id} to property ${property.id}`);
          
          // Notify the buyer about the assigned agent
          if (websocketServer) {
            websocketServer.broadcastToUsers([req.user!.id], {
              type: 'notification',
              data: {
                message: `An agent has been automatically assigned to your property at ${property.address}.`,
                propertyId: property.id
              }
            });
          }
          
          // Notify the assigned agent
          if (websocketServer) {
            websocketServer.broadcastToUsers([assignedAgent.id], {
              type: 'notification',
              data: {
                message: 'You have been automatically assigned to a new property that matches your expertise.',
                propertyId: property.id
              }
            });
          }
          
          // Create leads for the other top agents as backup
          for (const agent of topAgents) {
            // Set status as "claimed" for the assigned agent, "available" for others
            const status = agent.id === assignedAgent.id ? "claimed" : "available";
            
            const lead = await storage.createAgentLead({
              propertyId: property.id,
              agentId: agent.id,
              status: status
            });
            console.log(`Created lead ${lead.id} for agent ${agent.id} on property ${property.id} with status ${status}`);
            
            // Send notification about available leads (except to the already assigned agent)
            if (agent.id !== assignedAgent.id && websocketServer) {
              websocketServer.broadcastToUsers([agent.id], {
                type: 'notification',
                data: {
                  message: 'New lead available! A buyer has added a property that matches your expertise.',
                  propertyId: property.id,
                  leadId: lead.id
                }
              });
            }
          }
        } else {
          console.log(`No matching agents found for property ${property.id}`);
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
      
      // Check if an agent has already accepted this property's lead
      // If property.agentId exists, it means an agent has accepted the lead
      if (role === "buyer" && property.agentId) {
        return res.status(403).json({
          success: false,
          error: "Cannot delete property after an agent has accepted the lead"
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
  
  // Send email to seller and update emailSent flag
  app.post("/api/properties/:id/send-email", isAuthenticated, async (req, res) => {
    try {
      const propertyId = parseInt(req.params.id);
      const property = await storage.getProperty(propertyId);
      
      if (!property) {
        return res.status(404).json({
          success: false,
          error: "Property not found"
        });
      }
      
      // Check user permissions
      const userId = req.user?.id;
      const userRole = req.user?.role;
      
      if (!userId || !userRole) {
        return res.status(401).json({
          success: false,
          error: "Unauthorized"
        });
      }
      
      const hasAccess = 
        (userRole === "admin") ||
        (userRole === "buyer" && property.createdBy === userId) ||
        (userRole === "agent" && property.agentId === userId);
      
      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          error: "You don't have permission to send an email for this property"
        });
      }
      
      if (!property.sellerEmail) {
        return res.status(400).json({
          success: false,
          error: "No seller email address available"
        });
      }
      
      // In a real application, this would send an actual email
      // For now, we'll just mark it as sent
      console.log(`[Email Service] Sending email to seller ${property.sellerEmail} about property ${propertyId}`);
      
      // Update property to mark email as sent
      const updatedProperty = await storage.updateProperty(propertyId, {
        emailSent: true
      });
      
      // Log this activity
      try {
        await storage.createPropertyActivityLog({
          propertyId,
          userId: userId || null,
          activity: "Email sent to seller",
          details: {
            sellerEmail: property.sellerEmail,
            sentBy: {
              id: userId,
              role: userRole
            }
          }
        });
      } catch (logError) {
        console.error("Failed to create activity log, but email was marked as sent:", logError);
        // Continue without failing the whole request
      }
      
      // Send WebSocket notification to all users with access to this property
      const notifyUserIds = [property.createdBy];
      if (property.agentId) notifyUserIds.push(property.agentId);
      if (property.sellerId) notifyUserIds.push(property.sellerId);
      
      websocketServer.broadcastToUsers(notifyUserIds, {
        type: 'property_update',
        data: {
          propertyId,
          action: 'email_sent',
          message: 'Email has been sent to the seller'
        }
      });
      
      res.json({
        success: true,
        data: updatedProperty
      });
    } catch (error) {
      console.error("Send email error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to send email to seller"
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
        // Create seller account with default password
        const defaultSellerPassword = "Kuttybuski123*";
        // Hash the password before storing it
        const hashedPassword = await hashPassword(defaultSellerPassword);
        seller = await storage.createUser({
          email: email,
          password: hashedPassword, // Hashed password for sellers
          role: "seller",
          profileStatus: "verified" // Sellers don't need KYC
        });
        
        // In a real app, we'd send an email with login instructions
        console.log(`Seller account created: ${email} with standard password: ${defaultSellerPassword}`);
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

  // Get all available agents for buyers to choose from
  app.get("/api/agents", isAuthenticated, async (req, res) => {
    try {
      // Get verified, unblocked agents
      const allAgents = await storage.getUsersByRole("agent");
      const verifiedAgents = allAgents.filter(agent => 
        agent.profileStatus === "verified" && !agent.isBlocked
      );
      
      // Return minimal info for security
      const agents = verifiedAgents.map(agent => ({
        id: agent.id,
        firstName: agent.firstName,
        lastName: agent.lastName,
        state: agent.state,
        city: agent.city,
        profileStatus: agent.profileStatus
      }));
      
      res.json(agents);
    } catch (error) {
      console.error("Get all agents error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch agents"
      });
    }
  });
  
  // Agent leads routes
  app.get("/api/leads/available", isAuthenticated, hasRole(["agent"]), async (req, res) => {
    try {
      console.log(`Getting available leads for agent ID: ${req.user.id}`);
      const leads = await storage.getAvailableLeadsByAgent(req.user.id);
      console.log(`Found ${leads.length} available leads`);
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
      
      // Log this activity
      try {
        await storage.createPropertyActivityLog({
          propertyId: lead.propertyId,
          userId: req.user!.id,
          activity: "Agent claimed lead",
          details: {
            leadId: lead.id,
            agentId: req.user!.id,
            agentEmail: req.user!.email
          }
        });
      } catch (logError) {
        console.error("Failed to create activity log for agent claiming lead, but lead was claimed:", logError);
        // Continue without failing the whole request
      }
      
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
  
  // File upload for profile photo
  app.post("/api/uploads/profile-photo", upload.single('profilePhoto'), async (req, res) => {
    try {
      // In a real app, this file would be uploaded to a secure storage service
      // For this example, we'll just pretend we've stored it and return a URL
      
      const file = req.file;
      
      if (!file) {
        return res.status(400).json({
          success: false,
          error: "Profile photo is required"
        });
      }
      
      // Generate fake URL - in a real app this would be an actual URL to the stored file
      // We include a timestamp to make it unique and prevent caching issues
      const profilePhotoUrl = `https://storage.example.com/user-profiles/profile-${Date.now()}.jpg`;
      
      res.json({
        success: true,
        profilePhotoUrl
      });
    } catch (error) {
      console.error("Profile photo upload error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to upload profile photo"
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
  
  // Endpoint for buyers to choose their own agent
  app.put("/api/properties/:id/choose-agent", isAuthenticated, hasRole(["buyer"]), async (req, res) => {
    try {
      const propertyId = parseInt(req.params.id);
      const { agentId } = req.body;
      
      if (!agentId || typeof agentId !== "number") {
        return res.status(400).json({
          success: false,
          error: "Valid agent ID is required"
        });
      }
      
      // Verify property exists and belongs to this buyer
      const property = await storage.getProperty(propertyId);
      
      if (!property) {
        return res.status(404).json({
          success: false,
          error: "Property not found"
        });
      }
      
      // Make sure the property belongs to this buyer
      if (property.createdBy !== req.user.id) {
        return res.status(403).json({
          success: false,
          error: "You don't have permission to choose an agent for this property"
        });
      }
      
      // Verify agent exists and is a verified agent
      const agent = await storage.getUser(agentId);
      
      if (!agent || agent.role !== "agent" || agent.profileStatus !== "verified" || agent.isBlocked) {
        return res.status(400).json({
          success: false,
          error: "Invalid or unavailable agent"
        });
      }
      
      // Update property with new agent
      const updatedProperty = await storage.updateProperty(propertyId, {
        agentId: agentId
      });
      
      // Log this action
      try {
        await storage.createPropertyActivityLog({
          propertyId,
          userId: req.user!.id,
          activity: "Buyer chose agent",
          details: {
            previousAgentId: property.agentId,
            newAgentId: agentId,
            buyerId: req.user!.id
          }
        });
      } catch (logError) {
        console.error("Failed to create activity log for buyer choosing agent, but agent was assigned:", logError);
        // Continue without failing the whole request
      }
      
      // Send WebSocket notification to the agent
      websocketServer.broadcastToUsers([agentId], {
        type: 'notification',
        data: {
          message: 'A buyer has assigned you to their property!',
          propertyId: propertyId
        }
      });
      
      res.json({
        success: true,
        data: updatedProperty
      });
    } catch (error) {
      console.error("Choose agent error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to assign agent to property"
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
      
      // Log this admin action
      try {
        await storage.createPropertyActivityLog({
          propertyId,
          userId: req.user!.id,
          activity: "Admin reassigned agent",
          details: {
            previousAgentId: property.agentId,
            newAgentId: agentId,
            adminId: req.user!.id
          }
        });
      } catch (logError) {
        console.error("Failed to create activity log for admin reassigning agent, but agent was reassigned:", logError);
        // Continue without failing the whole request
      }
      
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

  // Property activity log endpoints
  app.get("/api/properties/:id/logs", isAuthenticated, async (req, res) => {
    try {
      const propertyId = parseInt(req.params.id);
      const property = await storage.getProperty(propertyId);
      
      if (!property) {
        return res.status(404).json({
          success: false,
          error: "Property not found"
        });
      }
      
      // Check user permissions
      const userId = req.user?.id;
      const userRole = req.user?.role;
      
      if (
        userRole !== "admin" && 
        property.createdBy !== userId &&
        property.sellerId !== userId &&
        property.agentId !== userId
      ) {
        return res.status(403).json({
          success: false,
          error: "You don't have permission to perform this action"
        });
      }
      
      const logs = await storage.getPropertyActivityLogs(propertyId);
      
      res.json({
        success: true,
        data: logs
      });
    } catch (error) {
      console.error("Error getting property logs:", error);
      res.status(500).json({
        success: false,
        error: "Failed to get property logs"
      });
    }
  });

  // Agreement endpoints
  app.get("/api/properties/:id/agreements", isAuthenticated, async (req, res) => {
    try {
      const propertyId = parseInt(req.params.id);
      const property = await storage.getProperty(propertyId);
      
      if (!property) {
        return res.status(404).json({
          success: false,
          error: "Property not found"
        });
      }
      
      // Check user permissions
      const userId = req.user?.id;
      const userRole = req.user?.role;
      
      if (
        userRole !== "admin" && 
        property.createdBy !== userId &&
        property.sellerId !== userId &&
        property.agentId !== userId
      ) {
        return res.status(403).json({
          success: false,
          error: "You don't have permission to view agreements for this property"
        });
      }
      
      const agreements = await storage.getAgreementsByProperty(propertyId);
      
      res.json({
        success: true,
        data: agreements
      });
    } catch (error) {
      console.error("Error getting property agreements:", error);
      res.status(500).json({
        success: false,
        error: "Failed to get property agreements"
      });
    }
  });
  
  app.get("/api/agreements/:id", isAuthenticated, async (req, res) => {
    try {
      const agreementId = parseInt(req.params.id);
      const agreement = await storage.getAgreement(agreementId);
      
      if (!agreement) {
        return res.status(404).json({
          success: false,
          error: "Agreement not found"
        });
      }
      
      // Verify user has permission to view this agreement
      const property = await storage.getProperty(agreement.propertyId);
      
      if (!property) {
        return res.status(404).json({
          success: false,
          error: "Property not found"
        });
      }
      
      // Check user permissions
      const userId = req.user?.id;
      const userRole = req.user?.role;
      
      if (
        userRole !== "admin" && 
        property.createdBy !== userId &&
        property.sellerId !== userId &&
        property.agentId !== userId &&
        agreement.buyerId !== userId &&
        agreement.agentId !== userId
      ) {
        return res.status(403).json({
          success: false,
          error: "You don't have permission to view this agreement"
        });
      }
      
      res.json({
        success: true,
        data: agreement
      });
    } catch (error) {
      console.error("Error getting agreement:", error);
      res.status(500).json({
        success: false,
        error: "Failed to get agreement"
      });
    }
  });
  
  app.post("/api/properties/:id/agreements", isAuthenticated, async (req, res) => {
    try {
      const propertyId = parseInt(req.params.id);
      const property = await storage.getProperty(propertyId);
      
      if (!property) {
        return res.status(404).json({
          success: false,
          error: "Property not found"
        });
      }
      
      // Only agents can create agreements
      if (req.user.role !== "agent" && req.user.role !== "admin") {
        return res.status(403).json({
          success: false,
          error: "Only agents can create agreements"
        });
      }
      
      // Ensure the agent is assigned to this property
      if (req.user.role === "agent" && property.agentId !== req.user.id) {
        return res.status(403).json({
          success: false,
          error: "You are not the agent assigned to this property"
        });
      }
      
      const agreementData = req.body;
      
      // Validate required fields
      if (!agreementData.buyerId || !agreementData.agreementText || !agreementData.agentSignature) {
        return res.status(400).json({
          success: false,
          error: "Missing required fields: buyerId, agreementText, and agentSignature are required"
        });
      }
      
      const agreement = await storage.createAgreement({
        propertyId,
        agentId: req.user.role === "admin" ? agreementData.agentId : req.user.id,
        buyerId: agreementData.buyerId,
        agreementText: agreementData.agreementText,
        agentSignature: agreementData.agentSignature,
        date: new Date(),
        status: "pending_buyer"
      });
      
      // Log this activity
      try {
        await storage.createPropertyActivityLog({
          propertyId,
          userId: req.user.id,
          activity: "Agreement created",
          details: {
            agreementId: agreement.id,
            status: agreement.status
          }
        });
      } catch (logError) {
        console.error("Failed to create activity log for agreement creation, but agreement was created:", logError);
      }
      
      res.status(201).json({
        success: true,
        data: agreement
      });
    } catch (error) {
      console.error("Error creating agreement:", error);
      res.status(500).json({
        success: false,
        error: "Failed to create agreement"
      });
    }
  });
  
  app.patch("/api/agreements/:id", isAuthenticated, async (req, res) => {
    try {
      const agreementId = parseInt(req.params.id);
      const agreement = await storage.getAgreement(agreementId);
      
      if (!agreement) {
        return res.status(404).json({
          success: false,
          error: "Agreement not found"
        });
      }
      
      const updateData = req.body;
      
      // Determine what's being updated and check permissions
      if (updateData.buyerSignature) {
        // Only the buyer can sign as the buyer
        if (req.user.id !== agreement.buyerId && req.user.role !== "admin") {
          return res.status(403).json({
            success: false,
            error: "Only the buyer can sign as the buyer"
          });
        }
        
        // Update the status
        updateData.status = "signed_buyer";
      } else if (updateData.sellerSignature) {
        // Only the seller can sign as the seller
        const property = await storage.getProperty(agreement.propertyId);
        
        if (!property) {
          return res.status(404).json({
            success: false,
            error: "Property not found"
          });
        }
        
        if (req.user.id !== property.sellerId && req.user.role !== "admin") {
          return res.status(403).json({
            success: false,
            error: "Only the seller can sign as the seller"
          });
        }
        
        // Update the status
        updateData.status = "completed";
      } else if (updateData.status) {
        // Only admins can update status directly
        if (req.user.role !== "admin") {
          return res.status(403).json({
            success: false,
            error: "Only administrators can update status directly"
          });
        }
      }
      
      // Update the agreement
      const updatedAgreement = await storage.updateAgreement(agreementId, updateData);
      
      // Log this activity
      try {
        await storage.createPropertyActivityLog({
          propertyId: agreement.propertyId,
          userId: req.user.id,
          activity: `Agreement ${updatedAgreement.status}`,
          details: {
            agreementId,
            previousStatus: agreement.status,
            newStatus: updatedAgreement.status
          }
        });
      } catch (logError) {
        console.error("Failed to create activity log for agreement update, but agreement was updated:", logError);
      }
      
      res.json({
        success: true,
        data: updatedAgreement
      });
    } catch (error) {
      console.error("Error updating agreement:", error);
      res.status(500).json({
        success: false,
        error: "Failed to update agreement"
      });
    }
  });

  // Viewing Request Routes
  
  // Create a viewing request
  app.post("/api/viewing-requests", isAuthenticated, hasRole(["buyer"]), async (req, res) => {
    try {
      const requestData = viewingRequestSchema.parse({
        ...req.body,
        buyerId: req.user!.id
      });
      
      const property = await storage.getProperty(requestData.propertyId);
      if (!property) {
        return res.status(404).json({
          success: false,
          error: "Property not found"
        });
      }
      
      // Check if user has access to this property (only buyer who created the property can request a viewing)
      if (property.createdBy !== req.user!.id) {
        return res.status(403).json({
          success: false,
          error: "You don't have permission to request a viewing for this property"
        });
      }
      
      // Create the viewing request
      const viewingRequest = await storage.createViewingRequest(requestData);
      
      // Log the activity
      try {
        await storage.createPropertyActivityLog({
          propertyId: property.id,
          userId: req.user!.id,
          activity: "Viewing requested",
          details: {
            requestId: viewingRequest.id,
            requestedDate: viewingRequest.requestedDate,
            requestedEndDate: viewingRequest.requestedEndDate
          }
        });
      } catch (logError) {
        console.error("Failed to create activity log for viewing request:", logError);
        // Continue without failing the whole request
      }
      
      // Send WebSocket notifications
      const notifyUserIds = [req.user!.id]; // Notify the buyer
      
      // Notify the buyer's agent if assigned
      if (viewingRequest.buyerAgentId) {
        notifyUserIds.push(viewingRequest.buyerAgentId);
      }
      
      // Notify the seller's agent if assigned
      if (viewingRequest.sellerAgentId) {
        notifyUserIds.push(viewingRequest.sellerAgentId);
      }
      
      // Notify the seller if assigned
      if (property.sellerId) {
        notifyUserIds.push(property.sellerId);
      }
      
      websocketServer.broadcastToUsers(notifyUserIds, {
        type: 'notification',
        data: {
          message: 'A new viewing has been requested',
          propertyId: property.id,
          viewingRequestId: viewingRequest.id
        }
      });
      
      res.status(201).json({
        success: true,
        data: viewingRequest
      });
    } catch (error) {
      console.error("Create viewing request error:", error);
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : "Invalid data"
      });
    }
  });
  
  // Get all viewing requests for a property
  app.get("/api/properties/:id/viewing-requests", isAuthenticated, async (req, res) => {
    try {
      const propertyId = parseInt(req.params.id);
      const property = await storage.getProperty(propertyId);
      
      if (!property) {
        return res.status(404).json({
          success: false,
          error: "Property not found"
        });
      }
      
      // Check if user has access to this property
      const userId = req.user!.id;
      const role = req.user!.role;
      
      const hasAccess = 
        (role === "admin") ||
        (role === "buyer" && property.createdBy === userId) ||
        (role === "seller" && property.sellerId === userId) ||
        (role === "agent" && property.agentId === userId);
      
      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          error: "You don't have access to viewing requests for this property"
        });
      }
      
      // Get the viewing requests with participant information
      const viewingRequests = await Promise.all(
        (await storage.getViewingRequestsByProperty(propertyId)).map(async (request) => {
          let buyer = undefined;
          if (request.buyerId) {
            buyer = await storage.getUser(request.buyerId);
          }

          let agent = undefined;
          if (request.agentId) {
            agent = await storage.getUser(request.agentId);
          }

          return {
            ...request,
            buyer,
            agent
          } as ViewingRequestWithParticipants;
        })
      );
      
      res.json(viewingRequests);
    } catch (error) {
      console.error("Get viewing requests error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch viewing requests"
      });
    }
  });
  
  // Get viewing requests for the current buyer
  app.get("/api/viewing-requests/buyer", isAuthenticated, hasRole(["buyer"]), async (req, res) => {
    try {
      const viewingRequests = await storage.getViewingRequestsByBuyer(req.user!.id);
      res.json(viewingRequests);
    } catch (error) {
      console.error("Get buyer viewing requests error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch viewing requests"
      });
    }
  });
  
  // Get viewing requests for the current agent
  app.get("/api/viewing-requests/agent", isAuthenticated, hasRole(["agent"]), async (req, res) => {
    try {
      const viewingRequests = await storage.getViewingRequestsByAgent(req.user!.id);
      res.json(viewingRequests);
    } catch (error) {
      console.error("Get agent viewing requests error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch viewing requests"
      });
    }
  });
  
  // Get a specific viewing request with participants
  app.get("/api/viewing-requests/:id", isAuthenticated, async (req, res) => {
    try {
      const requestId = parseInt(req.params.id);
      const viewingRequest = await storage.getViewingRequestWithParticipants(requestId);
      
      if (!viewingRequest) {
        return res.status(404).json({
          success: false,
          error: "Viewing request not found"
        });
      }
      
      // Check if user has access to this viewing request
      const userId = req.user!.id;
      const role = req.user!.role;
      
      // Get the property to check permissions
      const property = await storage.getProperty(viewingRequest.propertyId);
      if (!property) {
        return res.status(404).json({
          success: false,
          error: "Property not found"
        });
      }
      
      const hasAccess = 
        (role === "admin") ||
        (role === "buyer" && viewingRequest.buyerId === userId) ||
        (role === "seller" && property.sellerId === userId) ||
        (role === "agent" && 
          (viewingRequest.buyerAgentId === userId || 
           viewingRequest.sellerAgentId === userId || 
           property.agentId === userId));
      
      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          error: "You don't have access to this viewing request"
        });
      }
      
      res.json(viewingRequest);
    } catch (error) {
      console.error("Get viewing request error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch viewing request"
      });
    }
  });
  
  // Update a viewing request (accept, reject, reschedule)
  app.put("/api/viewing-requests/:id", isAuthenticated, async (req, res) => {
    try {
      const requestId = parseInt(req.params.id);
      const viewingRequest = await storage.getViewingRequest(requestId);
      
      if (!viewingRequest) {
        return res.status(404).json({
          success: false,
          error: "Viewing request not found"
        });
      }
      
      // Check if user has permission to update this viewing request
      const userId = req.user!.id;
      const role = req.user!.role;
      
      // Get the property to check permissions
      const property = await storage.getProperty(viewingRequest.propertyId);
      if (!property) {
        return res.status(404).json({
          success: false,
          error: "Property not found"
        });
      }
      
      const isAgent = role === "agent" && 
        (viewingRequest.buyerAgentId === userId || 
         viewingRequest.sellerAgentId === userId || 
         property.agentId === userId);
         
      const isSeller = role === "seller" && property.sellerId === userId;
      const isBuyer = role === "buyer" && viewingRequest.buyerId === userId;
      const isAdmin = role === "admin";
      
      // Only agents, sellers, the requesting buyer, or admins can update viewing requests
      if (!(isAgent || isSeller || isBuyer || isAdmin)) {
        return res.status(403).json({
          success: false,
          error: "You don't have permission to update this viewing request"
        });
      }
      
      // Parse the update data
      const { status, confirmedDate, confirmedEndDate, responseMessage } = req.body;
      
      // Validate the status
      if (status && !["pending", "accepted", "rejected", "rescheduled", "completed", "cancelled"].includes(status)) {
        return res.status(400).json({
          success: false,
          error: "Invalid status value"
        });
      }
      
      // Create update data object
      const updateData: Partial<ViewingRequest> = {};
      if (status) updateData.status = status;
      if (confirmedDate) updateData.confirmedDate = new Date(confirmedDate);
      if (confirmedEndDate) updateData.confirmedEndDate = new Date(confirmedEndDate);
      if (responseMessage) updateData.responseMessage = responseMessage;
      
      // If accepting or rescheduling, record who confirmed
      if (["accepted", "rescheduled"].includes(status)) {
        updateData.confirmedById = userId;
      }
      
      // Update the viewing request
      const updatedRequest = await storage.updateViewingRequest(requestId, updateData);
      
      // Log the activity
      try {
        await storage.createPropertyActivityLog({
          propertyId: property.id,
          userId: userId,
          activity: `Viewing request ${status}`,
          details: {
            requestId: updatedRequest.id,
            status: updatedRequest.status,
            updatedBy: {
              id: userId,
              role: role
            }
          }
        });
      } catch (logError) {
        console.error("Failed to create activity log for viewing request update:", logError);
        // Continue without failing the whole request
      }
      
      // Send WebSocket notifications
      const notifyUserIds = [viewingRequest.buyerId]; // Always notify the buyer
      
      // Notify the buyer's agent if assigned
      if (viewingRequest.buyerAgentId) {
        notifyUserIds.push(viewingRequest.buyerAgentId);
      }
      
      // Notify the seller's agent if assigned
      if (viewingRequest.sellerAgentId) {
        notifyUserIds.push(viewingRequest.sellerAgentId);
      }
      
      // Notify the seller if assigned
      if (property.sellerId) {
        notifyUserIds.push(property.sellerId);
      }
      
      // Notify the property's agent if assigned
      if (property.agentId) {
        notifyUserIds.push(property.agentId);
      }
      
      websocketServer.broadcastToUsers(notifyUserIds, {
        type: 'property_update',
        data: {
          propertyId: property.id,
          viewingRequestId: updatedRequest.id,
          action: 'viewing_request_updated',
          status: updatedRequest.status,
          message: `Viewing request has been ${updatedRequest.status}`
        }
      });
      
      res.json({
        success: true,
        data: updatedRequest
      });
    } catch (error) {
      console.error("Update viewing request error:", error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Failed to update viewing request"
      });
    }
  });

  return httpServer;
}
