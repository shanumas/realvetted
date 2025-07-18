import express, { type Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth } from "./auth";
import { setupWebSocketServer } from "./websocket";
import { exec, execSync } from "child_process";
import {
  findAgentsForProperty,
  validatePrequalificationDocument,
} from "./openai";
import { extractPropertyFromUrl } from "./extraction";
import {
  sendTourRequestEmail,
  sendPrequalificationApprovalEmail,
  sendSupportChatNotification,
  sendSignedBrbcToBuyer,
  getAllEmails,
  getSentEmailsForUser,
  getSentEmailsForEntity,
} from "./email-service";
import { lookupCaliforniaLicense } from "./license-lookup";
import {
  createVeriffSession,
  checkVeriffSessionStatus,
  processVeriffWebhook,
} from "./veriff";
import {
  propertySchema,
  agentLeadSchema,
  kycUpdateSchema,
  messageSchema,
  agreementSchema,
  viewingRequestSchema,
  User,
  ViewingRequest,
  Property,
} from "@shared/schema";
import {
  PropertyAIData,
  ViewingRequestWithParticipants,
  WebSocketMessage,
} from "@shared/types";

// Type definition for viewing request response to listing agent
interface PublicViewingResponse {
  success: boolean;
  viewingRequest: ViewingRequestWithParticipants;
  property: Property;
  buyerName?: string;
  agentName?: string;
}
import {
  getPublicViewingRequestLink,
  validateViewingToken,
} from "./token-service";
import multer from "multer";
import { randomBytes } from "crypto";
import { scrypt, timingSafeEqual } from "crypto";
import { promisify } from "util";
import path from "path";
import fs from "fs";
import {
  addSignatureToPdf,
  replacePlaceholderInPdf,
  AgencyDisclosureFormData,
  AgentReferralFormData,
  fillAgencyDisclosureForm,
  fillAgentReferralForm,
  fillBrbcForm,
} from "./pdf-service";

// Create uploads directories if they don't exist
const uploadsDir = path.join(process.cwd(), "uploads");
const pdfDir = path.join(uploadsDir, "pdf");
const imagesDir = path.join(uploadsDir, "images");
const idDir = path.join(uploadsDir, "id");
const agreementsDir = path.join(uploadsDir, "agreements");
const prequalificationDir = path.join(uploadsDir, "prequalification");

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
if (!fs.existsSync(pdfDir)) {
  fs.mkdirSync(pdfDir, { recursive: true });
}
if (!fs.existsSync(imagesDir)) {
  fs.mkdirSync(imagesDir, { recursive: true });
}
if (!fs.existsSync(idDir)) {
  fs.mkdirSync(idDir, { recursive: true });
}
if (!fs.existsSync(agreementsDir)) {
  fs.mkdirSync(agreementsDir, { recursive: true });
}
if (!fs.existsSync(prequalificationDir)) {
  fs.mkdirSync(prequalificationDir, { recursive: true });
}

const scryptAsync = promisify(scrypt);

// pdfDir is already defined above

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}
import { z } from "zod";
import { SupportMessage, supportMessageSchema } from "@shared/schema";

// Handler for support chat messages
async function handleSupportChatMessage(
  message: any,
  client?: any,
): Promise<void> {
  try {
    // Skip if not a support chat message
    if (message.type !== "support") {
      return;
    }

    // Validate the message
    if (!message.sessionId || !message.content || !message.senderName) {
      console.error("Invalid support message format:", message);
      return;
    }

    // Store the message in database
    const newMessage = await storage.createSupportMessage({
      sessionId: message.sessionId,
      senderId: message.senderId || null,
      senderName: message.senderName,
      senderEmail: message.senderEmail || null,
      content: message.content,
      isAdmin: !!message.isAdmin,
    });

    // Send new chat notification email
    if (!message.isAdmin) {
      // Only send notification for new customer messages (not admin replies)
      // Also only send for first message in a session
      const sessionMessages = await storage.getSupportMessagesBySession(
        message.sessionId,
      );
      if (sessionMessages.length <= 1) {
        // First message in session
        // Send email notification
        await sendSupportChatNotification(
          message.senderName,
          message.senderEmail || "Anonymous",
          message.content,
          message.sessionId,
        );
      }
    }

    // Return the message to the sender and broadcast to admin users
    return message;
  } catch (error) {
    console.error("Error handling support chat message:", error);
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Set up HTTP server
  const httpServer = createServer(app);

  // Set up authentication
  const { isAuthenticated, hasRole } = setupAuth(app);

  // Set up WebSocket server
  const websocketServer = setupWebSocketServer(
    httpServer,
    handleSupportChatMessage,
  );

  // Set up static file serving for uploads
  app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));
  app.use(
    "/attached_assets",
    express.static(path.join(process.cwd(), "attached_assets")),
  );

  // Ensure upload directory is accessible
  console.log("Upload directories:");
  console.log(" - Uploads dir path:", uploadsDir);
  console.log(" - Prequalification dir path:", prequalificationDir);

  // Serve PDF files with optional fillable mode and prefilling capabilities
  app.get("/api/docs/:filename", async (req, res) => {
    try {
      const { filename } = req.params;
      const fillable = req.query.fillable === "true";
      const prefill = (req.query.prefill as string) || "";
      const inline = req.query.inline !== "false"; // Default to inline viewing unless specified

      // Only allow specific PDF files to be served
      if (!["brbc.pdf"].includes(filename)) {
        return res.status(404).json({
          success: false,
          error: "File not found",
        });
      }

      // Create file path
      const filePath = path.join(process.cwd(), "uploads", "pdf", filename);

      // Check if file exists
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({
          success: false,
          error: "File not found",
        });
      }

      // Read the PDF file
      let pdfBuffer = fs.readFileSync(filePath);

      // Handle BRBC PDF prefilling
      if (filename === "brbc.pdf" && prefill === "buyer" && req.user) {
        // Get buyer name from the current logged-in user
        const buyerName =
          `${req.user.firstName || ""} ${req.user.lastName || ""}`.trim() ||
          req.user.email;
        const buyerId = req.user.id;

        // Fill the BRBC form with the current user's information
        try {
          // Generate a unique cache key based on the user ID to ensure each user gets their own PDF
          const cacheKey = `brbc_user_${buyerId}_${Date.now()}`;

          // Fill the BRBC form with current user's information
          pdfBuffer = await fillBrbcForm(buyerName);
          console.log(
            `Prefilled BRBC form for buyer: ${buyerName} (ID: ${buyerId})`,
          );
        } catch (error) {
          console.error("Error prefilling BRBC form:", error);
          // If prefilling fails, use the original PDF
        }
      }

      // Set headers for PDF viewing
      res.setHeader("Content-Type", "application/pdf");

      // Set appropriate content disposition
      if (inline) {
        res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
      } else {
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="${filename}"`,
        );
      }

      // Add headers for fillable PDFs
      if (fillable) {
        // Add headers to prevent caching for editable PDFs
        res.setHeader(
          "Cache-Control",
          "no-store, no-cache, must-revalidate, proxy-revalidate",
        );
        res.setHeader("Pragma", "no-cache");
        res.setHeader("Expires", "0");
        // Set custom header to indicate this is editable
        res.setHeader("X-PDF-Editable", "true");
      }

      // Send the PDF directly to the client
      res.send(pdfBuffer);
    } catch (error) {
      console.error("Error serving PDF file:", error);
      res.status(500).json({
        success: false,
        error: "Failed to serve PDF file",
      });
    }
  });

  // Configure multer for file uploads
  const multerStorage = multer.memoryStorage();
  const upload = multer({
    storage: multerStorage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: (req, file, cb) => {
      // Accept images and PDF files
      if (
        file.mimetype.startsWith("image/") ||
        file.mimetype === "application/pdf"
      ) {
        cb(null, true);
      } else {
        cb(null, false);
      }
    },
  });

  // -------- API Routes --------

  // User routes

  // Pre-qualification approval request endpoint
  // Endpoint to set manual approval requested status
  app.post(
    "/api/buyer/set-manual-approval-requested",
    isAuthenticated,
    hasRole(["buyer", "admin"]),
    async (req, res) => {
      try {
        const userId = req.user?.id;
        if (!userId) {
          return res.status(400).json({ error: "User not found" });
        }

        const { manualApprovalRequested } = req.body;

        // Update the user's manualApprovalRequested status
        await storage.updateUser(userId, {
          manualApprovalRequested: !!manualApprovalRequested,
        });

        return res.json({ success: true });
      } catch (error) {
        console.error("Error setting manual approval requested status:", error);
        return res.status(500).json({
          error: "Failed to update manual approval status",
          details: error.message,
        });
      }
    },
  );

  app.post(
    "/api/buyer/prequalification-approval",
    isAuthenticated,
    hasRole(["buyer", "admin"]),
    upload.any(),
    async (req, res) => {
      try {
        console.log("Received manual approval request");

        // Get user information
        const user = await storage.getUser(req.user!.id);

        if (!user) {
          return res.status(404).json({
            success: false,
            error: "User not found",
          });
        }

        // Ensure user has uploaded a pre-qualification document previously
        // (This is optional - we can allow manual approvals even without a document)
        const hasPrequalDocument = !!user.prequalificationDocUrl;
        const prequalDocUrl = user.prequalificationDocUrl || "";

        console.log("Form data:", req.body);
        console.log("Files:", req.files);

        // Extract form data
        const approvalFormData = {
          desiredLoanAmount: req.body.desiredLoanAmount,
          monthlyIncome: req.body.monthlyIncome,
          employmentStatus: req.body.employmentStatus,
          creditScore: req.body.creditScore,
          downPaymentAmount: req.body.downPaymentAmount,
          additionalNotes: req.body.additionalNotes,
        };

        // Process supporting documents if any
        const supportingDocs = req.files as Express.Multer.File[];
        const supportingDocsUrls: string[] = [];

        if (supportingDocs && supportingDocs.length > 0) {
          // Create directory if it doesn't exist
          await fs.promises.mkdir(
            path.join(process.cwd(), "uploads", "supporting_docs"),
            { recursive: true },
          );

          // Process each uploaded supporting document
          for (const file of supportingDocs) {
            const fileName = `supporting_${req.user!.id}_${Date.now()}_${Math.random().toString(36).substring(2, 10)}.${file.originalname.split(".").pop()}`;
            const filePath = path.join(
              process.cwd(),
              "uploads",
              "supporting_docs",
              fileName,
            );

            // Save file to disk
            await fs.promises.writeFile(filePath, file.buffer);

            // Add URL to array
            const fileUrl = `/uploads/supporting_docs/${fileName}`;
            supportingDocsUrls.push(fileUrl);
          }
        }

        // Send approval request email with form data and supporting docs
        await sendPrequalificationApprovalEmail(
          user,
          prequalDocUrl,
          approvalFormData,
          supportingDocsUrls,
        );

        res.json({
          success: true,
          message: "Pre-qualification approval request sent",
          supportingDocsCount: supportingDocsUrls.length,
        });
      } catch (error) {
        console.error("Error requesting pre-qualification approval:", error);
        res.status(500).json({
          success: false,
          error: "Failed to send pre-qualification approval request",
        });
      }
    },
  );

  // Pre-qualification document upload
  app.post(
    "/api/buyer/prequalification",
    isAuthenticated,
    hasRole(["buyer", "admin"]),
    (req, res, next) => {
      console.log("Received prequalification upload request");
      console.log("Content-Type:", req.headers["content-type"]);
      console.log("Request body:", req.body);
      console.log("Request has files?", !!req.files);
      next();
    },
    upload.single("file"),
    async (req, res) => {
      try {
        console.log("After multer middleware");
        console.log("req.file:", req.file);
        console.log("req.body:", req.body);

        if (!req.file) {
          return res.status(400).json({
            success: false,
            error: "No file uploaded",
          });
        }

        // Get the uploaded file
        const file = req.file;

        // Generate a unique filename
        const fileName = `prequalification_${req.user!.id}_${Date.now()}.${file.originalname.split(".").pop()}`;

        // Save the file to disk
        const filePath = path.join(prequalificationDir, fileName);
        fs.writeFileSync(filePath, file.buffer);

        // Update user record with prequalification info
        const fileUrl = `/uploads/prequalification/${fileName}`;

        try {
          await storage.updateUser(req.user!.id, {
            verificationMethod: "pre-qual",
            prequalificationDocUrl: fileUrl,
            prequalificationValidated: false, // Will be validated via AI in the next step
            profileStatus: "pending", // Set to pending until validated
          });
          console.log("User record updated with prequalification info");
        } catch (updateError) {
          console.error("Error updating user record:", updateError);
          // Continue the process even if the update fails
        }

        // Use OpenAI to extract information from the document for validation
        try {
          // Validate the document using AI
          const user = await storage.getUser(req.user!.id);
          if (!user) {
            throw new Error("User not found");
          }

          // Check if user has exceeded the maximum number of attempts (3)
          const currentAttempts = user.prequalificationAttempts || 0;
          if (currentAttempts >= 3) {
            return res.status(400).json({
              success: false,
              error:
                "You have exceeded the maximum number of verification attempts (3). Please contact support for assistance.",
            });
          }

          // Increment the attempts counter
          console.log(
            `Pre-qualification attempt ${currentAttempts + 1}/3 for user ID ${req.user!.id}`,
          );

          // Perform validation
          const validationResult = await validatePrequalificationDocument(
            filePath,
            {
              firstName: user.firstName,
              lastName: user.lastName,
            },
          );

          // Update user record based on validation result
          if (validationResult.validated) {
            // Check if user also has KYC verification
            const hasKYC = user.verificationMethod === "kyc";

            // Success - update user record with validation information
            await storage.updateUser(req.user!.id, {
              prequalificationValidated: true,
              profileStatus: "verified",
              // If user already has KYC verification, set method to "both"
              verificationMethod: hasKYC ? "both" : "pre-qual",
              prequalificationData: validationResult.data,
              prequalificationMessage: validationResult.message,
              prequalificationAttempts: currentAttempts + 1,
            });

            console.log(
              `User ID ${req.user!.id} verified through pre-qualification document.`,
            );
          } else {
            // Failed validation - store the failed document URL and update attempt count
            const failedUrls = user.failedPrequalificationUrls || [];
            failedUrls.push(fileUrl); // Add current failed document to history

            await storage.updateUser(req.user!.id, {
              prequalificationValidated: false,
              profileStatus: "pending",
              prequalificationData: validationResult.data,
              prequalificationMessage: validationResult.message,
              prequalificationAttempts: currentAttempts + 1,
              failedPrequalificationUrls: failedUrls,
            });

            console.log(
              `User ID ${req.user!.id} pre-qualification document failed validation: ${validationResult.message}`,
            );
          }
        } catch (validationError) {
          console.error(
            "Error validating pre-qualification document:",
            validationError,
          );
          // Don't fail the request, just leave as pending for manual review
        }

        // Return success
        const updatedUser = await storage.getUser(req.user!.id);
        res.json({
          success: true,
          data: updatedUser,
        });
      } catch (error) {
        console.error("Pre-qualification upload error:", error);
        res.status(500).json({
          success: false,
          error: "Failed to upload pre-qualification document",
        });
      }
    },
  );

  // Buyer identity verification endpoint
  app.post(
    "/api/buyer/verify-identity",
    isAuthenticated,
    hasRole(["buyer", "admin"]),
    async (req, res) => {
      try {
        // Update user's verification method
        await storage.updateUser(req.user!.id, {
          verificationMethod: "kyc",
        });

        // Create a Veriff session for the user
        const sessionData = await createVeriffSession(req.user!);

        res.json({
          success: true,
          redirectUrl: sessionData.url,
          sessionId: sessionData.sessionId,
        });
      } catch (error) {
        console.error("Verification initiation error:", error);
        res.status(500).json({
          success: false,
          error: "Failed to start verification process",
        });
      }
    },
  );

  // Look up agent license
  app.get("/api/agent/license-lookup", async (req, res) => {
    try {
      const { licenseNumber } = req.query;

      if (!licenseNumber || typeof licenseNumber !== "string") {
        return res.status(400).json({
          success: false,
          error: "License number is required",
        });
      }

      const licenseData = await lookupCaliforniaLicense(licenseNumber);

      res.json({
        success: true,
        data: licenseData,
      });
    } catch (error) {
      console.error("License lookup error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to look up license information",
      });
    }
  });

  // Veriff integration routes
  app.post("/api/veriff/create-session", isAuthenticated, async (req, res) => {
    try {
      // Make sure user exists
      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: "Unauthorized",
        });
      }

      // Create a Veriff session
      const sessionData = await createVeriffSession(req.user);

      res.json({
        success: true,
        url: sessionData.url,
        sessionId: sessionData.sessionId,
      });
    } catch (error) {
      console.error("Veriff session creation error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to create verification session",
      });
    }
  });

  // Check Veriff session status
  app.get(
    "/api/veriff/status/:sessionId",
    isAuthenticated,
    async (req, res) => {
      try {
        const { sessionId } = req.params;

        if (!sessionId) {
          return res.status(400).json({
            success: false,
            error: "Session ID is required",
          });
        }

        console.log(`Checking verification status for session: ${sessionId}`);

        try {
          const status = await checkVeriffSessionStatus(sessionId);
          console.log(`Received verification status: ${status}`);

          // If the status is approved or success, update the user's profile status
          if ((status === "approved" || status === "success") && req.user) {
            await storage.updateUser(req.user.id, {
              profileStatus: "verified",
            });

            // Log the verification
            console.log(
              `User ID ${req.user.id} automatically verified via background check.`,
            );
          }

          // Return both status and decision fields for backward compatibility
          res.json({
            success: true,
            status,
            decision: status, // Include decision field since frontend expects it
            // Add explicit boolean for UI convenience
            isVerified: status === "approved" || status === "success",
          });
        } catch (veriffError) {
          console.log("Verification not found or still in progress");

          // Return a more user-friendly response with both status and decision fields
          res.json({
            success: true,
            status: "pending",
            decision: "pending", // Include decision field since frontend expects it
            isVerified: false,
            message: "Verification is still in progress or not yet started",
          });
        }
      } catch (error) {
        console.error("Veriff status check error:", error);
        res.status(500).json({
          success: false,
          error: "Failed to check verification status",
        });
      }
    },
  );

  // Webhook for Veriff callbacks
  app.post("/api/veriff/webhook", async (req, res) => {
    try {
      // Validate webhook authenticity if needed

      const webhookData = req.body;

      // Process the webhook data
      await processVeriffWebhook(webhookData);

      res.status(200).send("Webhook received");
    } catch (error) {
      console.error("Veriff webhook processing error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to process webhook",
      });
    }
  });

  app.put("/api/users/kyc", isAuthenticated, async (req, res) => {
    try {
      const data = kycUpdateSchema.parse(req.body);
      const updatedUser = await storage.updateUser(req.user.id, {
        ...data,
        profileStatus: "pending", // Set status to pending for manual/AI review
      });

      // If ID documents are provided, verify with AI
      if (data.idFrontUrl && data.idBackUrl) {
        try {
          // First, try to extract data from the ID documents
          let idFrontBase64 = "";
          let idBackBase64 = "";

          try {
            // Convert the image URLs to base64 for AI processing
            // In a real implementation, we would fetch these from storage
            // For now we'll use a mock implementation
            const fetchImage = async (url: string): Promise<string> => {
              // Remove the URL part and just use the data if it's already a data URL
              if (url.startsWith("data:")) {
                return url.split(",")[1];
              }

              // In a real app we'd fetch the image from URL
              // For now return empty string as mock
              return "";
            };

            idFrontBase64 = await fetchImage(data.idFrontUrl);
            idBackBase64 = await fetchImage(data.idBackUrl);

            // Extract ID data if we have base64 content
            if (idFrontBase64 && idBackBase64) {
              const idData = await extractIDData(idFrontBase64, idBackBase64);

              // Save extracted ID data to user profile
              if (idData && Object.keys(idData).length > 0) {
                await storage.updateUser(req.user.id, {
                  firstName: idData.firstName || req.user.firstName,
                  lastName: idData.lastName || req.user.lastName,
                  dateOfBirth: idData.dateOfBirth
                    ? new Date(idData.dateOfBirth)
                    : req.user.dateOfBirth,
                  addressLine1: idData.addressLine1 || req.user.addressLine1,
                  addressLine2: idData.addressLine2 || req.user.addressLine2,
                  city: idData.city || req.user.city,
                  state: idData.state || req.user.state,
                  zip: idData.zip || req.user.zip,
                });

                console.log(
                  "Updated user profile with extracted ID data:",
                  idData,
                );
              }
            }
          } catch (extractError) {
            console.error(
              "Error extracting data from ID documents:",
              extractError,
            );
            // Continue with verification even if extraction fails
          }

          // Now verify the ID documents
          const verificationResult = await verifyKYCDocuments(
            req.user.id,
            data.idFrontUrl,
            data.idBackUrl,
            {
              firstName: data.firstName,
              lastName: data.lastName,
              dateOfBirth: data.dateOfBirth,
              addressLine1: data.addressLine1,
            },
          );

          if (verificationResult.verified) {
            // Update user status to verified
            await storage.updateUser(req.user.id, {
              profileStatus: "verified",
            });

            // If this is an agent, create leads for existing properties
            if (req.user.role === "agent") {
              try {
                // Create leads for this agent for appropriate properties
                const properties = await storage.getAllProperties();
                const agent = await storage.getUser(req.user.id);

                if (agent && properties.length > 0) {
                  console.log(
                    `Creating leads for newly verified agent ${agent.id} (${agent.email})`,
                  );

                  // Find properties in the same state as the agent
                  const matchingProperties = properties.filter(
                    (property) =>
                      // Match by state if available
                      agent.state &&
                      property.state &&
                      agent.state.toLowerCase() ===
                        property.state.toLowerCase(),
                  );

                  // Use properties from same state, or fall back to first 3 if none match
                  const propertiesToMatch =
                    matchingProperties.length > 0
                      ? matchingProperties.slice(0, 3)
                      : properties.slice(0, 3);

                  // Create leads
                  for (const property of propertiesToMatch) {
                    await storage.createAgentLead({
                      propertyId: property.id,
                      agentId: agent.id,
                      status: "available",
                    });
                    console.log(
                      `Created lead for agent ${agent.id} on property ${property.id}`,
                    );

                    // Send WebSocket notification
                    if (websocketServer) {
                      websocketServer.broadcastToUsers([agent.id], {
                        type: "notification",
                        data: {
                          message:
                            "New lead available! A property matches your location.",
                          propertyId: property.id,
                        },
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

      const redirectUrl =
        req.user &&
        req.user.role === "agent" &&
        updatedUser.profileStatus === "verified"
          ? "/agent/referral-agreement"
          : null;

      res.json({
        success: true,
        data: updatedUser,
        redirectUrl: redirectUrl,
      });
    } catch (error) {
      console.error("KYC update error:", error);
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : "Invalid data",
      });
    }
  });

  // Helper function to standardize license numbers from various formats
  function cleanLicenseNumber(
    licenseNo: string | null | undefined,
  ): string | null | undefined {
    if (!licenseNo) return licenseNo;

    // Look for patterns with colon that typically separate descriptive text from license numbers
    // Examples: "CALBRE: 01234567", "License: 01234567", "DRE: 01234567"
    const colonMatch = licenseNo.match(/(?::|#)\s*([A-Z0-9][\w.-]{4,})\b/i);
    if (colonMatch && colonMatch[1]) {
      return colonMatch[1];
    }

    // First, remove any prefix like "DRE", "DRE #", "CalDRE", etc.
    const prefixesPattern =
      /^(?:DRE\s*#?|CalDRE\s*#?|Lic\.\s*|License\s*#?|BRE\s*#?|CA\s*#?|CalBRE\s*#?|#)\s*/i;
    let cleaned = licenseNo.replace(prefixesPattern, "").trim();

    // Look for State format with letter and period (e.g., S.0123456 for Nevada)
    const stateFormatInText = licenseNo.match(/\b([A-Z]\.\d{5,})\b/i);
    if (stateFormatInText && stateFormatInText[1]) {
      return stateFormatInText[1].replace(".", "");
    }

    // Handle format where license number might be wrapped in parentheses
    // e.g., "John Doe (License #01234567)" or "Jane Smith (S.0123456)"
    const parenthesesMatch = cleaned.match(
      /\((?:[^\)]*?)(?:(?:([A-Z])\.(\d{5,}))|(?:(?:[^\d]*)(\d{5,})))(?:[^\d]*?)\)?/i,
    );
    if (parenthesesMatch) {
      // Check for state code format (S.0123456)
      if (parenthesesMatch[1] && parenthesesMatch[2]) {
        return parenthesesMatch[1] + parenthesesMatch[2]; // Combine letter and number
      }
      // Standard numeric format
      else if (parenthesesMatch[3]) {
        return parenthesesMatch[3];
      }
    }

    // If there's a comma followed by a pattern that looks like a license number, extract it
    // e.g., "John Doe, #01234567"
    const commaMatch = cleaned.match(/,\s*(?:#?\s*)([A-Z]?[\d]{5,})\b/i);
    if (commaMatch && commaMatch[1]) {
      return commaMatch[1];
    }

    // Plain license number without any text
    // Avoid matching when there's extra non-numeric text
    const justNumber = /^\s*#?\s*(\d{5,}(?:-\w+)?)\s*(?:\(Active\))?$/i;
    const numberMatch = cleaned.match(justNumber);
    if (numberMatch && numberMatch[1]) {
      return numberMatch[1];
    }

    // Last resort for complex cases - find the first number sequence that could be a license
    const anyNumberMatch = licenseNo.match(/\b([A-Z]?\d{5,}(?:-\w+)?)\b/i);
    if (anyNumberMatch && anyNumberMatch[1]) {
      return anyNumberMatch[1];
    }

    // If no good pattern match, just remove non-alphanumeric chars (defensive fallback)
    cleaned = cleaned.replace(/[^A-Z0-9.-]/gi, "");

    // If the cleaned result is too long (likely it contains other text),
    // find something that looks like a license number in it
    if (cleaned.length > 10) {
      const candidateMatch = cleaned.match(/([A-Z]?\d{5,}(?:-\w+)?)/i);
      if (candidateMatch && candidateMatch[1]) {
        return candidateMatch[1];
      }
    }

    return cleaned;
  }

  // Property routes
  app.post(
    "/api/properties",
    isAuthenticated,
    hasRole(["buyer", "admin"]),
    async (req, res) => {
      try {
        // Clean up license numbers before validation
        if (req.body.sellerLicenseNo) {
          req.body.sellerLicenseNo = cleanLicenseNumber(
            req.body.sellerLicenseNo,
          );
        }
        if (req.body.listingAgentLicenseNo) {
          req.body.listingAgentLicenseNo = cleanLicenseNumber(
            req.body.listingAgentLicenseNo,
          );
        }

        // Convert numeric fields to numbers if they're strings
        ["price", "bedrooms", "bathrooms", "squareFeet", "yearBuilt"].forEach(
          (field) => {
            if (typeof req.body[field] === "string" && req.body[field]) {
              req.body[field] = Number(req.body[field]);
            }
          },
        );

        const propertyData = propertySchema.parse({
          ...req.body,
          createdBy: req.user.id,
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
                role: req.user!.role,
              },
            },
          });
        } catch (logError) {
          console.error(
            "Failed to create activity log for property creation, but property was created:",
            logError,
          );
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
              profileStatus: "verified", // Sellers don't need KYC
            });

            // In a real app, we'd send an email with login instructions
            console.log(
              `Seller account created: ${property.sellerEmail} with standard password: ${defaultSellerPassword}`,
            );
          }

          // Associate property with seller
          await storage.updateProperty(property.id, {
            sellerId: seller.id,
          });
        }

        // Find and notify potential agents
        try {
          const agents = await findAgentsForProperty(property);
          console.log(
            `Found ${agents.length} matching agents for property ${property.id}`,
          );

          // Create leads for top 3 agents only
          const topAgents = agents.slice(0, 3);

          // Auto-assign the first agent if available
          if (topAgents.length > 0) {
            const assignedAgent = topAgents[0];

            // Update property with assigned agent
            await storage.updateProperty(property.id, {
              agentId: assignedAgent.id,
            });

            // Log agent assignment
            await storage.createPropertyActivityLog({
              propertyId: property.id,
              userId: assignedAgent.id,
              activity: "Agent automatically assigned",
              details: {
                agentId: assignedAgent.id,
                agentEmail: assignedAgent.email,
              },
            });

            console.log(
              `Automatically assigned agent ${assignedAgent.id} to property ${property.id}`,
            );

            // Notify the buyer about the assigned agent
            if (websocketServer) {
              websocketServer.broadcastToUsers([req.user!.id], {
                type: "notification",
                data: {
                  message: `An agent has been automatically assigned to your property at ${property.address}.`,
                  propertyId: property.id,
                },
              });
            }

            // Notify the assigned agent
            if (websocketServer) {
              websocketServer.broadcastToUsers([assignedAgent.id], {
                type: "notification",
                data: {
                  message:
                    "You have been automatically assigned to a new property that matches your expertise.",
                  propertyId: property.id,
                },
              });
            }

            // Create leads for the other top agents as backup
            for (const agent of topAgents) {
              // Set status as "claimed" for the assigned agent, "available" for others
              const status =
                agent.id === assignedAgent.id ? "claimed" : "available";

              const lead = await storage.createAgentLead({
                propertyId: property.id,
                agentId: agent.id,
                status: status,
              });
              console.log(
                `Created lead ${lead.id} for agent ${agent.id} on property ${property.id} with status ${status}`,
              );

              // Send notification about available leads (except to the already assigned agent)
              if (agent.id !== assignedAgent.id && websocketServer) {
                websocketServer.broadcastToUsers([agent.id], {
                  type: "notification",
                  data: {
                    message:
                      "New lead available! A buyer has added a property that matches your expertise.",
                    propertyId: property.id,
                    leadId: lead.id,
                  },
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
          data: property,
        });
      } catch (error) {
        console.error("Property creation error:", error);
        res.status(400).json({
          success: false,
          error: error instanceof Error ? error.message : "Invalid data",
        });
      }
    },
  );

  // Get properties for a buyer
  app.get(
    "/api/properties/by-buyer",
    isAuthenticated,
    hasRole(["buyer", "admin"]),
    async (req, res) => {
      try {
        console.log(`[DEBUG] Getting properties for buyer ID: ${req.user.id}`);
        const properties = await storage.getPropertiesByBuyer(req.user.id);
        console.log(`[DEBUG] Found ${properties.length} properties for buyer ${req.user.id}`);
        res.json(properties);
      } catch (error) {
        console.error("Get buyer properties error:", error);
        res.status(500).json({
          success: false,
          error: "Failed to fetch properties",
        });
      }
    },
  );

  // Get properties for a seller
  app.get(
    "/api/properties/by-seller",
    isAuthenticated,
    hasRole(["seller"]),
    async (req, res) => {
      try {
        const properties = await storage.getPropertiesBySeller(req.user.id);
        res.json(properties);
      } catch (error) {
        console.error("Get seller properties error:", error);
        res.status(500).json({
          success: false,
          error: "Failed to fetch properties",
        });
      }
    },
  );

  // Get properties for an agent
  app.get(
    "/api/properties/by-agent",
    isAuthenticated,
    hasRole(["agent"]),
    async (req, res) => {
      try {
        const properties = await storage.getPropertiesByAgent(req.user.id);
        res.json(properties);
      } catch (error) {
        console.error("Get agent properties error:", error);
        res.status(500).json({
          success: false,
          error: "Failed to fetch properties",
        });
      }
    },
  );

  // Get property by ID with participants
  app.get("/api/properties/:id", isAuthenticated, async (req, res) => {
    try {
      const propertyId = parseInt(req.params.id);
      const property = await storage.getPropertyWithParticipants(propertyId);

      if (!property) {
        return res.status(404).json({
          success: false,
          error: "Property not found",
        });
      }

      // Check if user has access to this property
      const userId = req.user.id;
      const role = req.user.role;

      const hasAccess =
        role === "admin" ||
        (role === "buyer" && property.createdBy === userId) ||
        (role === "seller" && property.sellerId === userId) ||
        (role === "agent" && property.agentId === userId);

      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          error: "You don't have access to this property",
        });
      }

      res.json(property);
    } catch (error) {
      console.error("Get property error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch property",
      });
    }
  });

  // Test route for creating and replacing a form field
  app.get("/api/test-form-field-replacement", async (req, res) => {
    try {
      // First, create a simple document with a text field named "1"
      const originalPdf = await createSimpleReplacementDocument(
        'This is a test document with a form field named "1"',
        "Form Field Test",
      );

      // Now try to replace the field "1" with "uma"
      let modifiedPdf;
      try {
        modifiedPdf = await replacePlaceholderInPdf(originalPdf, "1", "uma");
        console.log("Successfully modified the PDF with the replacement");
      } catch (error) {
        console.error("Error replacing placeholder:", error);
        return res
          .status(500)
          .json({ success: false, error: "Failed to replace field in PDF" });
      }

      // Set appropriate headers for PDF download
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        'attachment; filename="test_form_field_replaced.pdf"',
      );

      // Send the modified PDF buffer
      res.send(modifiedPdf);
    } catch (error) {
      console.error("Error in form field replacement test:", error);
      res.status(500).json({ success: false, error: "Test failed" });
    }
  });

  // Save edited PDF content to the database
  app.post(
    "/api/properties/:id/save-edited-pdf",
    isAuthenticated,
    async (req, res) => {
      try {
        console.log("Received request to save edited PDF content");
        const propertyId = parseInt(req.params.id);
        const { pdfContent, viewingRequestId } = req.body;

        console.log(
          `Save PDF request - Property ID: ${propertyId}, PDF content length: ${pdfContent ? pdfContent.length : 0}, Viewing Request ID: ${viewingRequestId || "none"}`,
        );

        if (!propertyId || !pdfContent) {
          console.log("Missing required parameters");
          return res.status(400).json({
            success: false,
            error: "Property ID and PDF content are required",
          });
        }

        const property = await storage.getProperty(propertyId);

        if (!property) {
          console.log(`Property ${propertyId} not found`);
          return res.status(404).json({
            success: false,
            error: "Property not found",
          });
        }

        // Check if user has permission to access the property
        const userId = req.user!.id;
        const userRole = req.user!.role;

        const hasAccess =
          userRole === "admin" ||
          (userRole === "buyer" && property.createdBy === userId) ||
          (userRole === "agent" && property.agentId === userId) ||
          (userRole === "seller" && property.sellerId === userId);

        if (!hasAccess) {
          return res.status(403).json({
            success: false,
            error:
              "You don't have permission to edit agreements for this property",
          });
        }

        // Get or create an agreement to store the edited PDF content
        const existingAgreements =
          await storage.getAgreementsByProperty(propertyId);
        const agencyDisclosureAgreements = existingAgreements.filter(
          (a) => a.type === "agency_disclosure",
        );

        let agreement;

        if (agencyDisclosureAgreements.length > 0) {
          // Update the most recent agreement
          const mostRecentAgreement =
            agencyDisclosureAgreements[agencyDisclosureAgreements.length - 1];
          agreement = await storage.updateAgreement(mostRecentAgreement.id, {
            editedPdfContent: pdfContent,
          });
          console.log(
            `Updated existing agreement ${mostRecentAgreement.id} with edited PDF content`,
          );
        } else {
          // Create a new agreement if none exists
          let agentId = property.agentId;

          // If no agent ID is set, try to get one from the viewing request or use default
          if (!agentId && viewingRequestId) {
            const viewingRequest = await storage.getViewingRequest(
              parseInt(viewingRequestId),
            );
            if (viewingRequest && viewingRequest.buyerAgentId) {
              agentId = viewingRequest.buyerAgentId;
            }
          }

          // If still no agent ID, get the first available agent
          if (!agentId) {
            const agents = await storage.getUsersByRole("agent");
            if (agents.length > 0) {
              agentId = agents[0].id;
            } else {
              // Use a system agent (admin) if no agents found
              const admin = await storage.getUserByEmail(
                "admin@realestateapp.com",
              );
              if (!admin) {
                return res
                  .status(500)
                  .json({ error: "No agent or admin found in the system" });
              }
              agentId = admin.id;
            }
          }

          agreement = await storage.createAgreement({
            propertyId,
            type: "agency_disclosure",
            agreementText: `California Agency Disclosure Form for property ${property.address}`,
            buyerId: userId, // Use the current user as buyer for now
            agentId: agentId,
            editedPdfContent: pdfContent,
            date: new Date(),
            status: "pending",
          });
          console.log(
            `Created new agreement ${agreement.id} with edited PDF content`,
          );
        }

        res.json({
          success: true,
          data: agreement,
        });
      } catch (error) {
        console.error("Error saving edited PDF content:", error);
        res.status(500).json({
          success: false,
          error: "Failed to save edited PDF content",
        });
      }
    },
  );

  // Get all agreements for a property
  app.get(
    "/api/properties/:id/agreements",
    isAuthenticated,
    async (req, res) => {
      try {
        const propertyId = parseInt(req.params.id);
        const property = await storage.getProperty(propertyId);

        if (!property) {
          return res.status(404).json({
            success: false,
            error: "Property not found",
          });
        }

        // Check if user has permission to access the property
        const userId = req.user.id;
        const userRole = req.user.role;

        const hasAccess =
          userRole === "admin" ||
          (userRole === "buyer" && property.createdBy === userId) ||
          (userRole === "agent" && property.agentId === userId) ||
          (userRole === "seller" && property.sellerId === userId);

        if (!hasAccess) {
          return res.status(403).json({
            success: false,
            error:
              "You don't have permission to access agreements for this property",
          });
        }

        const agreements = await storage.getAgreementsByProperty(propertyId);

        res.json({
          success: true,
          data: agreements,
        });
      } catch (error) {
        console.error("Error fetching property agreements:", error);
        res.status(500).json({
          success: false,
          error: "Failed to get property agreements",
        });
      }
    },
  );

  // Delete a property
  app.delete("/api/properties/:id", isAuthenticated, async (req, res) => {
    try {
      const propertyId = parseInt(req.params.id);
      const property = await storage.getProperty(propertyId);

      if (!property) {
        return res.status(404).json({
          success: false,
          error: "Property not found",
        });
      }

      // Check if user has permission to delete this property
      const userId = req.user.id;
      const role = req.user.role;

      // Only the buyer who created the property or an admin can delete it
      const hasPermission =
        role === "admin" || (role === "buyer" && property.createdBy === userId);

      if (!hasPermission) {
        return res.status(403).json({
          success: false,
          error: "You don't have permission to delete this property",
        });
      }

      // Check if an agent has already accepted this property's lead
      // If property.agentId exists, it means an agent has accepted the lead
      if (role === "buyer" && property.agentId) {
        return res.status(403).json({
          success: false,
          error: "Cannot delete property after an agent has accepted the lead",
        });
      }

      // Delete the property
      await storage.deleteProperty(propertyId);

      res.json({
        success: true,
        message: "Property deleted successfully",
      });
    } catch (error) {
      console.error("Delete property error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to delete property",
      });
    }
  });

  // Send email to seller and update emailSent flag
  app.post(
    "/api/properties/:id/send-email",
    isAuthenticated,
    async (req, res) => {
      try {
        const propertyId = parseInt(req.params.id);
        const property = await storage.getProperty(propertyId);

        if (!property) {
          return res.status(404).json({
            success: false,
            error: "Property not found",
          });
        }

        // Check user permissions
        const userId = req.user?.id;
        const userRole = req.user?.role;

        if (!userId || !userRole) {
          return res.status(401).json({
            success: false,
            error: "Unauthorized",
          });
        }

        const hasAccess =
          userRole === "admin" ||
          (userRole === "buyer" && property.createdBy === userId) ||
          (userRole === "agent" && property.agentId === userId);

        if (!hasAccess) {
          return res.status(403).json({
            success: false,
            error:
              "You don't have permission to send an email for this property",
          });
        }

        if (!property.sellerEmail) {
          return res.status(400).json({
            success: false,
            error: "No seller email address available",
          });
        }

        // In a real application, this would send an actual email
        // For now, we'll just mark it as sent
        console.log(
          `[Email Service] Sending email to seller ${property.sellerEmail} about property ${propertyId}`,
        );

        // Update property to mark email as sent
        const updatedProperty = await storage.updateProperty(propertyId, {
          emailSent: true,
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
                role: userRole,
              },
            },
          });
        } catch (logError) {
          console.error(
            "Failed to create activity log, but email was marked as sent:",
            logError,
          );
          // Continue without failing the whole request
        }

        // Send WebSocket notification to all users with access to this property
        const notifyUserIds = [property.createdBy];
        if (property.agentId) notifyUserIds.push(property.agentId);
        if (property.sellerId) notifyUserIds.push(property.sellerId);

        websocketServer.broadcastToUsers(notifyUserIds, {
          type: "property_update",
          data: {
            propertyId,
            action: "email_sent",
            message: "Email has been sent to the seller",
          },
        });

        res.json({
          success: true,
          data: updatedProperty,
        });
      } catch (error) {
        console.error("Send email error:", error);
        res.status(500).json({
          success: false,
          error: "Failed to send email to seller",
        });
      }
    },
  );

  // Add/update seller email
  app.post(
    "/api/properties/:id/seller-email",
    isAuthenticated,
    hasRole(["agent"]),
    async (req, res) => {
      try {
        const propertyId = parseInt(req.params.id);
        const { email } = req.body;

        if (
          !email ||
          typeof email !== "string" ||
          !z.string().email().safeParse(email).success
        ) {
          return res.status(400).json({
            success: false,
            error: "Valid email is required",
          });
        }

        const property = await storage.getProperty(propertyId);

        if (!property) {
          return res.status(404).json({
            success: false,
            error: "Property not found",
          });
        }

        if (property.agentId !== req.user.id) {
          return res.status(403).json({
            success: false,
            error: "You are not assigned to this property",
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
            profileStatus: "verified", // Sellers don't need KYC
          });

          // In a real app, we'd send an email with login instructions
          console.log(
            `Seller account created: ${email} with standard password: ${defaultSellerPassword}`,
          );
        }

        // Update property with seller email and ID
        const updatedProperty = await storage.updateProperty(propertyId, {
          sellerEmail: email,
          sellerId: seller.id,
        });

        res.json({
          success: true,
          data: updatedProperty,
        });
      } catch (error) {
        console.error("Update seller email error:", error);
        res.status(500).json({
          success: false,
          error: "Failed to update seller email",
        });
      }
    },
  );

  // Get all available agents for buyers to choose from
  app.get("/api/agents", isAuthenticated, async (req, res) => {
    try {
      // Get verified, unblocked agents
      const allAgents = await storage.getUsersByRole("agent");
      const verifiedAgents = allAgents.filter(
        (agent) => agent.profileStatus === "verified" && !agent.isBlocked,
      );

      // Return minimal info for security
      const agents = verifiedAgents.map((agent) => ({
        id: agent.id,
        firstName: agent.firstName,
        lastName: agent.lastName,
        state: agent.state,
        city: agent.city,
        profileStatus: agent.profileStatus,
      }));

      res.json(agents);
    } catch (error) {
      console.error("Get all agents error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch agents",
      });
    }
  });

  // Agent leads routes
  app.get(
    "/api/leads/available",
    isAuthenticated,
    hasRole(["agent"]),
    async (req, res) => {
      try {
        console.log(`Getting available leads for agent ID: ${req.user.id}`);
        const leads = await storage.getAvailableLeadsByAgent(req.user.id);
        console.log(`Found ${leads.length} available leads`);
        res.json(leads);
      } catch (error) {
        console.error("Get available leads error:", error);
        res.status(500).json({
          success: false,
          error: "Failed to fetch available leads",
        });
      }
    },
  );

  app.post(
    "/api/leads/:id/claim",
    isAuthenticated,
    hasRole(["agent"]),
    async (req, res) => {
      try {
        const leadId = parseInt(req.params.id);
        const lead = await storage.getAgentLead(leadId);

        if (!lead) {
          return res.status(404).json({
            success: false,
            error: "Lead not found",
          });
        }

        if (lead.status !== "available") {
          return res.status(400).json({
            success: false,
            error: "This lead is no longer available",
          });
        }

        if (lead.agentId !== req.user.id) {
          return res.status(403).json({
            success: false,
            error: "This lead is not available to you",
          });
        }

        // Update lead status
        const updatedLead = await storage.updateAgentLead(leadId, {
          status: "claimed",
        });

        // Assign agent to property
        await storage.updateProperty(lead.propertyId, {
          agentId: req.user.id,
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
              agentEmail: req.user!.email,
            },
          });
        } catch (logError) {
          console.error(
            "Failed to create activity log for agent claiming lead, but lead was claimed:",
            logError,
          );
          // Continue without failing the whole request
        }

        res.json({
          success: true,
          data: updatedLead,
        });
      } catch (error) {
        console.error("Claim lead error:", error);
        res.status(500).json({
          success: false,
          error: "Failed to claim lead",
        });
      }
    },
  );

  // File upload for KYC
  app.post(
    "/api/uploads/id-documents",
    isAuthenticated,
    upload.fields([
      { name: "idFront", maxCount: 1 },
      { name: "idBack", maxCount: 1 },
    ]),
    async (req, res) => {
      try {
        // In a real app, these files would be uploaded to a secure storage service
        // For this example, we'll just pretend we've stored them and return URLs

        const files = req.files as {
          [fieldname: string]: Express.Multer.File[];
        };

        if (!files.idFront || !files.idBack) {
          return res.status(400).json({
            success: false,
            error: "Both front and back ID images are required",
          });
        }

        // Generate fake URLs - in a real app these would be actual URLs to the stored files
        const idFrontUrl = `https://storage.example.com/user-${req.user.id}/id-front-${Date.now()}.jpg`;
        const idBackUrl = `https://storage.example.com/user-${req.user.id}/id-back-${Date.now()}.jpg`;

        res.json({
          idFrontUrl,
          idBackUrl,
        });
      } catch (error) {
        console.error("ID document upload error:", error);
        res.status(500).json({
          success: false,
          error: "Failed to upload ID documents",
        });
      }
    },
  );

  // File upload for profile photo
  app.post(
    "/api/uploads/profile-photo",
    upload.single("profilePhoto"),
    async (req, res) => {
      try {
        // In a real app, this file would be uploaded to a secure storage service
        // For this example, we'll just pretend we've stored it and return a URL

        const file = req.file;

        if (!file) {
          return res.status(400).json({
            success: false,
            error: "Profile photo is required",
          });
        }

        // Generate fake URL - in a real app this would be an actual URL to the stored file
        // We include a timestamp to make it unique and prevent caching issues
        const profilePhotoUrl = `https://storage.example.com/user-profiles/profile-${Date.now()}.jpg`;

        res.json({
          success: true,
          profilePhotoUrl,
        });
      } catch (error) {
        console.error("Profile photo upload error:", error);
        res.status(500).json({
          success: false,
          error: "Failed to upload profile photo",
        });
      }
    },
  );

  // AI routes section

  // AI routes
  app.post(
    "/api/ai/extract-property",
    isAuthenticated,
    hasRole(["buyer", "admin"]),
    async (req, res) => {
      try {
        console.log(`[PROPERTY_EXTRACTION] Request from user: ${req.user?.email} (${req.user?.role})`);
        
        const { address } = req.body;

        if (!address || typeof address !== "string") {
          return res.status(400).json({
            success: false,
            error: "Property address is required",
          });
        }

        console.log(`[PROPERTY_EXTRACTION] Processing address: ${address}`);
        
        const propertyData = await extractPropertyData(address);

        console.log(`[PROPERTY_EXTRACTION] Successfully extracted property data`);
        res.json(propertyData);
      } catch (error) {
        console.error("Property data extraction error:", error);
        res.status(500).json({
          success: false,
          error:
            error instanceof Error
              ? error.message
              : "Failed to extract property data",
        });
      }
    },
  );

  // Extract property details from a URL using web search (non-scraping approach)
  app.post(
    "/api/ai/extract-property-from-url",
    isAuthenticated,
    hasRole(["buyer", "agent", "admin"]),
    async (req, res) => {
      try {
        console.log(`[URL_SCRAPING] Request from user: ${req.user?.email} (${req.user?.role})`);
        
        const { url } = req.body;

        if (!url || typeof url !== "string") {
          return res.status(400).json({
            success: false,
            error: "Property URL is required",
          });
        }

        console.log(`[URL_SCRAPING] Processing URL: ${url}`);
        
        // Use enhanced extraction flow with SerpAPI integration
        // First tries to get a Realtor.com URL via SerpAPI, then scrapes that URL
        // This approach bypasses blocking mechanisms on sites like Zillow
        const propertyData = await extractPropertyFromUrl(url);

        // Add timestamp and source information
        const resultWithMeta = {
          ...propertyData,
          _extractionTimestamp: new Date().toISOString(),
          _extractionSource: url,
        };

        console.log(`[URL_SCRAPING] Successfully extracted property data`);
        res.json(resultWithMeta);
      } catch (error) {
        console.error("Property URL extraction error:", error);
        res.status(500).json({
          success: false,
          error:
            error instanceof Error
              ? error.message
              : "Failed to extract property data from URL",
        });
      }
    },
  );

  // Test endpoint for extracting property details from different real estate sites
  app.post("/api/test/extract-property-from-url", async (req, res) => {
    try {
      const { url } = req.body;
      const timeoutSeconds = req.body.timeout || 45; // Default 45 second timeout

      if (!url || typeof url !== "string") {
        return res.status(400).json({
          success: false,
          error: "Property URL is required",
        });
      }

      console.log(
        `Test endpoint: Extracting property from URL: ${url} (timeout: ${timeoutSeconds}s)`,
      );

      // Create a timeout promise to prevent hanging extraction attempts
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
          reject(
            new Error(
              `Property extraction timed out after ${timeoutSeconds} seconds`,
            ),
          );
        }, timeoutSeconds * 1000);
      });

      // Race between the actual extraction and the timeout
      // Race between the enhanced extraction (with SerpAPI) and the timeout
      const propertyData = await Promise.race([
        extractPropertyFromUrl(url),
        timeoutPromise,
      ]);

      // Add extraction metadata to the result data
      const resultWithSource = {
        ...propertyData,
        _extractionSource: url,
        _extractionTimestamp: new Date().toISOString(),
        _extractionMethod: propertyData._realtorUrl
          ? "serpapi+direct"
          : "direct",
      };

      res.json(resultWithSource);
    } catch (error) {
      console.error("Property URL extraction error:", error);

      // Determine specific error type for better client-side handling
      let errorType = "EXTRACTION_ERROR";
      let statusCode = 500;

      if (error instanceof Error) {
        if (error.message.includes("timed out")) {
          errorType = "TIMEOUT_ERROR";
          statusCode = 408; // Request Timeout
        } else if (
          error.message.includes("CAPTCHA") ||
          error.message.includes("detected as a bot")
        ) {
          errorType = "CAPTCHA_ERROR";
          statusCode = 403; // Forbidden
        } else if (
          error.message.includes("Invalid URL") ||
          error.message.includes("URL is required")
        ) {
          errorType = "INVALID_URL_ERROR";
          statusCode = 400; // Bad Request
        }
      }

      res.status(statusCode).json({
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to extract property data from URL",
        errorType: errorType,
      });
    }
  });

  // Email outbox routes
  app.get(
    "/api/emails",
    isAuthenticated,
    hasRole(["admin", "agent"]),
    async (req, res) => {
      try {
        const emails = await getAllEmails();
        res.json({
          success: true,
          data: emails,
        });
      } catch (error) {
        console.error("Error fetching emails:", error);
        res.status(500).json({
          success: false,
          error: "Failed to fetch emails",
        });
      }
    },
  );

  // Get emails by role (for admin to filter emails by user role)
  app.get(
    "/api/emails/role/:role",
    isAuthenticated,
    hasRole(["admin"]), // Admin only route
    async (req, res) => {
      try {
        const role = req.params.role;

        // Validate role parameter
        if (!["buyer", "agent", "admin", "seller"].includes(role)) {
          return res.status(400).json({
            success: false,
            error: "Invalid role specified",
          });
        }

        // Use storage method to get emails by sender role
        const emails = await storage.getEmailsByRole(role);

        res.json({
          success: true,
          data: emails,
        });
      } catch (error) {
        console.error("Error fetching emails by role:", error);
        res.status(500).json({
          success: false,
          error: "Failed to fetch role-specific emails",
        });
      }
    },
  );

  app.get("/api/emails/user/:userId", isAuthenticated, async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);

      // Only allow users to access their own emails unless they're an admin
      if (req.user?.id !== userId && req.user?.role !== "admin") {
        return res.status(403).json({
          success: false,
          error: "Unauthorized access to user emails",
        });
      }

      const emails = await getSentEmailsForUser(userId);
      res.json({
        success: true,
        data: emails,
      });
    } catch (error) {
      console.error("Error fetching user emails:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch user emails",
      });
    }
  });

  app.get("/api/emails/entity/:type/:id", isAuthenticated, async (req, res) => {
    try {
      const { type, id } = req.params;
      const entityId = parseInt(id);

      // Validate entity type
      if (!["viewing_request", "property", "agreement"].includes(type)) {
        return res.status(400).json({
          success: false,
          error: "Invalid entity type",
        });
      }

      const emails = await getSentEmailsForEntity(
        type as "viewing_request" | "property" | "agreement",
        entityId,
      );

      res.json({
        success: true,
        data: emails,
      });
    } catch (error) {
      console.error("Error fetching entity emails:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch entity emails",
      });
    }
  });

  // Web-based test endpoint for property extraction
  app.get("/api/test/property-extractor", (req, res) => {
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Property Extraction Tester</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; padding: 20px; max-width: 1000px; margin: 0 auto; }
          h1 { color: #2c3e50; }
          .form-group { margin-bottom: 15px; }
          label { display: block; margin-bottom: 5px; font-weight: bold; }
          input[type="url"] { width: 100%; padding: 8px; font-size: 16px; }
          input[type="number"] { width: 80px; padding: 8px; font-size: 16px; }
          button { background: #3498db; color: white; border: none; padding: 10px 15px; cursor: pointer; font-size: 16px; }
          button:hover { background: #2980b9; }
          #results { margin-top: 20px; border: 1px solid #ddd; padding: 15px; border-radius: 5px; }
          .property-data { margin-top: 15px; }
          .property-section { margin-bottom: 15px; }
          .property-section h3 { margin-bottom: 5px; color: #2c3e50; }
          .property-field { margin-bottom: 5px; }
          .property-field strong { margin-right: 10px; min-width: 120px; display: inline-block; }
          .tab-container { display: flex; margin-top: 20px; border-bottom: 1px solid #ddd; }
          .tab { padding: 10px 15px; cursor: pointer; background: #f5f5f5; }
          .tab.active { background: #fff; border: 1px solid #ddd; border-bottom: none; }
          .sites-container { display: flex; flex-wrap: wrap; margin-top: 20px; }
          .site-card { border: 1px solid #ddd; padding: 10px; margin: 5px; cursor: pointer; width: 200px; text-align: center; }
          .site-card:hover { background: #f5f5f5; }
          .error-card { border-left: 4px solid #e74c3c; padding: 10px; margin-top: 10px; background: #fcf0f0; }
          .success-card { border-left: 4px solid #2ecc71; padding: 10px; margin-top: 10px; background: #f0fcf5; }
          .flex-row { display: flex; align-items: center; }
          .flex-row label { margin-right: 10px; margin-bottom: 0; }
        </style>
      </head>
      <body>
        <h1>Property Extraction Tester</h1>
        
        <div class="tab-container">
          <div class="tab active" onclick="switchTab('url-tab')">Test by URL</div>
          <div class="tab" onclick="switchTab('sites-tab')">Sample Real Estate Sites</div>
        </div>
        
        <div id="url-tab" class="tab-content">
          <div class="form-group">
            <label for="urlInput">Enter Property URL:</label>
            <input type="url" id="urlInput" placeholder="https://www.zillow.com/homedetails/..." required>
          </div>
          
          <div class="form-group flex-row">
            <label for="timeoutInput">Timeout (seconds):</label>
            <input type="number" id="timeoutInput" value="45" min="10" max="120">
          </div>
          
          <button onclick="testExtraction()">Extract Property Data</button>
        </div>
        
        <div id="sites-tab" class="tab-content" style="display:none;">
          <h3>Select a real estate site to test:</h3>
          <p>These are pre-configured test URLs for different real estate websites.</p>
          
          <div class="sites-container">
            <div class="site-card" onclick="selectSite('https://www.homes.com/property/509-lake-shore-ter-s-lake-quivira-ks-66217/id-400026765562/')">
              <strong>Homes.com</strong>
              <p>Regional site with less protection</p>
            </div>
            
            <div class="site-card" onclick="selectSite('https://www.homefinder.com/property/4-bedrooms-2-bathrooms-Residential-115246227-9902-Corella-Ave-Whittier-California-90603')">
              <strong>HomeFinder</strong>
              <p>Smaller listing site</p>
            </div>
            
            <div class="site-card" onclick="selectSite('https://www.trulia.com/p/ca/santa-clara/1883-hillebrant-pl-santa-clara-ca-95050--2084636767')">
              <strong>Trulia</strong>
              <p>Mid-tier listing site</p>
            </div>
            
            <div class="site-card" onclick="selectSite('https://www.redfin.com/TX/Austin/4513-Spanish-Oak-Trl-78731/home/31264436')">
              <strong>Redfin</strong>
              <p>Popular listing site</p>
            </div>
            
            <div class="site-card" onclick="selectSite('https://www.realtor.com/realestateandhomes-detail/321-Cedros-Ave-Unit-A_Solana-Beach_CA_92075_M25131-96845')">
              <strong>Realtor.com</strong>
              <p>Major listing site</p>
            </div>
            
            <div class="site-card" onclick="selectSite('https://www.zillow.com/homedetails/122-N-Clark-Dr-Los-Angeles-CA-90048/20516854_zpid/')">
              <strong>Zillow</strong>
              <p>Major listing site (strongest protection)</p>
            </div>
          </div>
        </div>
        
        <div id="results" style="display: none;">
          <h2>Extraction Results</h2>
          <div id="loader" style="display: none;">
            <p>Extracting data from property listing...</p>
            <p>This may take up to <span id="timeoutDisplay">45</span> seconds.</p>
          </div>
          <div id="errorMessage" style="display: none;" class="error-card"></div>
          <div id="propertyData"></div>
        </div>
        
        <script>
          function switchTab(tabId) {
            // Hide all tab contents
            document.querySelectorAll('.tab-content').forEach(tab => {
              tab.style.display = 'none';
            });
            
            // Remove active class from all tabs
            document.querySelectorAll('.tab').forEach(tab => {
              tab.classList.remove('active');
            });
            
            // Show the selected tab content
            document.getElementById(tabId).style.display = 'block';
            
            // Set the clicked tab as active
            event.currentTarget.classList.add('active');
          }
          
          function selectSite(url) {
            document.getElementById('urlInput').value = url;
            switchTab('url-tab');
            
            // Scroll to the URL input
            document.getElementById('urlInput').scrollIntoView({ behavior: 'smooth' });
          }
          
          async function testExtraction() {
            const url = document.getElementById('urlInput').value;
            const timeout = parseInt(document.getElementById('timeoutInput').value) || 45;
            
            if (!url) {
              alert('Please enter a property URL');
              return;
            }
            
            // Update timeout display
            document.getElementById('timeoutDisplay').textContent = timeout;
            
            const resultsDiv = document.getElementById('results');
            const loaderDiv = document.getElementById('loader');
            const errorDiv = document.getElementById('errorMessage');
            const propertyDataDiv = document.getElementById('propertyData');
            
            resultsDiv.style.display = 'block';
            loaderDiv.style.display = 'block';
            errorDiv.style.display = 'none';
            propertyDataDiv.innerHTML = '';
            
            // Scroll to results
            resultsDiv.scrollIntoView({ behavior: 'smooth' });
            
            try {
              const response = await fetch('/api/test/extract-property-from-url', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({ url, timeout })
              });
              
              const data = await response.json();
              
              if (!response.ok) {
                throw new Error(data.error || 'Failed to extract property data');
              }
              
              displayPropertyData(data);
            } catch (error) {
              errorDiv.textContent = error.message;
              errorDiv.style.display = 'block';
            } finally {
              loaderDiv.style.display = 'none';
            }
          }
          
          function displayPropertyData(data) {
            const propertyDataDiv = document.getElementById('propertyData');
            
            const html = \`
              <div class="property-data">
                <div class="property-section">
                  <h3>Basic Information</h3>
                  <div class="property-field"><strong>Address:</strong> \${data.address || 'Not available'}</div>
                  <div class="property-field"><strong>City:</strong> \${data.city || 'Not available'}</div>
                  <div class="property-field"><strong>State:</strong> \${data.state || 'Not available'}</div>
                  <div class="property-field"><strong>ZIP:</strong> \${data.zip || 'Not available'}</div>
                  <div class="property-field"><strong>Property URL:</strong> <a href="\${data.propertyUrl}" target="_blank">\${data.propertyUrl}</a></div>
                </div>
                
                <div class="property-section">
                  <h3>Property Details</h3>
                  <div class="property-field"><strong>Property Type:</strong> \${data.propertyType || 'Not available'}</div>
                  <div class="property-field"><strong>Bedrooms:</strong> \${data.bedrooms || 'Not available'}</div>
                  <div class="property-field"><strong>Bathrooms:</strong> \${data.bathrooms || 'Not available'}</div>
                  <div class="property-field"><strong>Square Feet:</strong> \${data.squareFeet || 'Not available'}</div>
                  <div class="property-field"><strong>Price:</strong> \${data.price || 'Not available'}</div>
                  <div class="property-field"><strong>Year Built:</strong> \${data.yearBuilt || 'Not available'}</div>
                </div>
                
                <div class="property-section">
                  <h3>Agent Information</h3>
                  <div class="property-field"><strong>Listing Agent:</strong> \${data.listingAgentName || 'Not available'}</div>
                  <div class="property-field"><strong>Agent Phone:</strong> \${data.listingAgentPhone || 'Not available'}</div>
                  <div class="property-field"><strong>Agent Company:</strong> \${data.listingAgentCompany || 'Not available'}</div>
                  <div class="property-field"><strong>Agent License #:</strong> \${data.listingAgentLicenseNo || 'Not available'}</div>
                  <div class="property-field"><strong>Original Listing Text:</strong> \${data.listedby || 'Not available'}</div>
                </div>
                
                <div class="property-section">
                  <h3>Description</h3>
                  <div class="property-field">\${data.description || 'No description available'}</div>
                </div>
                
                <div class="property-section">
                  <h3>Features</h3>
                  <div class="property-field">
                    \${Array.isArray(data.features) && data.features.length > 0 
                      ? '<ul>' + data.features.map(feature => \`<li>\${feature}</li>\`).join('') + '</ul>'
                      : 'No features available'}
                  </div>
                </div>
              </div>
            \`;
            
            propertyDataDiv.innerHTML = html;
          }
        </script>
      </body>
      </html>
    `);
  });

  // Extract data from ID documents using OpenAI Vision
  app.post("/api/ai/extract-id-data", isAuthenticated, async (req, res) => {
    try {
      const { idFrontBase64, idBackBase64 } = req.body;

      if (!idFrontBase64 || !idBackBase64) {
        return res.status(400).json({
          success: false,
          error: "Both front and back ID images are required in base64 format",
        });
      }

      const extractedData = await extractIDData(idFrontBase64, idBackBase64);

      res.json({
        success: true,
        data: extractedData,
      });
    } catch (error) {
      console.error("ID data extraction error:", error);
      res.status(500).json({
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to extract ID data",
      });
    }
  });

  // Messages routes
  app.get(
    "/api/messages/property/:propertyId/user/:userId",
    isAuthenticated,
    async (req, res) => {
      try {
        const propertyId = parseInt(req.params.propertyId);
        const userId = parseInt(req.params.userId);

        // Verify the current user has access to this property
        const property = await storage.getProperty(propertyId);

        if (!property) {
          return res.status(404).json({
            success: false,
            error: "Property not found",
          });
        }

        const currentUserId = req.user.id;
        const role = req.user.role;

        const hasAccess =
          role === "admin" ||
          (role === "buyer" && property.createdBy === currentUserId) ||
          (role === "seller" && property.sellerId === currentUserId) ||
          (role === "agent" && property.agentId === currentUserId);

        if (!hasAccess) {
          return res.status(403).json({
            success: false,
            error: "You don't have access to this property's messages",
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
            error: "The specified user is not a participant in this property",
          });
        }

        // Get messages between the current user and the specified user for this property
        const messages = await storage.getMessagesBetweenUsers(
          propertyId,
          currentUserId,
          userId,
        );

        res.json(messages);
      } catch (error) {
        console.error("Get messages error:", error);
        res.status(500).json({
          success: false,
          error: "Failed to fetch messages",
        });
      }
    },
  );

  // Public viewing request routes (no authentication required)

  // Get a viewing request by token (public access)
  app.get("/api/public/viewing-request/:token", async (req, res) => {
    try {
      const { token } = req.params;

      if (!token) {
        return res.status(400).json({
          success: false,
          error: "Invalid token",
        });
      }

      // Validate the token and get viewing request data
      const validationResult = await validateViewingToken(token);

      if (!validationResult || !validationResult.isValid) {
        return res.status(403).json({
          success: false,
          error: validationResult?.errorMessage || "Invalid or expired token",
        });
      }

      // Format the dates for display
      const requestData = {
        viewingRequest: validationResult.viewingRequest,
        property: validationResult.property,
        buyer: {
          // Only include necessary buyer info to protect privacy
          firstName: validationResult.buyer.firstName,
          lastName: validationResult.buyer.lastName,
          email: validationResult.buyer.email,
          phone: validationResult.buyer.phone,
        },
        agent: validationResult.agent
          ? {
              // Only include necessary agent info
              firstName: validationResult.agent.firstName,
              lastName: validationResult.agent.lastName,
              email: validationResult.agent.email,
              phone: validationResult.agent.phone,
            }
          : null,
        token: token,
      };

      res.json({
        success: true,
        data: requestData,
      });
    } catch (error) {
      console.error("Error getting public viewing request:", error);
      res.status(500).json({
        success: false,
        error: "Failed to get viewing request information",
      });
    }
  });

  // Handle public viewing request response (accept, reject, reschedule)
  app.post("/api/public/viewing-request/:token/respond", async (req, res) => {
    try {
      const { token } = req.params;
      const { status, responseMessage, confirmedDate, confirmedEndDate } =
        req.body;

      if (!token) {
        return res.status(400).json({
          success: false,
          error: "Invalid token",
        });
      }

      // Validate the status
      if (!["accepted", "rejected", "rescheduled"].includes(status)) {
        return res.status(400).json({
          success: false,
          error:
            "Invalid status. Must be one of: accepted, rejected, rescheduled",
        });
      }

      // For rescheduled requests, ensure we have new dates
      if (status === "rescheduled" && (!confirmedDate || !confirmedEndDate)) {
        return res.status(400).json({
          success: false,
          error: "Confirmed date and end date are required for rescheduling",
        });
      }

      // Validate the token and get viewing request data
      const validationResult = await validateViewingToken(token);

      if (!validationResult || !validationResult.isValid) {
        return res.status(403).json({
          success: false,
          error: validationResult?.errorMessage || "Invalid or expired token",
        });
      }

      // Don't allow changing a viewing request that's not pending
      if (validationResult.viewingRequest.status !== "pending") {
        return res.status(400).json({
          success: false,
          error: `This viewing request has already been ${validationResult.viewingRequest.status}`,
        });
      }

      // Create update data object for seller agent approval
      const updateData: Partial<ViewingRequest> = {
        // Don't update general status - use approval system instead
        responseMessage: responseMessage || null,
        updatedAt: new Date(),
      };

      // Add confirmed dates if provided
      if (confirmedDate) {
        updateData.confirmedDate = new Date(confirmedDate);
      }

      if (confirmedEndDate) {
        updateData.confirmedEndDate = new Date(confirmedEndDate);
      }

      // Update seller agent approval status based on response
      if (status === "accepted") {
        updateData.sellerAgentApprovalStatus = "approved";
        updateData.sellerAgentApprovalSource = "public_viewing_page";
        updateData.sellerAgentApprovalDate = new Date();
        // Use property agent or seller as approver
        updateData.sellerAgentApprovedById = validationResult.property.agentId || validationResult.property.sellerId;
      } else if (status === "rejected") {
        updateData.sellerAgentApprovalStatus = "rejected";
        updateData.sellerAgentApprovalSource = "public_viewing_page";
        updateData.sellerAgentApprovalDate = new Date();
        updateData.sellerAgentApprovedById = validationResult.property.agentId || validationResult.property.sellerId;
      } else if (status === "rescheduled") {
        updateData.sellerAgentApprovalStatus = "approved";
        updateData.sellerAgentApprovalSource = "public_viewing_page";
        updateData.sellerAgentApprovalDate = new Date();
        updateData.sellerAgentApprovedById = validationResult.property.agentId || validationResult.property.sellerId;
      }

      // Update the viewing request
      const updatedRequest = await storage.updateViewingRequest(
        validationResult.viewingRequest.id,
        updateData,
      );

      // Log the activity
      await storage.createPropertyActivityLog({
        propertyId: validationResult.property.id,
        userId: validationResult.property.agentId || validationResult.property.sellerId,
        activity: `Viewing request ${status} by seller's agent via public link`,
        details: {
          requestId: updatedRequest.id,
          approvalType: "seller_agent",
          approvalSource: "public_viewing_page",
          approvalStatus: status === "accepted" || status === "rescheduled" ? "approved" : "rejected",
          via: "public_link",
        },
      });

      // Make token single-use if the status is accepted or rejected
      if (status === "accepted" || status === "rejected") {
        await storage.invalidateViewingToken(token);
      }

      // Return success response
      res.json({
        success: true,
        data: {
          viewingRequest: updatedRequest,
          message: `Viewing request ${status === "accepted" ? "accepted" : status === "rejected" ? "rejected" : "rescheduled"} successfully`,
        },
      });
    } catch (error) {
      console.error("Error responding to viewing request:", error);
      res.status(500).json({
        success: false,
        error: "Failed to respond to viewing request",
      });
    }
  });

  // Admin routes
  app.get(
    "/api/admin/users",
    isAuthenticated,
    hasRole(["admin"]),
    async (req, res) => {
      try {
        const users = await storage.getAllUsers();
        res.json(users);
      } catch (error) {
        console.error("Get all users error:", error);
        res.status(500).json({
          success: false,
          error: "Failed to fetch users",
        });
      }
    },
  );

  app.get(
    "/api/admin/properties",
    isAuthenticated,
    hasRole(["admin"]),
    async (req, res) => {
      try {
        const properties = await storage.getAllProperties();
        res.json(properties);
      } catch (error) {
        console.error("Get all properties error:", error);
        res.status(500).json({
          success: false,
          error: "Failed to fetch properties",
        });
      }
    },
  );

  // Get all agent referral agreements for admin
  app.get(
    "/api/admin/agent-referral-agreements",
    isAuthenticated,
    hasRole(["admin"]),
    async (req, res) => {
      try {
        // Query all agreements of type "agent_referral"
        const allAgreements =
          await storage.getAgreementsByType("agent_referral");

        // Get the agent details for each agreement
        const agreementsWithDetails = await Promise.all(
          allAgreements.map(async (agreement) => {
            const agent = await storage.getUser(agreement.agentId);
            return {
              ...agreement,
              agent: agent
                ? {
                    id: agent.id,
                    name:
                      `${agent.firstName || ""} ${agent.lastName || ""}`.trim() ||
                      agent.email,
                    email: agent.email,
                    licenseNumber: agent.licenseNumber,
                  }
                : null,
            };
          }),
        );

        res.json({
          success: true,
          data: agreementsWithDetails,
        });
      } catch (error) {
        console.error("Error fetching agent referral agreements:", error);
        res.status(500).json({
          success: false,
          error: "Failed to fetch agent referral agreements",
        });
      }
    },
  );

  app.get(
    "/api/admin/agents",
    isAuthenticated,
    hasRole(["admin"]),
    async (req, res) => {
      try {
        const agents = await storage.getUsersByRole("agent");
        res.json(agents);
      } catch (error) {
        console.error("Get agents error:", error);
        res.status(500).json({
          success: false,
          error: "Failed to fetch agents",
        });
      }
    },
  );

  // Get buyer journey metrics for admin dashboard
  app.get(
    "/api/admin/buyer-journey-metrics",
    isAuthenticated,
    hasRole(["admin"]),
    async (req, res) => {
      try {
        // Get all buyers
        const buyers = await storage.getUsersByRole("buyer");
        const totalBuyers = buyers.length;

        // Get all properties
        const properties = await storage.getAllProperties();
        const propertiesWithBuyerIds = properties.filter(
          (property) => property.createdBy !== null,
        );

        // Count unique buyers who have created properties
        const uniqueBuyersWithProperties = new Set(
          propertiesWithBuyerIds.map((property) => property.createdBy),
        );
        const buyersWithProperties = uniqueBuyersWithProperties.size;

        // Get all messages
        const allMessages = await storage.getMessagesByProperty(0, true);

        // Count unique buyers who have messaged with agents
        const uniqueBuyersWithMessages = new Set();
        allMessages.forEach((message) => {
          const sender = message.senderId;
          const receiver = message.receiverId;

          // Get the sender and receiver details
          const senderDetails = buyers.find((user) => user.id === sender);
          const receiverDetails = buyers.find((user) => user.id === receiver);

          // If sender is a buyer and receiver is an agent, or vice versa, count this buyer
          if (senderDetails && senderDetails.role === "buyer") {
            uniqueBuyersWithMessages.add(sender);
          }
          if (receiverDetails && receiverDetails.role === "buyer") {
            uniqueBuyersWithMessages.add(receiver);
          }
        });
        const buyersWithMessages = uniqueBuyersWithMessages.size;

        // Get all viewing requests
        const allViewingRequests = await storage.getViewingRequestsByProperty(
          0,
          true,
        );

        // Count unique buyers who have made viewing requests
        const uniqueBuyersWithViewings = new Set(
          allViewingRequests.map((request) => request.buyerId),
        );
        const buyersWithViewings = uniqueBuyersWithViewings.size;

        res.json({
          success: true,
          data: {
            totalBuyers,
            buyersWithProperties,
            buyersWithMessages,
            buyersWithViewings,
            conversionRates: {
              toProperties:
                totalBuyers > 0
                  ? (buyersWithProperties / totalBuyers) * 100
                  : 0,
              toMessages:
                buyersWithProperties > 0
                  ? (buyersWithMessages / buyersWithProperties) * 100
                  : 0,
              toViewings:
                buyersWithMessages > 0
                  ? (buyersWithViewings / buyersWithMessages) * 100
                  : 0,
              overall:
                totalBuyers > 0 ? (buyersWithViewings / totalBuyers) * 100 : 0,
            },
          },
        });
      } catch (error) {
        console.error("Get buyer journey metrics error:", error);
        res.status(500).json({
          success: false,
          error: "Failed to fetch buyer journey metrics",
        });
      }
    },
  );

  // Agent Journey Metrics
  app.get(
    "/api/admin/agent-journey-metrics",
    isAuthenticated,
    hasRole(["admin"]),
    async (req, res) => {
      try {
        // Get all agents
        const agents = await storage.getUsersByRole("agent");
        const totalAgents = agents.length;

        // Get all properties
        const properties = await storage.getAllProperties();

        // Count unique agents who have been assigned to properties
        const uniqueAgentsWithProperties = new Set(
          properties
            .filter((property) => property.agentId !== null)
            .map((property) => property.agentId),
        );
        const agentsWithAssignedProperties = uniqueAgentsWithProperties.size;

        // Get all messages
        const allMessages = await storage.getMessagesByProperty(0, true);

        // Count unique agents who have sent/received messages
        const uniqueAgentsWithMessages = new Set();
        allMessages.forEach((message) => {
          const sender = message.senderId;
          const receiver = message.receiverId;

          // Get the sender and receiver details
          const senderDetails = agents.find((user) => user.id === sender);
          const receiverDetails = agents.find((user) => user.id === receiver);

          // If sender is an agent, count them
          if (senderDetails && senderDetails.role === "agent") {
            uniqueAgentsWithMessages.add(sender);
          }
          // If receiver is an agent, count them
          if (receiverDetails && receiverDetails.role === "agent") {
            uniqueAgentsWithMessages.add(receiver);
          }
        });
        const agentsWithMessages = uniqueAgentsWithMessages.size;

        // Get all viewing requests
        const allViewingRequests = await storage.getViewingRequestsByProperty(
          0,
          true,
        );

        // Count unique agents who have handled viewing requests
        const uniqueAgentsWithViewings = new Set(
          allViewingRequests
            .filter((request) => request.agentId !== null)
            .map((request) => request.agentId),
        );
        const agentsWithViewings = uniqueAgentsWithViewings.size;

        // Get all agreements
        const allAgreements = await storage.getAgreementsByType("all");

        // Count unique agents who have agreements
        const uniqueAgentsWithAgreements = new Set(
          allAgreements
            .filter((agreement) => agreement.agentId !== null)
            .map((agreement) => agreement.agentId),
        );
        const agentsWithAgreements = uniqueAgentsWithAgreements.size;

        res.json({
          success: true,
          data: {
            totalAgents,
            agentsWithAssignedProperties,
            agentsWithMessages,
            agentsWithViewings,
            agentsWithAgreements,
            conversionRates: {
              toProperties:
                totalAgents > 0
                  ? (agentsWithAssignedProperties / totalAgents) * 100
                  : 0,
              toMessages:
                agentsWithAssignedProperties > 0
                  ? (agentsWithMessages / agentsWithAssignedProperties) * 100
                  : 0,
              toViewings:
                agentsWithMessages > 0
                  ? (agentsWithViewings / agentsWithMessages) * 100
                  : 0,
              toAgreements:
                agentsWithViewings > 0
                  ? (agentsWithAgreements / agentsWithViewings) * 100
                  : 0,
              overall:
                totalAgents > 0
                  ? (agentsWithAgreements / totalAgents) * 100
                  : 0,
            },
          },
        });
      } catch (error) {
        console.error("Get agent journey metrics error:", error);
        res.status(500).json({
          success: false,
          error: "Failed to fetch agent journey metrics",
        });
      }
    },
  );

  // Seller Journey Metrics
  app.get(
    "/api/admin/seller-journey-metrics",
    isAuthenticated,
    hasRole(["admin"]),
    async (req, res) => {
      try {
        // Get all sellers
        const sellers = await storage.getUsersByRole("seller");
        const totalSellers = sellers.length;

        // Get all properties
        const properties = await storage.getAllProperties();

        // Count unique sellers who have properties
        const uniqueSellersWithProperties = new Set(
          properties
            .filter((property) => property.sellerId !== null)
            .map((property) => property.sellerId),
        );
        const sellersWithListedProperties = uniqueSellersWithProperties.size;

        // Get all messages
        const allMessages = await storage.getMessagesByProperty(0, true);

        // Count unique sellers who have sent/received messages
        const uniqueSellersWithMessages = new Set();
        allMessages.forEach((message) => {
          const sender = message.senderId;
          const receiver = message.receiverId;

          // Get the sender and receiver details
          const senderDetails = sellers.find((user) => user.id === sender);
          const receiverDetails = sellers.find((user) => user.id === receiver);

          // If sender is a seller, count them
          if (senderDetails && senderDetails.role === "seller") {
            uniqueSellersWithMessages.add(sender);
          }
          // If receiver is a seller, count them
          if (receiverDetails && receiverDetails.role === "seller") {
            uniqueSellersWithMessages.add(receiver);
          }
        });
        const sellersWithMessages = uniqueSellersWithMessages.size;

        // Get all viewing requests for seller's properties
        const allViewingRequests = await storage.getViewingRequestsByProperty(
          0,
          true,
        );

        // Find properties with sellers
        const propertiesWithSellers = properties.filter(
          (property) => property.sellerId !== null,
        );

        // Count unique sellers who have viewing requests for their properties
        const sellersWithViewingRequests = new Set();

        allViewingRequests.forEach((request) => {
          const property = propertiesWithSellers.find(
            (p) => p.id === request.propertyId,
          );
          if (property && property.sellerId) {
            sellersWithViewingRequests.add(property.sellerId);
          }
        });

        const sellersWithViewingRequestsCount = sellersWithViewingRequests.size;

        res.json({
          success: true,
          data: {
            totalSellers,
            sellersWithListedProperties,
            sellersWithMessages,
            sellersWithViewingRequests: sellersWithViewingRequestsCount,
            conversionRates: {
              toProperties:
                totalSellers > 0
                  ? (sellersWithListedProperties / totalSellers) * 100
                  : 0,
              toMessages:
                sellersWithListedProperties > 0
                  ? (sellersWithMessages / sellersWithListedProperties) * 100
                  : 0,
              toViewings:
                sellersWithMessages > 0
                  ? (sellersWithViewingRequestsCount / sellersWithMessages) *
                    100
                  : 0,
              overall:
                totalSellers > 0
                  ? (sellersWithViewingRequestsCount / totalSellers) * 100
                  : 0,
            },
          },
        });
      } catch (error) {
        console.error("Get seller journey metrics error:", error);
        res.status(500).json({
          success: false,
          error: "Failed to fetch seller journey metrics",
        });
      }
    },
  );

  app.put(
    "/api/admin/users/:id/block",
    isAuthenticated,
    hasRole(["admin"]),
    async (req, res) => {
      try {
        const userId = parseInt(req.params.id);
        const { block } = req.body;

        if (typeof block !== "boolean") {
          return res.status(400).json({
            success: false,
            error: "Block parameter must be a boolean",
          });
        }

        const user = await storage.getUser(userId);

        if (!user) {
          return res.status(404).json({
            success: false,
            error: "User not found",
          });
        }

        // Don't allow blocking other admins
        if (user.role === "admin") {
          return res.status(403).json({
            success: false,
            error: "Cannot block admin users",
          });
        }

        const updatedUser = await storage.updateUser(userId, {
          isBlocked: block,
        });

        res.json({
          success: true,
          data: updatedUser,
        });
      } catch (error) {
        console.error("Block user error:", error);
        res.status(500).json({
          success: false,
          error: "Failed to update user",
        });
      }
    },
  );

  // Approve/reject agent endpoint
  app.put(
    "/api/admin/users/:id/approve",
    isAuthenticated,
    hasRole(["admin"]),
    async (req, res) => {
      try {
        const userId = parseInt(req.params.id);
        const { profileStatus } = req.body;

        if (!profileStatus || !["verified", "rejected", "pending"].includes(profileStatus)) {
          return res.status(400).json({
            success: false,
            error: "Valid profile status is required (verified, rejected, or pending)",
          });
        }

        const user = await storage.getUser(userId);

        if (!user) {
          return res.status(404).json({
            success: false,
            error: "User not found",
          });
        }

        // Only allow approving agents
        if (user.role !== "agent") {
          return res.status(400).json({
            success: false,
            error: "Only agents can be approved",
          });
        }

        const updatedUser = await storage.updateUser(userId, {
          profileStatus: profileStatus,
        });

        res.json({
          success: true,
          data: updatedUser,
        });
      } catch (error) {
        console.error("Approve agent error:", error);
        res.status(500).json({
          success: false,
          error: "Failed to update agent status",
        });
      }
    },
  );

  // Endpoint for buyers to choose their own agent
  app.put(
    "/api/properties/:id/choose-agent",
    isAuthenticated,
    hasRole(["buyer", "admin"]),
    async (req, res) => {
      try {
        const propertyId = parseInt(req.params.id);
        const { agentId } = req.body;

        if (!agentId || typeof agentId !== "number") {
          return res.status(400).json({
            success: false,
            error: "Valid agent ID is required",
          });
        }

        // Verify property exists and belongs to this buyer
        const property = await storage.getProperty(propertyId);

        if (!property) {
          return res.status(404).json({
            success: false,
            error: "Property not found",
          });
        }

        // Make sure the property belongs to this buyer
        if (property.createdBy !== req.user.id) {
          return res.status(403).json({
            success: false,
            error:
              "You don't have permission to choose an agent for this property",
          });
        }

        // Verify agent exists and is a verified agent
        const agent = await storage.getUser(agentId);

        if (
          !agent ||
          agent.role !== "agent" ||
          agent.profileStatus !== "verified" ||
          agent.isBlocked
        ) {
          return res.status(400).json({
            success: false,
            error: "Invalid or unavailable agent",
          });
        }

        // Update property with new agent
        const updatedProperty = await storage.updateProperty(propertyId, {
          agentId: agentId,
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
              buyerId: req.user!.id,
            },
          });
        } catch (logError) {
          console.error(
            "Failed to create activity log for buyer choosing agent, but agent was assigned:",
            logError,
          );
          // Continue without failing the whole request
        }

        // Send WebSocket notification to the agent
        websocketServer.broadcastToUsers([agentId], {
          type: "notification",
          data: {
            message: "A buyer has assigned you to their property!",
            propertyId: propertyId,
          },
        });

        res.json({
          success: true,
          data: updatedProperty,
        });
      } catch (error) {
        console.error("Choose agent error:", error);
        res.status(500).json({
          success: false,
          error: "Failed to assign agent to property",
        });
      }
    },
  );

  app.put(
    "/api/admin/properties/:id/reassign",
    isAuthenticated,
    hasRole(["admin"]),
    async (req, res) => {
      try {
        const propertyId = parseInt(req.params.id);
        const { agentId } = req.body;

        if (!agentId || typeof agentId !== "number") {
          return res.status(400).json({
            success: false,
            error: "Valid agent ID is required",
          });
        }

        // Verify property exists
        const property = await storage.getProperty(propertyId);

        if (!property) {
          return res.status(404).json({
            success: false,
            error: "Property not found",
          });
        }

        // Verify agent exists and is an agent
        const agent = await storage.getUser(agentId);

        if (!agent || agent.role !== "agent") {
          return res.status(400).json({
            success: false,
            error: "Invalid agent ID",
          });
        }

        // Update property with new agent
        const updatedProperty = await storage.updateProperty(propertyId, {
          agentId: agentId,
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
              adminId: req.user!.id,
            },
          });
        } catch (logError) {
          console.error(
            "Failed to create activity log for admin reassigning agent, but agent was reassigned:",
            logError,
          );
          // Continue without failing the whole request
        }

        res.json({
          success: true,
          data: updatedProperty,
        });
      } catch (error) {
        console.error("Reassign agent error:", error);
        res.status(500).json({
          success: false,
          error: "Failed to reassign agent",
        });
      }
    },
  );

  // Property activity log endpoints
  app.get("/api/properties/:id/logs", isAuthenticated, async (req, res) => {
    try {
      const propertyId = parseInt(req.params.id);
      const property = await storage.getProperty(propertyId);

      if (!property) {
        return res.status(404).json({
          success: false,
          error: "Property not found",
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
          error: "You don't have permission to perform this action",
        });
      }

      const logs = await storage.getPropertyActivityLogs(propertyId);

      res.json({
        success: true,
        data: logs,
      });
    } catch (error) {
      console.error("Error getting property logs:", error);
      res.status(500).json({
        success: false,
        error: "Failed to get property logs",
      });
    }
  });

  // Agreement endpoints
  app.get(
    "/api/properties/:id/agreements",
    isAuthenticated,
    async (req, res) => {
      try {
        const propertyId = parseInt(req.params.id);
        const property = await storage.getProperty(propertyId);

        if (!property) {
          return res.status(404).json({
            success: false,
            error: "Property not found",
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
            error:
              "You don't have permission to view agreements for this property",
          });
        }

        const agreements = await storage.getAgreementsByProperty(propertyId);

        res.json({
          success: true,
          data: agreements,
        });
      } catch (error) {
        console.error("Error getting property agreements:", error);
        res.status(500).json({
          success: false,
          error: "Failed to get property agreements",
        });
      }
    },
  );

  app.get("/api/agreements/:id", isAuthenticated, async (req, res) => {
    try {
      const agreementId = parseInt(req.params.id);
      const agreement = await storage.getAgreement(agreementId);

      if (!agreement) {
        return res.status(404).json({
          success: false,
          error: "Agreement not found",
        });
      }

      // Verify user has permission to view this agreement
      const property = await storage.getProperty(agreement.propertyId);

      if (!property) {
        return res.status(404).json({
          success: false,
          error: "Property not found",
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
          error: "You don't have permission to view this agreement",
        });
      }

      res.json({
        success: true,
        data: agreement,
      });
    } catch (error) {
      console.error("Error getting agreement:", error);
      res.status(500).json({
        success: false,
        error: "Failed to get agreement",
      });
    }
  });

  // Get a specific agreement document metadata
  app.get("/api/agreements/:id/document", isAuthenticated, async (req, res) => {
    try {
      const agreementId = parseInt(req.params.id);
      const agreement = await storage.getAgreement(agreementId);

      if (!agreement) {
        return res.status(404).json({
          success: false,
          error: "Agreement not found",
        });
      }

      // Get the property to check permissions
      const property = await storage.getPropertyWithParticipants(
        agreement.propertyId,
      );

      if (!property) {
        return res.status(404).json({
          success: false,
          error: "Property not found",
        });
      }

      // Verify user has permission to access this agreement
      const userId = req.user!.id;
      const userRole = req.user!.role;

      const hasAccess =
        userRole === "admin" ||
        (userRole === "buyer" && property.buyerId === userId) ||
        (userRole === "agent" && property.agentId === userId) ||
        (userRole === "seller" && property.sellerId === userId);

      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          error: "You don't have permission to access this agreement",
        });
      }

      // Return the agreement with its document URL
      res.json({
        success: true,
        data: {
          id: agreement.id,
          type: agreement.type,
          status: agreement.status,
          documentUrl: agreement.documentUrl,
        },
      });
    } catch (error) {
      console.error("Error fetching agreement document:", error);
      res.status(500).json({
        success: false,
        error: "Failed to get agreement document",
      });
    }
  });

  // Serve the actual PDF content of an agreement
  app.get("/api/agreements/:id/view-pdf", isAuthenticated, async (req, res) => {
    try {
      const agreementId = parseInt(req.params.id);
      const agreement = await storage.getAgreement(agreementId);

      if (!agreement) {
        return res.status(404).json({
          success: false,
          error: "Agreement not found",
        });
      }

      // Get the property to check permissions
      const property = await storage.getPropertyWithParticipants(
        agreement.propertyId,
      );

      if (!property) {
        return res.status(404).json({
          success: false,
          error: "Property not found",
        });
      }

      // Verify user has permission to access this agreement
      const userId = req.user!.id;
      const userRole = req.user!.role;

      const hasAccess =
        userRole === "admin" ||
        (userRole === "buyer" && property.buyerId === userId) ||
        (userRole === "agent" && property.agentId === userId) ||
        (userRole === "seller" && property.sellerId === userId);

      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          error: "You don't have permission to access this agreement",
        });
      }

      if (!agreement.documentUrl) {
        return res.status(404).json({
          success: false,
          error: "No document URL found for this agreement",
        });
      }

      // Prepare file path from document URL
      let filePath = "";
      if (agreement.documentUrl.startsWith("/uploads/")) {
        filePath = path.join(process.cwd(), agreement.documentUrl.substring(1));
      } else {
        filePath = path.join(process.cwd(), "uploads", agreement.documentUrl);
      }

      // Check if file exists
      try {
        await fs.promises.access(filePath, fs.constants.F_OK);
      } catch (error) {
        console.error(`File not found at path: ${filePath}`);
        return res.status(404).json({
          success: false,
          error: "Document file not found",
        });
      }

      // If user is an agent viewing an agreement created by a buyer, we need to regenerate the PDF
      // to ensure it includes the buyer's changes and signature
      if (
        userRole === "agent" &&
        agreement.type === "agency_disclosure" &&
        agreement.buyerId &&
        agreement.buyerId !== userId &&
        agreement.status === "signed_by_buyer"
      ) {
        console.log(
          "Agent viewing buyer-signed agreement, regenerating PDF with signatures...",
        );

        try {
          // Get the buyer and agent
          const buyer = await storage.getUser(agreement.buyerId);
          const agent = await storage.getUser(userId);

          if (!buyer || !agent) {
            throw new Error("Could not find buyer or agent");
          }

          // Prepare form data
          const formDataForPdf: AgencyDisclosureFormData = {
            buyerName1: buyer
              ? `${buyer.firstName || ""} ${buyer.lastName || ""}`.trim() ||
                buyer.email
              : "",
            agentName: agent
              ? `${agent.firstName || ""} ${agent.lastName || ""}`.trim() ||
                agent.email
              : "",
            agentBrokerageName: "Coldwell Banker Grass Roots Realty",
            agentLicenseNumber: "2244751", // Example license number
            propertyAddress: property.address,
            propertyCity: property.city || "",
            propertyState: property.state || "",
            propertyZip: property.zip || "",
            isEditable: false,
          };

          // Generate the PDF with data
          let pdfBuffer = await fillAgencyDisclosureForm(formDataForPdf);

          // Add buyer signature if available
          if (agreement.buyerSignature) {
            pdfBuffer = await addSignatureToPdf(
              pdfBuffer,
              agreement.buyerSignature,
              "buyer1",
            );
          }

          // Add agent signature if available
          if (agreement.agentSignature) {
            pdfBuffer = await addSignatureToPdf(
              pdfBuffer,
              agreement.agentSignature,
              "agent",
            );
          }

          // Set response headers
          res.setHeader("Content-Type", "application/pdf");
          res.setHeader(
            "Content-Disposition",
            `inline; filename="Agency_Disclosure_${agreementId}.pdf"`,
          );

          // Send the regenerated PDF
          return res.send(pdfBuffer);
        } catch (error) {
          console.error("Error regenerating PDF:", error);
          // If regeneration fails, fall back to serving the static file
        }
      }

      // Read and serve the file
      const fileBuffer = await fs.promises.readFile(filePath);

      // Set response headers
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `inline; filename="Agreement_${agreementId}.pdf"`,
      );

      // Send the file
      res.send(fileBuffer);
    } catch (error) {
      console.error("Error serving agreement PDF:", error);
      res.status(500).json({
        success: false,
        error: "Failed to serve agreement PDF",
      });
    }
  });

  app.post(
    "/api/properties/:id/agreements",
    isAuthenticated,
    async (req, res) => {
      try {
        const propertyId = parseInt(req.params.id);
        const property = await storage.getProperty(propertyId);

        if (!property) {
          return res.status(404).json({
            success: false,
            error: "Property not found",
          });
        }

        const agreementData = req.body;

        // Handle agency disclosure form type (can be created by buyers)
        if (agreementData.type === "agency_disclosure") {
          // Validate input for disclosure form
          if (!agreementData.signatureData) {
            return res.status(400).json({
              success: false,
              error: "Signature data is required for disclosure form",
            });
          }

          // Ensure the property has an assigned agent
          if (!property.agentId) {
            return res.status(400).json({
              success: false,
              error: "Property must have an assigned agent",
            });
          }

          // For agency disclosure, we need to fill the form with property/agent/buyer details
          const agreement = await storage.createAgreement({
            propertyId,
            type: "agency_disclosure",
            agentId: property.agentId,
            buyerId: req.user.id,
            agreementText: JSON.stringify(agreementData.details || {}),
            buyerSignature: agreementData.signatureData,
            date: new Date(),
            status: "signed_by_buyer", // Buyer has signed the disclosure
          });

          // Log this activity
          try {
            await storage.createPropertyActivityLog({
              propertyId,
              userId: req.user.id,
              activity: "Agency disclosure form signed by buyer",
              details: {
                agreementId: agreement.id,
                agreementType: "agency_disclosure",
                status: agreement.status,
              },
            });
          } catch (logError) {
            console.error(
              "Failed to create activity log for agreement creation, but agreement was created:",
              logError,
            );
          }

          return res.status(201).json({
            success: true,
            data: agreement,
          });
        } else {
          // For standard agreements, only agents can create them
          if (req.user.role !== "agent" && req.user.role !== "admin") {
            return res.status(403).json({
              success: false,
              error: "Only agents can create standard agreements",
            });
          }

          // Ensure the agent is assigned to this property
          if (req.user.role === "agent" && property.agentId !== req.user.id) {
            return res.status(403).json({
              success: false,
              error: "You are not the agent assigned to this property",
            });
          }

          // Validate required fields for standard agreement
          if (
            !agreementData.buyerId ||
            !agreementData.agreementText ||
            !agreementData.agentSignature
          ) {
            return res.status(400).json({
              success: false,
              error:
                "Missing required fields: buyerId, agreementText, and agentSignature are required",
            });
          }

          const agreement = await storage.createAgreement({
            propertyId,
            type: "standard",
            agentId:
              req.user.role === "admin" ? agreementData.agentId : req.user.id,
            buyerId: agreementData.buyerId,
            agreementText: agreementData.agreementText,
            agentSignature: agreementData.agentSignature,
            date: new Date(),
            status: "pending_buyer",
          });

          // Log this activity
          try {
            await storage.createPropertyActivityLog({
              propertyId,
              userId: req.user.id,
              activity: "Agreement created",
              details: {
                agreementId: agreement.id,
                agreementType: "standard",
                status: agreement.status,
              },
            });
          } catch (logError) {
            console.error(
              "Failed to create activity log for agreement creation, but agreement was created:",
              logError,
            );
          }

          res.status(201).json({
            success: true,
            data: agreement,
          });
        }
      } catch (error) {
        console.error("Error creating agreement:", error);
        // Log detailed error info for debugging
        console.log("Agreement data:", JSON.stringify(req.body, null, 2));
        console.log("Property ID:", req.params.id);
        console.log("Current user:", req.user?.id, req.user?.role);

        res.status(500).json({
          success: false,
          error: "Failed to create agreement",
          details: error instanceof Error ? error.message : String(error),
        });
      }
    },
  );

  app.patch("/api/agreements/:id", isAuthenticated, async (req, res) => {
    try {
      const agreementId = parseInt(req.params.id);
      const agreement = await storage.getAgreement(agreementId);

      if (!agreement) {
        return res.status(404).json({
          success: false,
          error: "Agreement not found",
        });
      }

      const updateData = req.body;

      // Determine what's being updated and check permissions
      if (updateData.buyerSignature) {
        // Only the buyer can sign as the buyer
        if (req.user.id !== agreement.buyerId && req.user.role !== "admin") {
          return res.status(403).json({
            success: false,
            error: "Only the buyer can sign as the buyer",
          });
        }

        // Update the status - handle different agreement types
        if (agreement.type === "agency_disclosure") {
          updateData.status = "signed_by_buyer";
        } else {
          updateData.status = "signed_buyer";
        }
      } else if (
        updateData.agentSignature &&
        agreement.type === "agency_disclosure"
      ) {
        // For disclosure form, check if agent is assigned to this property
        const property = await storage.getProperty(agreement.propertyId);

        if (!property) {
          return res.status(404).json({
            success: false,
            error: "Property not found",
          });
        }

        if (req.user.id !== property.agentId && req.user.role !== "admin") {
          return res.status(403).json({
            success: false,
            error: "Only the assigned agent can sign the disclosure form",
          });
        }

        // If buyer has already signed, keep as pending for seller review
        // instead of marking as completed
        if (agreement.buyerSignature) {
          updateData.status = "pending"; // Keep as pending for seller review
        } else {
          updateData.status = "pending_buyer";
        }
      } else if (updateData.sellerSignature) {
        // Only the seller can sign as the seller
        const property = await storage.getProperty(agreement.propertyId);

        if (!property) {
          return res.status(404).json({
            success: false,
            error: "Property not found",
          });
        }

        if (req.user.id !== property.sellerId && req.user.role !== "admin") {
          return res.status(403).json({
            success: false,
            error: "Only the seller can sign as the seller",
          });
        }

        // Update the status based on agreement type
        if (agreement.type === "agency_disclosure") {
          updateData.status = "signed_by_seller";

          // If both buyer and agent have signed, mark as completed
          if (agreement.buyerSignature && agreement.agentSignature) {
            // Check if there's an associated viewing request that should stay in pending
            const agreements = await storage.getAgreementsByProperty(
              agreement.propertyId,
            );
            const viewingRequests = await storage.getViewingRequestsByProperty(
              agreement.propertyId,
            );

            // If there's a pending viewing request, keep status as "signed_by_seller" instead of "completed"
            const hasPendingViewingRequest = viewingRequests.some(
              (vr) => vr.status === "pending",
            );

            if (hasPendingViewingRequest) {
              // Don't mark as completed if there's a pending viewing request
              updateData.status = "signed_by_seller";
            }
          }
        } else {
          updateData.status = "completed";
        }
      } else if (updateData.status) {
        // Only admins can update status directly
        if (req.user.role !== "admin") {
          return res.status(403).json({
            success: false,
            error: "Only administrators can update status directly",
          });
        }
      }

      // Update the agreement
      const updatedAgreement = await storage.updateAgreement(
        agreementId,
        updateData,
      );

      // Log this activity
      try {
        await storage.createPropertyActivityLog({
          propertyId: agreement.propertyId,
          userId: req.user.id,
          activity: `Agreement ${updatedAgreement.status}`,
          details: {
            agreementId,
            previousStatus: agreement.status,
            newStatus: updatedAgreement.status,
          },
        });
      } catch (logError) {
        console.error(
          "Failed to create activity log for agreement update, but agreement was updated:",
          logError,
        );
      }

      res.json({
        success: true,
        data: updatedAgreement,
      });
    } catch (error) {
      console.error("Error updating agreement:", error);
      res.status(500).json({
        success: false,
        error: "Failed to update agreement",
      });
    }
  });

  // Endpoint to auto-generate a buyer representation agreement (draft)
  app.post(
    "/api/properties/:id/generate-agreement-draft",
    isAuthenticated,
    hasRole(["agent", "admin"]),
    async (req, res) => {
      try {
        const propertyId = parseInt(req.params.id);
        const property = await storage.getPropertyWithParticipants(propertyId);

        if (!property) {
          return res.status(404).json({
            success: false,
            error: "Property not found",
          });
        }

        // Check if the agent is assigned to this property
        if (req.user!.role === "agent" && property.agentId !== req.user!.id) {
          return res.status(403).json({
            success: false,
            error: "You are not the agent assigned to this property",
          });
        }

        // Make sure there's a buyer for this property
        if (!property.createdBy) {
          return res.status(400).json({
            success: false,
            error: "Property must have a buyer",
          });
        }

        // Get the buyer information
        const buyer =
          property.buyer || (await storage.getUser(property.createdBy));

        if (!buyer) {
          return res.status(404).json({
            success: false,
            error: "Buyer not found",
          });
        }

        // Generate a default agreement text
        const startDate = new Date();
        const endDate = new Date();
        endDate.setDate(endDate.getDate() + 90); // 90 days term

        const agentName =
          req.user!.firstName && req.user!.lastName
            ? `${req.user!.firstName} ${req.user!.lastName}`
            : req.user!.email;

        const buyerName =
          buyer.firstName && buyer.lastName
            ? `${buyer.firstName} ${buyer.lastName}`
            : buyer.email;

        const buyerAddress = buyer.addressLine1
          ? `${buyer.addressLine1}${buyer.addressLine2 ? `, ${buyer.addressLine2}` : ""}, ${buyer.city || ""}, ${buyer.state || ""} ${buyer.zip || ""}`
          : "";

        // Generate agreement text
        const agreementText = `
BUYER REPRESENTATION AGREEMENT

This Buyer Representation Agreement ("Agreement") is entered into on ${startDate.toISOString().split("T")[0]} between:

BUYER: ${buyerName}
Address: ${buyerAddress}

And

BROKER/AGENT: ${agentName}
License #: 
Brokerage: 

1. APPOINTMENT OF BROKER/AGENT:
Buyer appoints Agent as Buyer's exclusive real estate agent for the purpose of finding and acquiring real property as follows:
Property Address: ${property.address}
City: ${property.city || ""}
State: ${property.state || ""}
Zip: ${property.zip || ""}

2. TERM:
This Agreement shall commence on ${startDate.toISOString().split("T")[0]} and shall expire at 11:59 PM on ${endDate.toISOString().split("T")[0]} (90 days).

3. BROKER/AGENT'S OBLIGATIONS:
a) To use professional knowledge and skills to find the property described above.
b) To present all offers and counteroffers in a timely manner.
c) To disclose all known material facts about the property.
d) To maintain the confidentiality of Buyer's personal and financial information.
e) To represent Buyer's interests diligently and in good faith.

4. BUYER'S OBLIGATIONS:
a) To work exclusively with Agent for the purpose of purchasing property as described above.
b) To provide accurate personal and financial information.
c) To view properties only by appointment through Agent.
d) To negotiate the purchase of property only through Agent.
e) To act in good faith toward completing a purchase.

5. COMPENSATION:
a) If Buyer purchases a property during the term of this Agreement, compensation to Agent will be as follows:
   - Agent shall be paid a commission of 3% of the purchase price.
   - If the listing broker or seller offers a commission less than the above, Buyer will be responsible for the difference.

6. TERMINATION:
This Agreement may be terminated by mutual consent of the parties or as otherwise provided by law.

7. ADDITIONAL TERMS:

`;

        // Create a draft agreement in the database (not signed by agent yet)
        const agreement = await storage.createAgreement({
          propertyId,
          type: "standard",
          agentId: req.user!.id,
          buyerId: buyer.id,
          agreementText: agreementText,
          date: new Date(),
          status: "draft", // New status: draft
        });

        // Log this activity
        try {
          await storage.createPropertyActivityLog({
            propertyId,
            userId: req.user!.id,
            activity: "Draft agreement created",
            details: {
              agreementId: agreement.id,
              status: "draft",
            },
          });
        } catch (logError) {
          console.error(
            "Failed to create activity log for draft agreement:",
            logError,
          );
        }

        res.status(201).json({
          success: true,
          data: agreement,
        });
      } catch (error) {
        console.error("Error generating draft agreement:", error);
        res.status(500).json({
          success: false,
          error: "Failed to generate draft agreement",
        });
      }
    },
  );

  // Agency Disclosure Form endpoints

  // Route to generate a California Agency Disclosure Form (preview only)
  app.post(
    "/api/properties/:id/preview-agency-disclosure",
    isAuthenticated,
    async (req, res) => {
      try {
        const propertyId = parseInt(req.params.id);
        const formData = req.body;
        const isEditable = req.query.editable === "true"; // Check for editable flag in query params
        const viewingRequestId = req.query.viewingRequestId
          ? parseInt(req.query.viewingRequestId as string)
          : undefined;

        if (!propertyId) {
          return res.status(400).json({
            success: false,
            error: "Property ID is required",
          });
        }

        const property = await storage.getProperty(propertyId);

        if (!property) {
          return res.status(404).json({
            success: false,
            error: "Property not found",
          });
        }

        // Get existing agreements for this property
        const agreements = await storage.getAgreementsByProperty(propertyId);
        const userId = req.user!.id;
        const userRole = req.user!.role;

        // Check if user is an agent and should use buyer-signed forms
        if (userRole === "agent") {
          // First check for buyer-signed agreements that the agent should use
          const buyerSignedAgreements = agreements.filter(
            (a) =>
              a.type === "agency_disclosure" &&
              a.status === "signed_by_buyer" &&
              a.buyerSignature,
          );

          if (buyerSignedAgreements.length > 0) {
            const latestSignedAgreement =
              buyerSignedAgreements[buyerSignedAgreements.length - 1];

            console.log(
              "Agent user found buyer-signed agreement ID:",
              latestSignedAgreement.id,
            );

            try {
              // Get the PDF file path from document URL
              let pdfPath = "";
              if (
                latestSignedAgreement.documentUrl &&
                latestSignedAgreement.documentUrl.startsWith("/uploads/")
              ) {
                pdfPath = path.join(
                  process.cwd(),
                  latestSignedAgreement.documentUrl.substring(1),
                );
                console.log("Using buyer-signed document from path:", pdfPath);
              }

              let pdfBuffer;

              // Try to load the buyer-signed PDF if available
              if (pdfPath && fs.existsSync(pdfPath)) {
                try {
                  pdfBuffer = fs.readFileSync(pdfPath);
                  console.log(
                    "Successfully loaded buyer-signed PDF from file system",
                  );
                } catch (readError) {
                  console.error(
                    "Error reading buyer-signed PDF file:",
                    readError,
                  );
                  // Will fall back to generating from template
                }
              }

              // If we couldn't load from file or if file doesn't exist, generate a new one
              if (!pdfBuffer) {
                console.log(
                  "Generating from template with buyer's signature data",
                );

                // Get buyer information
                let buyer = null;
                if (latestSignedAgreement.buyerId) {
                  buyer = await storage.getUser(latestSignedAgreement.buyerId);
                }

                // Get agent information (current user)
                let agent = await storage.getUser(userId);

                // Prepare form data - pre-fill with buyer's info
                const formDataWithBuyerInfo = {
                  ...formData,
                  buyerName1: buyer
                    ? `${buyer.firstName || ""} ${buyer.lastName || ""}`.trim() ||
                      buyer.email
                    : "",
                  isEditable: true,
                };

                // Generate a fresh PDF with the form data
                pdfBuffer = await fillAgencyDisclosureForm(
                  formDataWithBuyerInfo,
                );

                // Add the buyer's signature from the agreement
                if (latestSignedAgreement.buyerSignature) {
                  pdfBuffer = await addSignatureToPdf(
                    pdfBuffer,
                    latestSignedAgreement.buyerSignature,
                    "buyer1",
                  );
                }
              }

              // Set appropriate headers
              res.setHeader("Content-Type", "application/pdf");
              res.setHeader(
                "Content-Disposition",
                `inline; filename="Agency_Disclosure_Preview.pdf"`,
              );

              if (isEditable) {
                console.log("Keeping form fields editable as requested");
                res.setHeader(
                  "Cache-Control",
                  "no-store, no-cache, must-revalidate, proxy-revalidate",
                );
                res.setHeader("Pragma", "no-cache");
                res.setHeader("Expires", "0");
                res.setHeader("X-PDF-Editable", "true");
              }

              // Send the PDF to the client
              return res.send(pdfBuffer);
            } catch (error) {
              console.error(
                "Error processing buyer-signed form for agent:",
                error,
              );
              // Continue to standard process if an error occurs
            }
          }
        }

        // If we're not an agent or couldn't process the buyer-signed agreement,
        // continue with the normal flow: check for edited PDF content
        const agencyDisclosureAgreements = agreements.filter(
          (a) =>
            a.type === "agency_disclosure" &&
            a.editedPdfContent !== null &&
            a.editedPdfContent !== undefined,
        );

        // If there's an existing agreement with edited PDF content, return it
        if (agencyDisclosureAgreements.length > 0) {
          const latestAgreement =
            agencyDisclosureAgreements[agencyDisclosureAgreements.length - 1];

          if (latestAgreement.editedPdfContent) {
            console.log(
              "Using edited PDF content from database for agreement ID:",
              latestAgreement.id,
            );

            let pdfBuffer = Buffer.from(
              latestAgreement.editedPdfContent,
              "base64",
            );

            // If the form should be editable, make sure to process the PDF to keep fields editable
            if (isEditable) {
              console.log(
                "Processing edited PDF to ensure fields remain editable",
              );

              // We need to use the existing PDF content but still apply form data
              const formDataWithEditableFlag = {
                ...formData,
                isEditable: true,
              };

              // Pass the existing PDF buffer to fillAgencyDisclosureForm
              pdfBuffer = await fillAgencyDisclosureForm(
                formDataWithEditableFlag,
                pdfBuffer,
              );
            }

            // Set appropriate headers
            res.setHeader("Content-Type", "application/pdf");
            res.setHeader(
              "Content-Disposition",
              `inline; filename="Agency_Disclosure_Preview.pdf"`,
            );

            if (isEditable) {
              console.log("Keeping form fields editable as requested");
              res.setHeader(
                "Cache-Control",
                "no-store, no-cache, must-revalidate, proxy-revalidate",
              );
              res.setHeader("Pragma", "no-cache");
              res.setHeader("Expires", "0");
              res.setHeader("X-PDF-Editable", "true");
            }

            // Send the previously saved PDF directly to the client
            return res.send(pdfBuffer);
          } else {
            console.log(
              "Agreement found but no edited PDF content in database for agreement ID:",
              latestAgreement.id,
            );
          }
        }

        // If no saved PDF content is found, generate a new one
        console.log(
          "No edited PDF content found in database, generating a new PDF from template",
        );

        // Add editable flag to form data
        const formDataWithEditableFlag = {
          ...formData,
          isEditable: isEditable,
        };

        // Generate the PDF with filled form data
        const pdfBuffer = await fillAgencyDisclosureForm(
          formDataWithEditableFlag,
        );

        // Set the appropriate headers for PDF display in browser or for download
        res.setHeader("Content-Type", "application/pdf");

        // Check if this is a download request
        const isDownload = req.query.download === "true";

        // Always use 'inline' for browser display to allow the PDF viewer to work properly
        // This enables both the native browser PDF viewer and editable functionality
        res.setHeader(
          "Content-Disposition",
          `inline; filename="Agency_Disclosure_Preview.pdf"`,
        );

        // Add additional headers to help with PDF browser compatibility
        // These headers hint to the browser not to cache the PDF which can help with editable PDFs
        if (isEditable) {
          // For editable PDFs, set cache control headers to prevent caching issues
          res.setHeader(
            "Cache-Control",
            "no-store, no-cache, must-revalidate, proxy-revalidate",
          );
          res.setHeader("Pragma", "no-cache");
          res.setHeader("Expires", "0");

          // Set custom header to indicate this is editable
          res.setHeader("X-PDF-Editable", "true");
        }

        // Send the PDF directly to the client
        res.send(pdfBuffer);
      } catch (error) {
        console.error("Error generating agency disclosure preview:", error);
        res.status(500).json({
          success: false,
          error: "Failed to generate agency disclosure preview",
        });
      }
    },
  );

  // Route to generate and save a California Agency Disclosure Form
  app.post(
    "/api/properties/:id/generate-agency-disclosure",
    isAuthenticated,
    async (req, res) => {
      try {
        const propertyId = parseInt(req.params.id);
        const {
          buyerName1,
          buyerSignature1,
          buyerSignatureDate1,
          agentSignature,
          agentSignatureDate,
          propertyAddress,
          propertyCity,
          propertyState,
          propertyZip,
          agentName,
          agentBrokerageName,
          agentLicenseNumber,
          isLeasehold,
          viewingRequestId,
        } = req.body;

        // Check if we have either buyer or agent signature
        if (
          !propertyId ||
          (!buyerSignature1 && !agentSignature) ||
          (!buyerSignatureDate1 && !agentSignatureDate)
        ) {
          return res.status(400).json({
            success: false,
            error:
              "Missing required fields - either buyer or agent must sign the form",
          });
        }

        const property = await storage.getProperty(propertyId);

        if (!property) {
          return res.status(404).json({
            success: false,
            error: "Property not found",
          });
        }

        // Create the form data object
        const formData = {
          buyerName1,
          buyerSignature1,
          buyerSignatureDate1,
          agentSignature,
          agentSignatureDate,
          propertyAddress: propertyAddress || property.address,
          propertyCity: propertyCity || property.city,
          propertyState: propertyState || property.state,
          propertyZip: propertyZip || property.zip,
          agentName,
          agentBrokerageName,
          agentLicenseNumber,
          isLeasehold: isLeasehold || false,
          isEditable: req.query.editable === "true", // Add support for editable PDFs
        };

        // Generate the PDF with filled form data
        let pdfBuffer = await fillAgencyDisclosureForm(formData);

        // Add the buyer signature to the PDF if provided
        if (buyerSignature1) {
          pdfBuffer = await addSignatureToPdf(
            pdfBuffer,
            buyerSignature1,
            "buyer1",
          );
        }

        // Add the agent signature to the PDF if provided
        if (agentSignature) {
          pdfBuffer = await addSignatureToPdf(
            pdfBuffer,
            agentSignature,
            "agent",
          );
        }

        // Save to disk
        const uniqueId = Date.now();
        const filename = `agency_disclosure_${propertyId}_${uniqueId}.pdf`;
        const filePath = path.join(
          process.cwd(),
          "uploads",
          "agreements",
          filename,
        );

        // Ensure the directory exists
        await fs.promises.mkdir(
          path.join(process.cwd(), "uploads", "agreements"),
          { recursive: true },
        );

        // Write the file
        await fs.promises.writeFile(filePath, pdfBuffer);

        // Create an agreement record
        const buyerId = req.user?.id;

        if (!buyerId) {
          return res.status(401).json({
            success: false,
            error: "User not authenticated",
          });
        }

        // Get the agent ID if a viewing request ID is provided
        let agentId: number;

        if (viewingRequestId) {
          const viewingRequest = await storage.getViewingRequest(
            parseInt(viewingRequestId),
          );
          if (viewingRequest && viewingRequest.buyerAgentId) {
            agentId = viewingRequest.buyerAgentId;
          } else {
            // Get first available agent if viewing request has no agent
            const agents = await storage.getUsersByRole("agent");
            if (agents.length > 0) {
              agentId = agents[0].id;
              console.log(
                `No agent found in viewing request, using agent ID ${agentId}`,
              );
            } else {
              // Use a system agent (admin) if no agents found
              const admin = await storage.getUserByEmail(
                "admin@realestateapp.com",
              );
              if (!admin) {
                return res
                  .status(500)
                  .json({ error: "No agent or admin found in the system" });
              }
              agentId = admin.id;
              console.log(
                `No agents found, using admin ID ${agentId} as fallback`,
              );
            }
          }
        } else {
          // Get the first available agent if no viewing request
          const agents = await storage.getUsersByRole("agent");
          if (agents.length > 0) {
            agentId = agents[0].id;
            console.log(
              `No viewing request provided, using agent ID ${agentId}`,
            );
          } else {
            // Use a system agent (admin) if no agents found
            const admin = await storage.getUserByEmail(
              "admin@realestateapp.com",
            );
            if (!admin) {
              return res
                .status(500)
                .json({ error: "No agent or admin found in the system" });
            }
            agentId = admin.id;
            console.log(
              `No agents found, using admin ID ${agentId} as fallback`,
            );
          }
        }

        // Check if there's already an agreement for this property and update it if so
        const existingAgreements =
          await storage.getAgreementsByProperty(propertyId);
        const agencyDisclosureAgreements = existingAgreements.filter(
          (a) => a.type === "agency_disclosure" && !a.sellerSignature, // Not yet signed by seller
        );

        let agreement;

        // Store the appropriate signatures based on who's signing
        const signatureData: {
          documentUrl: string;
          status: string;
          buyerSignature?: string;
          agentSignature?: string;
        } = {
          documentUrl: `/uploads/agreements/${filename}`,
          status: "pending", // Keep as pending to await seller review
        };

        // Add buyer or agent signature based on what was provided
        if (buyerSignature1) {
          signatureData.buyerSignature = buyerSignature1;
        }

        if (agentSignature) {
          signatureData.agentSignature = agentSignature;
        }

        if (agencyDisclosureAgreements.length > 0) {
          // Update the most recent agreement
          const mostRecentAgreement =
            agencyDisclosureAgreements[agencyDisclosureAgreements.length - 1];

          // Preserve existing signatures
          if (
            !signatureData.buyerSignature &&
            mostRecentAgreement.buyerSignature
          ) {
            signatureData.buyerSignature = mostRecentAgreement.buyerSignature;
          }

          if (
            !signatureData.agentSignature &&
            mostRecentAgreement.agentSignature
          ) {
            signatureData.agentSignature = mostRecentAgreement.agentSignature;
          }

          agreement = await storage.updateAgreement(mostRecentAgreement.id, {
            ...signatureData,
            agentId, // In case it wasn't set before
          });
          console.log(
            `Updated existing agreement ${mostRecentAgreement.id} with signatures`,
          );
        } else {
          // Create a new agreement if none exists
          agreement = await storage.createAgreement({
            propertyId,
            type: "agency_disclosure",
            agreementText: `California Agency Disclosure Form for property ${property.address}`,
            buyerId,
            agentId, // Now this will never be null
            ...signatureData,
            date: new Date(),
          });
          console.log(`Created new agreement ${agreement.id} with signatures`);
        }

        // If this is associated with a viewing request, update activity but keep it in pending status
        // so it can be sent to the seller after the agent signs
        if (viewingRequestId) {
          const viewingRequestId_num = parseInt(viewingRequestId);
          const viewingRequest =
            await storage.getViewingRequest(viewingRequestId_num);
          if (viewingRequest) {
            // Make sure the viewing request status stays as 'pending' if it was being auto-completed
            if (viewingRequest.status === "completed") {
              await storage.updateViewingRequest(viewingRequestId_num, {
                status: "pending",
              });
            }

            // Add activity log to indicate the agent has signed
            await storage.createPropertyActivityLog({
              propertyId,
              userId: buyerId,
              activity: "agency_disclosure_signed_by_agent",
              details: {
                viewingRequestId,
                agreementId: agreement.id,
                agreementType: "agency_disclosure",
                message:
                  "Agent has signed the disclosure form. Awaiting seller review.",
              },
              // timestamp is automatically added in the storage method
            });

            // Notify seller if available
            if (property.sellerId) {
              websocketServer.broadcastToUsers([property.sellerId], {
                type: "notification",
                data: {
                  message:
                    "The agent has signed the Agency Disclosure form. Please review.",
                  propertyId,
                  agreementId: agreement.id,
                },
              });
            }
          }
        }

        res.json({
          success: true,
          data: agreement,
        });
      } catch (error) {
        console.error("Error generating agency disclosure form:", error);
        res.status(500).json({
          success: false,
          error: "Failed to generate agency disclosure form",
        });
      }
    },
  );

  // Generate and handle agency disclosure forms (original endpoint)
  app.post(
    "/api/properties/:id/agency-disclosure",
    isAuthenticated,
    async (req, res) => {
      try {
        const propertyId = parseInt(req.params.id);
        const property = await storage.getPropertyWithParticipants(propertyId);

        if (!property) {
          return res.status(404).json({
            success: false,
            error: "Property not found",
          });
        }

        // Verify user has permission to access this property
        const userId = req.user!.id;
        const userRole = req.user!.role;

        const hasAccess =
          userRole === "admin" ||
          (userRole === "buyer" && property.createdBy === userId) ||
          (userRole === "agent" && property.agentId === userId) ||
          (userRole === "seller" && property.sellerId === userId);

        if (!hasAccess) {
          return res.status(403).json({
            success: false,
            error:
              "You don't have permission to create or sign agency disclosure forms for this property",
          });
        }

        // Get form data from request
        const formData = req.body;

        // Different processing depending on if this is a buyer or agent
        if (userRole === "buyer") {
          // Buyer is signing the form
          if (!formData.buyerSignature) {
            return res.status(400).json({
              success: false,
              error: "Buyer signature is required",
            });
          }

          try {
            // Get agent information
            let agent = null;
            if (property.agentId) {
              agent = await storage.getUser(property.agentId);
            }

            // Prepare form data
            const formDataForPdf: AgencyDisclosureFormData = {
              buyerName1:
                `${req.user!.firstName || ""} ${req.user!.lastName || ""}`.trim() ||
                req.user!.email,
              buyerSignature1: formData.buyerSignature,
              buyerSignatureDate1: new Date().toISOString().split("T")[0],
              propertyAddress: property.address,
              propertyCity: property.city || "",
              propertyState: property.state || "",
              propertyZip: property.zip || "",
              // Add agent info if available
              agentName: agent
                ? `${agent.firstName || ""} ${agent.lastName || ""}`.trim() ||
                  agent.email
                : "",
              agentBrokerageName: "Coldwell Banker Grass Roots Realty",
              agentLicenseNumber: "2244751", // Example license number
              isEditable: formData.isEditable === true, // Support for editable PDFs
            };

            // Fill the PDF form with data
            let pdfBuffer = await fillAgencyDisclosureForm(formDataForPdf);

            // Add buyer signature to the PDF
            if (formData.buyerSignature) {
              pdfBuffer = await addSignatureToPdf(
                pdfBuffer,
                formData.buyerSignature,
                "buyer1",
              );
            }

            // Generate a unique filename
            const timestamp = Date.now();
            const filename = `agency_disclosure_${propertyId}_${timestamp}.pdf`;
            const pdfPath = path.join(pdfDir, filename);

            // Save the PDF to disk
            fs.writeFileSync(pdfPath, pdfBuffer);

            // Create a URL for accessing the PDF
            const pdfUrl = `/uploads/pdf/${filename}`;

            // Create a log entry
            await storage.createPropertyActivityLog({
              propertyId,
              userId,
              activity: "Agency disclosure form signed by buyer",
              details: {
                buyerId: userId,
                date: new Date().toISOString(),
                pdfUrl,
              },
            });

            // If agent is assigned, notify them
            if (property.agentId) {
              websocketServer.broadcastToUsers([property.agentId], {
                type: "notification",
                data: {
                  message: "The buyer has signed the Agency Disclosure form.",
                  propertyId,
                  pdfUrl,
                },
              });
            }

            // Create or update an agreement record
            let agreement;
            const existingAgreements =
              await storage.getAgreementsByProperty(propertyId);
            const agencyDisclosureAgreement = existingAgreements.find(
              (a) =>
                a.type === "agency_disclosure" &&
                (a.status === "draft" || a.status === "pending_buyer"),
            );

            if (agencyDisclosureAgreement) {
              // Update existing agreement
              agreement = await storage.updateAgreement(
                agencyDisclosureAgreement.id,
                {
                  buyerSignature: formData.buyerSignature,
                  status: "signed_by_buyer", // Update status to indicate buyer has signed
                  documentUrl: pdfUrl,
                },
              );
            } else {
              // Create new agreement - ensure we have a valid agent ID
              let validAgentId: number;

              if (property.agentId) {
                validAgentId = property.agentId;
              } else {
                // Get first available agent if no agent assigned to property
                const agents = await storage.getUsersByRole("agent");
                if (agents.length > 0) {
                  validAgentId = agents[0].id;
                  console.log(
                    `No agent assigned to property, using agent ID ${validAgentId}`,
                  );
                } else {
                  // Use a system agent (admin) if no agents found
                  const admin = await storage.getUserByEmail(
                    "admin@realestateapp.com",
                  );
                  if (!admin) {
                    throw new Error("No agent or admin found in the system");
                  }
                  validAgentId = admin.id;
                  console.log(
                    `No agents found, using admin ID ${validAgentId} as fallback`,
                  );
                }
              }

              agreement = await storage.createAgreement({
                propertyId,
                agentId: validAgentId, // Now this will always be a valid ID
                buyerId: userId,
                type: "agency_disclosure",
                agreementText: `Agency Disclosure for ${property.address}`,
                buyerSignature: formData.buyerSignature,
                date: new Date(),
                status: "signed_by_buyer",
                documentUrl: pdfUrl,
              });
            }

            // Notify the seller if available
            if (property.sellerId) {
              websocketServer.broadcastToUsers([property.sellerId], {
                type: "notification",
                data: {
                  message:
                    "The buyer has signed the Agency Disclosure form. Please review and sign.",
                  propertyId,
                  agreementId: agreement.id,
                  pdfUrl,
                },
              });
            }

            // Return success with the PDF URL
            return res.status(200).json({
              success: true,
              data: {
                message: "Form signed successfully",
                fileUrl: pdfUrl,
                agreementId: agreement.id,
              },
            });
          } catch (pdfError) {
            console.error("Error generating PDF:", pdfError);
            return res.status(500).json({
              success: false,
              error: "Failed to generate PDF form",
            });
          }
        } else if (userRole === "agent") {
          // Agent is creating/preparing the form
          if (!formData.agentSignature) {
            return res.status(400).json({
              success: false,
              error: "Agent signature is required",
            });
          }

          // Generate a form PDF with the agent's signature
          try {
            // Prepare form data
            const formDataForPdf: AgencyDisclosureFormData = {
              buyerName1:
                property.buyer?.firstName && property.buyer?.lastName
                  ? `${property.buyer.firstName} ${property.buyer.lastName}`
                  : property.buyer?.email || "",
              agentName:
                `${req.user!.firstName || ""} ${req.user!.lastName || ""}`.trim() ||
                req.user!.email,
              agentBrokerageName: "Coldwell Banker Grass Roots Realty",
              agentLicenseNumber: "2244751", // Example license number
              agentSignature: formData.agentSignature,
              agentSignatureDate: new Date().toISOString().split("T")[0],
              propertyAddress: property.address,
              propertyCity: property.city || "",
              propertyState: property.state || "",
              propertyZip: property.zip || "",
              isEditable: formData.isEditable === true, // Support for editable PDFs
            };

            // Fill the PDF form with data
            let pdfBuffer = await fillAgencyDisclosureForm(formDataForPdf);

            // Add agent signature to the PDF
            if (formData.agentSignature) {
              pdfBuffer = await addSignatureToPdf(
                pdfBuffer,
                formData.agentSignature,
                "agent",
              );
            }

            // Generate a unique filename
            const timestamp = Date.now();
            const filename = `agency_disclosure_${propertyId}_${timestamp}.pdf`;
            const pdfPath = path.join(pdfDir, filename);

            // Save the PDF to disk
            fs.writeFileSync(pdfPath, pdfBuffer);

            // Create a URL for accessing the PDF
            const pdfUrl = `/uploads/pdf/${filename}`;

            // Log the activity
            await storage.createPropertyActivityLog({
              propertyId,
              userId,
              activity: "Agency disclosure form prepared by agent",
              details: {
                agentId: userId,
                date: new Date().toISOString(),
                pdfUrl,
              },
            });

            // Notify the buyer if available
            if (property.createdBy) {
              websocketServer.broadcastToUsers([property.createdBy], {
                type: "notification",
                data: {
                  message:
                    "Your agent has prepared the Agency Disclosure form for your signature.",
                  propertyId,
                },
              });
            }

            // Return success with the PDF URL
            return res.status(200).json({
              success: true,
              data: {
                message: "Form created successfully",
                pdfUrl,
              },
            });
          } catch (pdfError) {
            console.error("Error generating PDF:", pdfError);
            return res.status(500).json({
              success: false,
              error: "Failed to generate PDF form",
            });
          }
        } else if (userRole === "seller") {
          // Seller is signing the form
          if (!formData.sellerSignature) {
            return res.status(400).json({
              success: false,
              error: "Seller signature is required",
            });
          }

          // Seller can only sign if property belongs to them
          if (property.sellerId !== userId) {
            return res.status(403).json({
              success: false,
              error: "You are not authorized to sign this form as the seller",
            });
          }

          try {
            // Get the latest agreement that the buyer has signed
            const agreements =
              await storage.getAgreementsByProperty(propertyId);
            const buyerSignedAgreement = agreements.find(
              (a) =>
                a.type === "agency_disclosure" &&
                a.status === "signed_by_buyer" &&
                a.buyerSignature,
            );

            if (!buyerSignedAgreement) {
              return res.status(400).json({
                success: false,
                error:
                  "No buyer-signed agreement found. The buyer must sign first.",
              });
            }

            // Get agent information
            let agent = null;
            if (property.agentId) {
              agent = await storage.getUser(property.agentId);
            }

            // Get buyer information
            let buyer = null;
            if (buyerSignedAgreement.buyerId) {
              buyer = await storage.getUser(buyerSignedAgreement.buyerId);
            }

            // Prepare form data
            const formDataForPdf: AgencyDisclosureFormData = {
              // Maintain existing buyer and agent data from the agreement
              buyerName1: buyer
                ? `${buyer.firstName || ""} ${buyer.lastName || ""}`.trim() ||
                  buyer.email
                : "",
              agentName: agent
                ? `${agent.firstName || ""} ${agent.lastName || ""}`.trim() ||
                  agent.email
                : "",
              agentBrokerageName: "Coldwell Banker Grass Roots Realty",
              agentLicenseNumber: "2244751", // Example license number
              propertyAddress: property.address,
              propertyCity: property.city || "",
              propertyState: property.state || "",
              propertyZip: property.zip || "",
              // Add seller information
              sellerName1:
                `${req.user!.firstName || ""} ${req.user!.lastName || ""}`.trim() ||
                req.user!.email,
              sellerSignature1: formData.sellerSignature,
              sellerSignatureDate1: new Date().toISOString().split("T")[0],
              // Support for editable PDFs
              isEditable: formData.isEditable === true,
            };

            // Get the existing PDF file path if available
            let pdfUrl = buyerSignedAgreement.documentUrl || "";
            let pdfPath = "";

            if (pdfUrl && pdfUrl.startsWith("/uploads/")) {
              // Convert URL to filesystem path
              pdfPath = path.join(process.cwd(), pdfUrl.substring(1));
            } else {
              // If no existing file, use the template
              pdfPath = path.join(process.cwd(), "uploads", "pdf", "brbc.pdf");
            }

            // Load the existing PDF or template
            let pdfBuffer;
            try {
              pdfBuffer = fs.readFileSync(pdfPath);
            } catch (readError) {
              console.error("Error reading PDF:", readError);
              // Fallback to template
              pdfBuffer = fs.readFileSync(
                path.join(process.cwd(), "uploads", "pdf", "brbc.pdf"),
              );
            }

            // Fill the PDF form with data
            pdfBuffer = await fillAgencyDisclosureForm(formDataForPdf);

            // Add the buyer signature that was already there
            if (buyerSignedAgreement.buyerSignature) {
              pdfBuffer = await addSignatureToPdf(
                pdfBuffer,
                buyerSignedAgreement.buyerSignature,
                "buyer1",
              );
            }

            // Add the agent signature if it exists
            if (buyerSignedAgreement.agentSignature) {
              pdfBuffer = await addSignatureToPdf(
                pdfBuffer,
                buyerSignedAgreement.agentSignature,
                "agent",
              );
            }

            // Add seller signature to the PDF
            if (formData.sellerSignature) {
              pdfBuffer = await addSignatureToPdf(
                pdfBuffer,
                formData.sellerSignature,
                "seller1",
              );
            }

            // Generate a unique filename
            const timestamp = Date.now();
            const filename = `agency_disclosure_${propertyId}_${timestamp}.pdf`;
            const newPdfPath = path.join(
              process.cwd(),
              "uploads",
              "pdf",
              filename,
            );

            // Save the PDF to disk
            fs.writeFileSync(newPdfPath, pdfBuffer);

            // Create a URL for accessing the PDF
            pdfUrl = `/uploads/pdf/${filename}`;

            // Update the agreement record
            await storage.updateAgreement(buyerSignedAgreement.id, {
              sellerSignature: formData.sellerSignature,
              status: "completed",
              documentUrl: pdfUrl,
            });

            // Log the activity
            await storage.createPropertyActivityLog({
              propertyId,
              userId,
              activity: "Agency disclosure form signed by seller",
              details: {
                sellerId: userId,
                date: new Date().toISOString(),
                agreementId: buyerSignedAgreement.id,
                pdfUrl,
              },
            });

            // Notify the buyer and agent
            const notifyUsers = [];
            if (buyer) notifyUsers.push(buyer.id);
            if (agent) notifyUsers.push(agent.id);

            if (notifyUsers.length > 0) {
              websocketServer.broadcastToUsers(notifyUsers, {
                type: "notification",
                data: {
                  message:
                    "The seller has signed the Agency Disclosure form. The form is now complete.",
                  propertyId,
                  agreementId: buyerSignedAgreement.id,
                  pdfUrl,
                },
              });
            }

            // Return success with the PDF URL
            return res.status(200).json({
              success: true,
              data: {
                message: "Form signed by seller successfully",
                fileUrl: pdfUrl,
                agreementId: buyerSignedAgreement.id,
              },
            });
          } catch (pdfError) {
            console.error("Error processing seller signature:", pdfError);
            return res.status(500).json({
              success: false,
              error: "Failed to process seller signature",
            });
          }
        } else {
          // Only buyers, sellers, and agents can interact with this form
          return res.status(403).json({
            success: false,
            error:
              "Only buyers, sellers, and agents can access this functionality",
          });
        }
      } catch (error) {
        console.error("Agency disclosure form error:", error);
        res.status(500).json({
          success: false,
          error:
            error instanceof Error
              ? error.message
              : "Failed to process agency disclosure form",
        });
      }
    },
  );

  // Viewing Request Routes

  // Create a viewing request
  app.post(
    "/api/viewing-requests",
    isAuthenticated,
    hasRole(["buyer", "admin"]),
    async (req, res) => {
      try {
        console.log("Viewing request payload:", req.body);

        // Add buyer ID explicitly
        const mergedData = {
          ...req.body,
          buyerId: req.user!.id,
        };

        console.log("Merged request data before validation:", mergedData);

        // We'll validate the data more manually to better handle errors
        if (!mergedData.propertyId) {
          return res.status(400).json({
            success: false,
            error: "Property ID is required",
          });
        }

        // Convert string dates to Date objects with validation
        const requestedDate = new Date(mergedData.requestedDate);
        
        // Validate that the dates are valid
        if (isNaN(requestedDate.getTime()) ) {
          return res.status(400).json({
            success: false,
            error: "Invalid date format. Please provide valid dates.",
          });
        }
        
        const requestData = {
          ...mergedData,
          requestedDate,
        };

        console.log("Processed request data:", requestData);

        // Get the property
        const property = await storage.getProperty(requestData.propertyId);
        console.log("Found property:", property);

        if (!property) {
          return res.status(404).json({
            success: false,
            error: "Property not found",
          });
        }

        // Buyer should be able to view any listed property, so we don't need to check if they created it
        // Just ensure the property is in a status that allows viewing requests
        if (property.status !== "active" && property.status !== "pending") {
          return res.status(403).json({
            success: false,
            error: "This property is not available for viewing requests",
          });
        }

        // Make sure the property has a seller and/or agent to review the request
        if (!property.sellerId && !property.agentId) {
          return res.status(403).json({
            success: false,
            error: "This property doesn't have a seller or agent assigned yet",
          });
        }

        // If the property has an agent, verify that the buyer has signed a BRBC with this agent
        if (property.agentId) {
          // BRBC check removed - no longer required
          // Note: Keeping code commented for reference
          /*
          const globalBrbc = await storage.getGlobalBRBCForBuyerAgent(
            req.user!.id,
            property.agentId,
          );

          if (
            !globalBrbc ||
            (globalBrbc.status !== "completed" &&
              globalBrbc.status !== "signed_by_buyer")
          ) {
            return res.status(403).json({
              success: false,
              error:
                "You must sign a Buyer Representation and Brokerage Confirmation (BRBC) with this agent before requesting a viewing",
              requiresBrbc: true,
              agentId: property.agentId,
            });
          }
          */
        }

        // Allow multiple viewing requests from the same buyer
        // Only handle explicit override requests
        if (requestData.override) {
          // Get the most recent viewing request for this property by this buyer
          const existingRequests = await storage.getViewingRequestsByBuyer(
            req.user!.id,
          );
          const existingRequestForProperty = existingRequests.find(
            (request) =>
              request.propertyId === requestData.propertyId &&
              (request.status === "pending" ||
                request.status === "approved" ||
                request.status === "rescheduled"),
          );

          if (existingRequestForProperty) {
            // Update the existing request to be canceled
            await storage.updateViewingRequest(existingRequestForProperty.id, {
              status: "canceled",
              notes: existingRequestForProperty.notes
                ? `${existingRequestForProperty.notes} [Canceled and replaced with a new request]`
                : "[Canceled and replaced with a new request]",
            });

            // Log the cancellation
            await storage.createPropertyActivityLog({
              propertyId: requestData.propertyId,
              userId: req.user!.id,
              activity: "Viewing request canceled and replaced",
              details: {
                oldRequestId: existingRequestForProperty.id,
                oldRequestDate: existingRequestForProperty.requestedDate,
              },
            });
          }
        }

        // Ensure the buyer's agent is assigned to the viewing request
        const requestDataWithAgent = { ...requestData };
        if (property.agentId) {
          requestDataWithAgent.buyerAgentId = property.agentId;
        }

        // Create the viewing request
        const viewingRequest =
          await storage.createViewingRequest(requestDataWithAgent);

        // Generate a public link for the viewing request (similar to Calendly)
        const publicViewingLink = await getPublicViewingRequestLink(
          viewingRequest.id,
        );

        // Log the activity
        try {
          await storage.createPropertyActivityLog({
            propertyId: property.id,
            userId: req.user!.id,
            activity: "Viewing requested",
            details: {
              requestId: viewingRequest.id,
              requestedDate: viewingRequest.requestedDate,
              agentId: property.agentId,
              publicViewingLink: publicViewingLink,
            },
          });
        } catch (logError) {
          console.error(
            "Failed to create activity log for viewing request:",
            logError,
          );
          // Continue without failing the whole request
        }

        // Send WebSocket notifications
        const notifyUserIds = [req.user!.id]; // Notify the buyer

        // Notify the buyer's agent if assigned
        if (property.agentId) {
          notifyUserIds.push(property.agentId);

          // Create a special message for the agent to fill out the disclosure form
          websocketServer.broadcastToUsers([property.agentId], {
            type: "notification",
            data: {
              message:
                "A buyer has requested a viewing. Please prepare the Real Estate Agency Disclosure form.",
              propertyId: property.id,
              viewingRequestId: viewingRequest.id,
              requiresDisclosure: true,
            },
          });
        }

        // Notify the seller's agent if assigned
        if (
          viewingRequest.sellerAgentId &&
          viewingRequest.sellerAgentId !== property.agentId
        ) {
          notifyUserIds.push(viewingRequest.sellerAgentId);
        }

        // Notify the seller if assigned
        if (property.sellerId) {
          notifyUserIds.push(property.sellerId);
        }

        // Send general notification to all users involved
        websocketServer.broadcastToUsers(notifyUserIds, {
          type: "notification",
          data: {
            message: "A new viewing has been requested",
            propertyId: property.id,
            viewingRequestId: viewingRequest.id,
            publicViewingLink: publicViewingLink,
          },
        });

        // Send email notification to the listing agent
        try {
          // Get buyer data
          const buyer = await storage.getUser(req.user!.id);

          // Get buyer's agent data (if assigned)
          let agent = undefined;
          if (property.agentId) {
            agent = await storage.getUser(property.agentId);
          }

          // Determine the listing agent's email
          const listingAgentEmail =
            property.listingAgentEmail || property.sellerEmail;

          const listingAgentName =
            property.listingAgentName || property.sellerName;

          console.log(
            "------------------Listing agent email:",
            JSON.stringify(property),
          );

          if (buyer && listingAgentEmail) {
            // Add the public link to the viewing request for the email
            const viewingRequestWithLink = {
              ...viewingRequest,
              publicViewingLink,
            };

            console.log("-------------publicViewingLink:" + publicViewingLink);

            // Send the email notification with public link
            await sendTourRequestEmail(
              viewingRequestWithLink, // Use the enhanced object with public link
              property,
              buyer,
              agent,
              listingAgentEmail,
              listingAgentName,
              publicViewingLink,
            );

            console.log(
              `Sent tour request notification email with public link to: ${listingAgentEmail}`,
            );
          } else {
            console.warn(
              "Could not send tour request email - missing buyer or listing agent email",
            );
          }
        } catch (emailError) {
          console.error(
            "Failed to send tour request email notification:",
            emailError,
          );
          // Continue without failing the whole request
        }

        res.status(201).json({
          success: true,
          data: {
            ...viewingRequest,
            publicViewingLink,
          },
        });
      } catch (error) {
        console.error("Create viewing request error:", error);
        res.status(400).json({
          success: false,
          error: error instanceof Error ? error.message : "Invalid data",
        });
      }
    },
  );

  // Get all viewing requests for a property
  app.get(
    "/api/properties/:id/viewing-requests",
    isAuthenticated,
    async (req, res) => {
      try {
        const propertyId = parseInt(req.params.id);
        console.log(`Getting viewing requests for property ${propertyId}`);

        const property = await storage.getProperty(propertyId);

        if (!property) {
          console.log(`Property ${propertyId} not found`);
          return res.status(404).json({
            success: false,
            error: "Property not found",
          });
        }

        // Check if user has access to this property
        const userId = req.user!.id;
        const role = req.user!.role;

        const hasAccess =
          role === "admin" ||
          role === "buyer" || // Any buyer can see viewing requests for a property
          (role === "seller" && property.sellerId === userId) ||
          (role === "agent" && property.agentId === userId);

        if (!hasAccess) {
          console.log(
            `User ${userId} with role ${role} does not have access to viewing requests for property ${propertyId}`,
          );
          return res.status(403).json({
            success: false,
            error:
              "You don't have access to viewing requests for this property",
          });
        }

        // Get the viewing requests with participant information
        const baseRequests =
          await storage.getViewingRequestsByProperty(propertyId);
        console.log(
          `Found ${baseRequests.length} viewing requests for property ${propertyId}`,
          baseRequests,
        );

        const viewingRequests = await Promise.all(
          baseRequests.map(async (request) => {
            let buyer = undefined;
            if (request.buyerId) {
              buyer = await storage.getUser(request.buyerId);
            }

            let agent = undefined;
            if (request.buyerAgentId) {
              agent = await storage.getUser(request.buyerAgentId);
            }

            // Generate public viewing link for each request
            const publicViewingLink = await getPublicViewingRequestLink(
              request.id,
            );

            return {
              ...request,
              buyer,
              agent,
              publicViewingLink,
            } as ViewingRequestWithParticipants;
          }),
        );

        console.log(`Processed viewing requests:`, viewingRequests);
        res.json(viewingRequests);
      } catch (error) {
        console.error("Get viewing requests error:", error);
        res.status(500).json({
          success: false,
          error: "Failed to fetch viewing requests",
        });
      }
    },
  );

  // Get viewing requests for the current buyer
  app.get(
    "/api/viewing-requests/buyer",
    isAuthenticated,
    hasRole(["buyer", "admin"]),
    async (req, res) => {
      try {
        const viewingRequests = await storage.getViewingRequestsByBuyer(
          req.user!.id,
        );

        // For each viewing request, get the full property and agent details
        const enhancedRequests = await Promise.all(
          viewingRequests.map(async (request) => {
            const property = await storage.getProperty(request.propertyId);
            const agent = request.buyerAgentId
              ? await storage.getUser(request.buyerAgentId)
              : request.sellerAgentId
                ? await storage.getUser(request.sellerAgentId)
                : undefined;

            // Generate public viewing link
            const publicViewingLink = await getPublicViewingRequestLink(
              request.id,
            );

            return {
              ...request,
              property,
              agent,
              publicViewingLink,
            };
          }),
        );

        res.json(enhancedRequests);
      } catch (error) {
        console.error("Get buyer viewing requests error:", error);
        res.status(500).json({
          success: false,
          error: "Failed to fetch viewing requests",
        });
      }
    },
  );

  // Get viewing requests for the current agent
  app.get(
    "/api/viewing-requests/agent",
    isAuthenticated,
    hasRole(["agent"]),
    async (req, res) => {
      try {
        const viewingRequests = await storage.getViewingRequestsByAgent(
          req.user!.id,
        );
        const agent = await storage.getUser(req.user!.id);

        // For each viewing request, get the full property and buyer details
        const enhancedRequests = await Promise.all(
          viewingRequests.map(async (request) => {
            const property = await storage.getProperty(request.propertyId);
            const buyer = request.buyerId
              ? await storage.getUser(request.buyerId)
              : undefined;

            // Include the agent information to fix the missing agent data issue
            // Generate public viewing link
            const publicViewingLink = await getPublicViewingRequestLink(
              request.id,
            );

            return {
              ...request,
              property,
              buyer,
              agent,
              publicViewingLink,
            };
          }),
        );

        console.log(
          "Enhanced agent viewing requests:",
          JSON.stringify(enhancedRequests, null, 2).substring(0, 500) + "...",
        );
        res.json(enhancedRequests);
      } catch (error) {
        console.error("Get agent viewing requests error:", error);
        res.status(500).json({
          success: false,
          error: "Failed to fetch viewing requests",
        });
      }
    },
  );

  // Get a specific viewing request with participants
  app.get("/api/viewing-requests/:id", isAuthenticated, async (req, res) => {
    try {
      const requestId = parseInt(req.params.id);
      const viewingRequest =
        await storage.getViewingRequestWithParticipants(requestId);

      if (!viewingRequest) {
        return res.status(404).json({
          success: false,
          error: "Viewing request not found",
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
          error: "Property not found",
        });
      }

      const hasAccess =
        role === "admin" ||
        (role === "buyer" && viewingRequest.buyerId === userId) ||
        (role === "seller" && property.sellerId === userId) ||
        (role === "agent" &&
          (viewingRequest.buyerAgentId === userId ||
            viewingRequest.sellerAgentId === userId ||
            property.agentId === userId));

      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          error: "You don't have access to this viewing request",
        });
      }

      res.json(viewingRequest);
    } catch (error) {
      console.error("Get viewing request error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch viewing request",
      });
    }
  });

  // Update a viewing request (accept, reject, reschedule)
  app.patch("/api/viewing-requests/:id", isAuthenticated, async (req, res) => {
    try {
      const requestId = parseInt(req.params.id);
      const viewingRequest = await storage.getViewingRequest(requestId);

      if (!viewingRequest) {
        return res.status(404).json({
          success: false,
          error: "Viewing request not found",
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
          error: "Property not found",
        });
      }

      const isAgent =
        role === "agent" &&
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
          error: "You don't have permission to update this viewing request",
        });
      }

      // Parse the update data
      const { status, confirmedDate, responseMessage } =
        req.body;

      // Validate the status
      if (
        status &&
        ![
          "pending",
          "accepted",
          "rejected",
          "rescheduled",
          "completed",
          "cancelled",
        ].includes(status)
      ) {
        return res.status(400).json({
          success: false,
          error: "Invalid status value",
        });
      }

      // Create update data object
      const updateData: Partial<ViewingRequest> = {};
      if (status) updateData.status = status;
      if (confirmedDate) updateData.confirmedDate = new Date(confirmedDate);
      if (responseMessage) updateData.responseMessage = responseMessage;

      // If accepting or rescheduling, record who confirmed
      if (["accepted", "rescheduled"].includes(status)) {
        updateData.confirmedById = userId;
      }

      // Update the viewing request
      const updatedRequest = await storage.updateViewingRequest(
        requestId,
        updateData,
      );

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
              role: role,
            },
          },
        });
      } catch (logError) {
        console.error(
          "Failed to create activity log for viewing request update:",
          logError,
        );
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
        type: "property_update",
        data: {
          propertyId: property.id,
          viewingRequestId: updatedRequest.id,
          action: "viewing_request_updated",
          status: updatedRequest.status,
          message: `Viewing request has been ${updatedRequest.status}`,
        },
      });

      res.json({
        success: true,
        data: updatedRequest,
      });
    } catch (error) {
      console.error("Update viewing request error:", error);
      res.status(500).json({
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to update viewing request",
      });
    }
  });

  // Delete a viewing request
  app.delete("/api/viewing-requests/:id", isAuthenticated, async (req, res) => {
    try {
      const requestId = parseInt(req.params.id);
      const viewingRequest = await storage.getViewingRequest(requestId);

      if (!viewingRequest) {
        return res.status(404).json({
          success: false,
          error: "Viewing request not found",
        });
      }

      // Check if user has permission to delete this viewing request
      const userId = req.user!.id;
      const role = req.user!.role;

      // Only the buyer who created the request or an admin can delete it
      const isBuyer = role === "buyer" && viewingRequest.buyerId === userId;
      const isAdmin = role === "admin";

      if (!(isBuyer || isAdmin)) {
        return res.status(403).json({
          success: false,
          error: "You don't have permission to delete this viewing request",
        });
      }

      // Update the request status to cancelled instead of actually deleting it
      // This preserves the history and allows for better tracking
      const updatedRequest = await storage.updateViewingRequest(requestId, {
        status: "cancelled",
        updatedAt: new Date(),
      });

      // Get the property to include in notifications
      const property = await storage.getProperty(viewingRequest.propertyId);
      if (!property) {
        return res.status(404).json({
          success: false,
          error: "Property not found",
        });
      }

      // Log the activity
      try {
        await storage.createPropertyActivityLog({
          propertyId: property.id,
          userId: userId,
          activity: "Viewing request cancelled",
          details: {
            requestId: viewingRequest.id,
            cancelledBy: {
              id: userId,
              role: role,
            },
          },
        });
      } catch (logError) {
        console.error(
          "Failed to create activity log for viewing request deletion:",
          logError,
        );
        // Continue without failing the whole request
      }

      // Send WebSocket notifications
      const notifyUserIds: number[] = [];

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

      if (notifyUserIds.length > 0) {
        websocketServer.broadcastToUsers(notifyUserIds, {
          type: "property_update",
          data: {
            propertyId: property.id,
            viewingRequestId: viewingRequest.id,
            action: "viewing_request_cancelled",
            status: "cancelled",
            message: `Viewing request #${viewingRequest.id} has been cancelled by the buyer`,
          },
        });
      }

      res.json({
        success: true,
        message: "Viewing request cancelled successfully",
      });
    } catch (error) {
      console.error("Delete viewing request error:", error);
      res.status(500).json({
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to delete viewing request",
      });
    }
  });

  // Agent approval endpoints for viewing requests
  // Seller's agent approval
  app.patch("/api/viewing-requests/:id/seller-agent-approval", isAuthenticated, hasRole(["agent", "admin"]), async (req, res) => {
    try {
      const requestId = parseInt(req.params.id);
      const { approvalStatus } = req.body;
      
      if (!["approved", "rejected"].includes(approvalStatus)) {
        return res.status(400).json({
          success: false,
          error: "Invalid approval status. Must be 'approved' or 'rejected'"
        });
      }

      const viewingRequest = await storage.getViewingRequest(requestId);
      if (!viewingRequest) {
        return res.status(404).json({
          success: false,
          error: "Viewing request not found"
        });
      }

      // Get the property to determine if user is authorized
      const property = await storage.getProperty(viewingRequest.propertyId);
      if (!property) {
        return res.status(404).json({
          success: false,
          error: "Property not found"
        });
      }

      // Check if user is authorized (seller's agent or admin)
      const userId = req.user!.id;
      const role = req.user!.role;
      const isAuthorized = role === "admin" || 
                          (role === "agent" && (property.agentId === userId || viewingRequest.sellerAgentId === userId));

      if (!isAuthorized) {
        return res.status(403).json({
          success: false,
          error: "You don't have permission to approve this viewing request as seller's agent"
        });
      }

      // Update the viewing request
      const updatedRequest = await storage.updateViewingRequest(requestId, {
        sellerAgentApprovalStatus: approvalStatus,
        sellerAgentApprovedById: userId,
        sellerAgentApprovalDate: new Date(),
        sellerAgentApprovalSource: "agent_dashboard",
        updatedAt: new Date()
      });

      // Send WebSocket notification
      const notifyUserIds = [viewingRequest.buyerId];
      if (viewingRequest.buyerAgentId) {
        notifyUserIds.push(viewingRequest.buyerAgentId);
      }

      websocketServer.broadcastToUsers(notifyUserIds, {
        type: "viewing_request_approval",
        data: {
          requestId: requestId,
          approvalType: "seller_agent",
          status: approvalStatus,
          message: `Seller's agent has ${approvalStatus} the viewing request`
        }
      });

      res.json({
        success: true,
        data: updatedRequest
      });
    } catch (error) {
      console.error("Seller agent approval error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to update seller agent approval"
      });
    }
  });

  // Buyer's agent approval
  app.patch("/api/viewing-requests/:id/buyer-agent-approval", isAuthenticated, hasRole(["agent", "admin"]), async (req, res) => {
    try {
      const requestId = parseInt(req.params.id);
      const { approvalStatus } = req.body;
      
      if (!["approved", "rejected"].includes(approvalStatus)) {
        return res.status(400).json({
          success: false,
          error: "Invalid approval status. Must be 'approved' or 'rejected'"
        });
      }

      const viewingRequest = await storage.getViewingRequest(requestId);
      if (!viewingRequest) {
        return res.status(404).json({
          success: false,
          error: "Viewing request not found"
        });
      }

      // Check if user is authorized (buyer's agent or admin)
      const userId = req.user!.id;
      const role = req.user!.role;
      const isAuthorized = role === "admin" || 
                          (role === "agent" && viewingRequest.buyerAgentId === userId);

      if (!isAuthorized) {
        return res.status(403).json({
          success: false,
          error: "You don't have permission to approve this viewing request as buyer's agent"
        });
      }

      // Update the viewing request
      const updatedRequest = await storage.updateViewingRequest(requestId, {
        buyerAgentApprovalStatus: approvalStatus,
        buyerAgentApprovedById: userId,
        buyerAgentApprovalDate: new Date(),
        buyerAgentApprovalSource: "agent_dashboard",
        updatedAt: new Date()
      });

      // Send WebSocket notification
      const notifyUserIds = [viewingRequest.buyerId];
      if (viewingRequest.sellerAgentId) {
        notifyUserIds.push(viewingRequest.sellerAgentId);
      }

      websocketServer.broadcastToUsers(notifyUserIds, {
        type: "viewing_request_approval",
        data: {
          requestId: requestId,
          approvalType: "buyer_agent",
          status: approvalStatus,
          message: `Buyer's agent has ${approvalStatus} the viewing request`
        }
      });

      res.json({
        success: true,
        data: updatedRequest
      });
    } catch (error) {
      console.error("Buyer agent approval error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to update buyer agent approval"
      });
    }
  });

  // Agent Referral Agreement routes
  // Get agent referral agreement
  app.get(
    "/api/agreements/agent-referral",
    isAuthenticated,
    hasRole(["agent"]),
    async (req, res) => {
      try {
        // Find if the agent already has a referral agreement
        const existingAgreements = await storage.getAgreementsByAgent(
          req.user.id,
        );
        const referralAgreements = existingAgreements.filter(
          (a) => a.type === "agent_referral",
        );

        if (referralAgreements.length > 0) {
          // Return the most recent agreement
          const latestAgreement =
            referralAgreements[referralAgreements.length - 1];

          return res.json({
            success: true,
            data: {
              id: latestAgreement.id,
              status: latestAgreement.status,
              documentUrl: latestAgreement.documentUrl,
              date: latestAgreement.date,
            },
          });
        }

        // No agreement found
        return res.json({
          success: true,
          data: null,
        });
      } catch (error) {
        console.error("Error fetching agent referral agreement:", error);
        res.status(500).json({
          success: false,
          error: "Failed to retrieve agent referral agreement",
        });
      }
    },
  );

  // Get prefilled agent referral agreement PDF
  app.get(
    "/api/agreements/agent-referral/pdf",
    isAuthenticated,
    hasRole(["agent"]),
    async (req, res) => {
      try {
        // Get the current agent
        const agent = await storage.getUser(req.user.id);

        if (!agent) {
          return res.status(404).json({
            success: false,
            error: "Agent not found",
          });
        }

        // Prepare the PDF data with agent's information
        const formData = {
          agentName:
            `${agent.firstName || ""} ${agent.lastName || ""}`.trim() ||
            agent.email,
          licenseNumber: agent.licenseNumber || "",
          address: agent.addressLine1 || "",
          city: agent.city || "",
          state: agent.state || "",
          zip: agent.zip || "",
          date: new Date().toISOString().split("T")[0],
          isEditable: true, // Keep it editable for signing
          brokerageName: agent.brokerageName || "",
          phoneNumber: agent.phone || "",
          email: agent.email || "",
        };

        // Generate the PDF with agent data pre-filled
        const pdfBuffer = await fillAgentReferralForm(formData);

        // Set response headers
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader(
          "Content-Disposition",
          'inline; filename="agent_referral_agreement.pdf"',
        );

        // Send PDF as response
        res.send(pdfBuffer);
      } catch (error) {
        console.error("Error generating agent referral agreement PDF:", error);
        res.status(500).json({
          success: false,
          error: "Failed to generate agent referral agreement PDF",
        });
      }
    },
  );

  // Preview agent referral agreement
  app.post(
    "/api/agreements/agent-referral/preview",
    isAuthenticated,
    hasRole(["agent"]),
    async (req, res) => {
      try {
        const {
          agentName,
          licenseNumber,
          address,
          city,
          state,
          zip,
          signature: agentSignature,
          date,
          // New fields
          brokerageName,
          phoneNumber,
          email,
        } = req.body;

        if (!agentSignature) {
          return res.status(400).json({
            success: false,
            error: "Agent signature is required",
          });
        }

        // Get the current agent for fallback values
        const agent = await storage.getUser(req.user!.id);

        // Prepare the PDF document with form data
        const formData = {
          agentName:
            agentName ||
            `${agent!.firstName || ""} ${agent!.lastName || ""}`.trim() ||
            agent!.email,
          licenseNumber: licenseNumber || agent?.licenseNumber || "",
          address: address || agent?.addressLine1 || "",
          city: city || agent?.city || "",
          state: state || agent?.state || "",
          zip: zip || agent?.zip || "",
          agentSignature,
          date: date || new Date().toISOString().split("T")[0],
          isEditable: false,
          // Add the new fields with fallbacks
          brokerageName: brokerageName || agent?.brokerageName || "",
          phoneNumber: phoneNumber || agent?.phone || "",
          email: email || agent?.email || "",
        };

        // Generate the PDF with agent data
        const pdfBuffer = await fillAgentReferralForm(formData);

        // Add signature to PDF
        const signedPdfBuffer = await addSignatureToPdf(
          pdfBuffer,
          agentSignature,
          "agent",
        );

        // Set response headers
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader(
          "Content-Disposition",
          'inline; filename="agent_referral_agreement_preview.pdf"',
        );

        // Send PDF as response
        res.send(signedPdfBuffer);
      } catch (error) {
        console.error(
          "Error generating preview for agent referral agreement:",
          error,
        );
        res.status(500).json({
          success: false,
          error: "Failed to generate preview for agent referral agreement",
        });
      }
    },
  );

  // Submit agent referral agreement
  app.post(
    "/api/agreements/agent-referral",
    isAuthenticated,
    hasRole(["agent"]),
    async (req, res) => {
      try {
        const { signature: agentSignature, date } = req.body;

        if (!agentSignature) {
          return res.status(400).json({
            success: false,
            error: "Agent signature is required",
          });
        }

        // Get the current agent
        const agent = await storage.getUser(req.user.id);

        if (!agent) {
          return res.status(404).json({
            success: false,
            error: "Agent not found",
          });
        }

        // Find if the agent already has a referral agreement
        const existingAgreements = await storage.getAgreementsByAgent(
          req.user.id,
        );
        const referralAgreements = existingAgreements.filter(
          (a) => a.type === "agent_referral",
        );

        // If agreement exists, just update it
        if (referralAgreements.length > 0) {
          const latestAgreement =
            referralAgreements[referralAgreements.length - 1];
          return res.json({
            success: true,
            data: {
              id: latestAgreement.id,
              status: latestAgreement.status,
              documentUrl: latestAgreement.documentUrl,
              date: latestAgreement.date,
            },
          });
        }

        // Create a new agreement
        // Prepare the PDF document with agent's data from their profile
        const formData = {
          agentName:
            `${agent.firstName || ""} ${agent.lastName || ""}`.trim() ||
            agent.email,
          licenseNumber: agent.licenseNumber || "",
          address: agent.addressLine1 || "",
          city: agent.city || "",
          state: agent.state || "",
          zip: agent.zip || "",
          agentSignature,
          date: date || new Date().toISOString().split("T")[0],
          isEditable: false,
          // Add the agent profile data
          brokerageName: agent.brokerageName || "",
          phoneNumber: agent.phone || "",
          email: agent.email || "",
        };

        // Generate the PDF with agent data
        const pdfBuffer = await fillAgentReferralForm(formData);

        // Add signature to PDF
        const signedPdfBuffer = await addSignatureToPdf(
          pdfBuffer,
          agentSignature,
          "agent",
        );

        // Save PDF to disk
        const uniqueId = Date.now();
        const filename = `agent_referral_${req.user.id}_${uniqueId}.pdf`;

        // Create directory if it doesn't exist
        await fs.promises.mkdir(
          path.join(process.cwd(), "uploads", "agreements"),
          { recursive: true },
        );

        const filePath = path.join(
          process.cwd(),
          "uploads",
          "agreements",
          filename,
        );

        await fs.promises.writeFile(filePath, signedPdfBuffer);

        // Create a URL for the document
        const documentUrl = `/uploads/agreements/${filename}`;

        // Use property ID 0 to indicate this is not associated with a specific property
        // This will ensure any "NaN" errors are avoided
        const propertyId = 0;

        // Look for a placeholder buyer for system agreements
        let buyerId = 0;
        try {
          const adminUsers = await storage.getUsersByRole("admin");
          if (adminUsers.length > 0) {
            buyerId = adminUsers[0].id;
          }
        } catch (error) {
          console.warn(
            "Could not find admin user, using 0 as buyerId placeholder",
          );
        }

        // Create an agreement record
        const agreement = await storage.createAgreement({
          propertyId,
          agentId: req.user.id,
          buyerId, // Use admin or 0 as placeholder
          type: "agent_referral",
          agreementText: "Agent Referral Fee Agreement (25% to Randy Brummett)",
          agentSignature,
          date: new Date(),
          status: "completed",
          documentUrl,
        });

        res.json({
          success: true,
          data: {
            id: agreement.id,
            status: agreement.status,
            documentUrl,
            date: agreement.date,
          },
        });
      } catch (error) {
        console.error("Error creating agent referral agreement:", error);
        res.status(500).json({
          success: false,
          error: "Failed to create agent referral agreement",
        });
      }
    },
  );

  // Update a property's agent email
  app.patch(
    "/api/properties/:id/agent-email",
    isAuthenticated,
    async (req, res) => {
      try {
        const propertyId = parseInt(req.params.id);
        const property = await storage.getProperty(propertyId);
        const userId = req.user!.id;
        const role = req.user!.role;
        const { agentEmail } = req.body;

        if (!property) {
          return res.status(404).json({
            success: false,
            error: "Property not found",
          });
        }

        // Validate the email format
        if (!agentEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(agentEmail)) {
          return res.status(400).json({
            success: false,
            error: "Please provide a valid email address",
          });
        }

        // Any user associated with the property can update the agent email
        const isSeller = role === "seller" && property.sellerId === userId;
        const isAssignedAgent = role === "agent" && property.agentId === userId;
        const isBuyer = role === "buyer" && property.createdBy === userId; // Fixed: use createdBy instead of buyerId
        const isAdmin = role === "admin";

        if (!(isSeller || isAssignedAgent || isBuyer || isAdmin)) {
          return res.status(403).json({
            success: false,
            error:
              "You don't have permission to update this property's agent email",
          });
        }

        // Update only the agent email
        const updatedProperty = await storage.updateProperty(propertyId, {
          sellerEmail: agentEmail,
        });

        // Log the activity
        await storage.createPropertyActivityLog({
          propertyId: propertyId,
          userId: userId,
          activity: "Agent email updated",
          details: {
            previousEmail: property.sellerEmail,
            newEmail: agentEmail,
            updatedBy: {
              id: userId,
              role: role,
            },
          },
        });

        // Send WebSocket notification
        const notifyUserIds: number[] = [];

        // Notify the seller if not the updater
        if (property.sellerId && property.sellerId !== userId) {
          notifyUserIds.push(property.sellerId);
        }

        // Notify the agent if assigned and not the updater
        if (property.agentId && property.agentId !== userId) {
          notifyUserIds.push(property.agentId);
        }

        // Notify the buyer if they created the property and aren't the updater
        if (property.createdBy && property.createdBy !== userId) {
          notifyUserIds.push(property.createdBy);
        }

        // Send the notification
        if (notifyUserIds.length > 0) {
          websocketServer.broadcastToUsers(notifyUserIds, {
            type: "property_update",
            data: {
              propertyId: propertyId,
              message: `The agent email for ${property.address} has been updated.`,
            },
          });
        }

        res.json({
          success: true,
          data: updatedProperty,
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error:
            error instanceof Error
              ? error.message
              : "Failed to update agent email",
        });
      }
    },
  );

  // API Endpoint to get all agreements for a buyer
  app.get(
    "/api/buyer/agreements",
    isAuthenticated,
    hasRole(["buyer", "admin"]),
    async (req, res) => {
      try {
        const buyerId = req.user?.id;

        if (!buyerId) {
          return res.status(401).json({
            success: false,
            error: "Unauthorized",
          });
        }

        // Get all agreements where the current user is the buyer
        const agreements = await storage.getAgreementsByBuyer(buyerId);

        res.json(agreements);
      } catch (error) {
        console.error("Error getting buyer agreements:", error);
        res.status(500).json({
          success: false,
          error: "Failed to get buyer agreements",
        });
      }
    },
  );

  // API Endpoint to create a global BRBC agreement between a buyer and agent
  app.post("/api/global-brbc", isAuthenticated, async (req, res) => {
    console.log("-----Global BRBC request body:");
    try {
      const { agentId, signatureData, details } = req.body;

      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: "Unauthorized",
        });
      }

      const buyerId = req.user.id;

      // Check if this buyer already has a global BRBC with this agent
      const existingAgreement = await storage.getGlobalBRBCForBuyerAgent(
        buyerId,
        agentId,
      );

      if (existingAgreement && existingAgreement.status === "completed") {
        return res.status(400).json({
          success: false,
          error:
            "A global BRBC agreement already exists between this buyer and agent",
          agreementId: existingAgreement.id,
        });
      }

      // Get the agent information
      const agent = await storage.getUser(agentId);
      if (!agent) {
        return res.status(404).json({
          success: false,
          error: "Agent not found",
        });
      }

      // Create a global BRBC agreement
      const agreement = await storage.createAgreement({
        agentId: agentId,
        buyerId: buyerId,
        type: "global_brbc",
        agreementText: JSON.stringify(details || {}),
        buyerSignature: signatureData,
        date: new Date(),
        status: "signed_by_buyer", // Buyer has signed, waiting for agent
        isGlobal: true, // This is a global agreement
      });

      res.json({
        success: true,
        data: agreement,
      });
    } catch (error) {
      console.error("Error creating global BRBC agreement:", error);
      res.status(500).json({
        success: false,
        error: "Failed to create global BRBC agreement",
      });
    }
  });

  // API Endpoint to save a BRBC PDF with signature (with multiple signature fields support)
  app.post(
    "/api/global-brbc/pdf-signature",
    isAuthenticated,
    hasRole(["buyer", "admin"]),
    async (req, res) => {
      console.log("-----Pdf-signature request body:");
      try {
        const {
          signatureData, // Main signature for sign1 field
          initialsData, // Initials for initial1 field
          buyer2SignatureData, // Optional second buyer signature for sign2 field
          buyer2InitialsData, // Optional second buyer initials for initial2 field
          previewOnly, // Flag to indicate this is just for preview (no DB save)
          formFieldValues, // Form field values from the client
          details,
        } = req.body;

        if (!req.user) {
          return res.status(401).json({
            success: false,
            error: "Unauthorized",
          });
        }

        const buyerId = req.user.id;

        // Find the first available agent (only needed for non-preview mode)
        let defaultAgent;
        if (!previewOnly) {
          const agents = await storage.getUsersByRole("agent");

          if (!agents || agents.length === 0) {
            return res.status(404).json({
              success: false,
              error: "No agents available in the system",
            });
          }

          // Use the first agent as a default (this can be improved in the future)
          defaultAgent = agents[0];
        }

        // Get the buyer name from form fields or user data
        const defaultBuyerName =
          `${req.user.firstName || ""} ${req.user.lastName || ""}`.trim() ||
          req.user.email;
        const buyer1Name =
          details?.buyer1 || formFieldValues?.buyer1 || defaultBuyerName;

        // Prepare form data for PDF generation
        const formData = {
          buyer2: details?.buyer2 || formFieldValues?.buyer2,
          startDate: details?.startDate || formFieldValues?.today,
          endDate: details?.endDate || formFieldValues?.["3Months"],
          startDate2: details?.startDate2 || formFieldValues?.today2,
          endDate2: details?.endDate2 || formFieldValues?.["3Months2"],
          formFieldValues: formFieldValues,
        };

        // Generate a prefilled BRBC PDF with the specified buyer name and form data
        let pdfBuffer = await fillBrbcForm(buyer1Name, formData);

        // Add all the signatures to the PDF
        try {
          console.log(
            `Adding signatures to PDF: primary=${!!signatureData}, initials=${!!initialsData}, buyer2=${!!buyer2SignatureData}, buyer2Initials=${!!buyer2InitialsData}`,
          );

          // Add primary signature
          if (signatureData) {
            pdfBuffer = await addSignatureToPdf(
              pdfBuffer,
              signatureData,
              "sign1",
            );
          }

          // Add primary buyer initials if provided
          if (initialsData) {
            pdfBuffer = await addSignatureToPdf(
              pdfBuffer,
              initialsData,
              "initial1",
            );
          }

          // Add second buyer signature if provided
          if (buyer2SignatureData) {
            pdfBuffer = await addSignatureToPdf(
              pdfBuffer,
              buyer2SignatureData,
              "sign2",
            );
          }

          // Add second buyer initials if provided
          if (buyer2InitialsData) {
            pdfBuffer = await addSignatureToPdf(
              pdfBuffer,
              buyer2InitialsData,
              "initial2",
            );
          }
        } catch (error) {
          console.error("Error adding signature to PDF:", error);
          // Continue with the process even if signature addition fails
        }

        // Create upload directory if it doesn't exist
        const documentDir = path.join(process.cwd(), "uploads", "agreements");
        await fs.promises.mkdir(documentDir, { recursive: true });

        // Save the PDF to the filesystem with a unique name
        // For previews, include 'preview' in the filename to make it easy to identify
        const timestamp = Date.now();
        const filePrefix = previewOnly ? "preview_brbc" : "brbc";
        const fileName = `${filePrefix}_${buyerId}_${timestamp}.pdf`;
        const filePath = path.join(documentDir, fileName);
        await fs.promises.writeFile(filePath, pdfBuffer);

        // Document URL relative to uploads directory
        const documentUrl = `/uploads/agreements/${fileName}`;

        // If this is just a preview, return the URL without creating a database record
        if (previewOnly) {
          return res.json({
            success: true,
            data: {
              pdfUrl: documentUrl, // URL to the preview PDF
              preview: true,
            },
          });
        }

        // Otherwise, create a database record for the final submission
        const agreement = await storage.createAgreement({
          agentId: defaultAgent.id,
          buyerId: buyerId,
          type: "global_brbc",
          agreementText: JSON.stringify(details || {}),
          buyerSignature: signatureData,
          date: new Date(),
          status: "signed_by_buyer", // Buyer has signed, waiting for agent
          isGlobal: true, // This is a global agreement
          documentUrl: documentUrl,
        });

        // Send the signed BRBC document to buyer via email
        try {
          // Get the complete buyer information
          const buyer = await storage.getUser(buyerId);
          console.log("--------Lets send brbc to buyer: Buyer data:", buyer);

          if (buyer) {
            // Get agent information
            console.log(
              "--------Lets send brbc to buyer: Buyer exists:",
              buyer,
            );

            const agent = defaultAgent
              ? await storage.getUser(defaultAgent.id)
              : undefined;

            // Send email with the signed document to the buyer
            await sendSignedBrbcToBuyer(buyer, documentUrl, agent);
            console.log(`Sent signed BRBC document to buyer ${buyer.email}`);
          } else {
            console.error(
              `Could not find buyer with ID ${buyerId} to send BRBC email`,
            );
          }
        } catch (emailError) {
          // Log error but don't fail the request if email sending fails
          console.error("Error sending BRBC email to buyer:", emailError);
        }

        res.json({
          success: true,
          data: agreement,
        });
      } catch (error) {
        console.error("Error creating BRBC agreement with PDF:", error);
        res.status(500).json({
          success: false,
          error: "Failed to create BRBC agreement",
        });
      }
    },
  );

  // API Endpoint to check if a global BRBC agreement exists between buyer and agent
  app.get("/api/global-brbc/:agentId", isAuthenticated, async (req, res) => {
    try {
      const agentId = parseInt(req.params.agentId);

      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: "Unauthorized",
        });
      }

      const buyerId = req.user.id;

      // Check if this buyer already has a global BRBC with this agent
      const existingAgreement = await storage.getGlobalBRBCForBuyerAgent(
        buyerId,
        agentId,
      );

      if (
        existingAgreement &&
        (existingAgreement.status === "completed" ||
          existingAgreement.status === "signed_by_buyer")
      ) {
        // Return the existing agreement
        return res.json({
          success: true,
          exists: true,
          agreement: existingAgreement,
        });
      }

      // No agreement exists
      res.json({
        success: true,
        exists: false,
      });
    } catch (error) {
      console.error("Error checking global BRBC agreement:", error);
      res.status(500).json({
        success: false,
        error: "Failed to check global BRBC agreement",
      });
    }
  });

  // Public endpoint to access a viewing request using a token (for listing agents)
  app.get("/api/public/viewing/:token", async (req, res) => {
    try {
      const { token } = req.params;

      if (!token) {
        return res.status(400).json({
          success: false,
          error: "Missing token",
        });
      }

      // Validate the token and get associated data
      const validationResult = await validateViewingToken(token);

      if (!validationResult) {
        return res.status(404).json({
          success: false,
          error: "Invalid or expired token",
        });
      }

      const { viewingRequest, property, buyer, agent } = validationResult;

      // Format the buyer name safely
      const buyerName = buyer
        ? `${buyer.firstName || ""} ${buyer.lastName || ""}`.trim() ||
          buyer.email
        : "Unknown Buyer";

      // Format the agent name safely
      const agentName = agent
        ? `${agent.firstName || ""} ${agent.lastName || ""}`.trim() ||
          agent.email
        : undefined;

      // Return the viewing request data with the property
      const response: PublicViewingResponse = {
        success: true,
        viewingRequest: {
          ...viewingRequest,
          buyer,
          agent,
        },
        property,
        buyerName,
        agentName,
      };

      res.json(response);
    } catch (error) {
      console.error("Error accessing public viewing:", error);
      res.status(500).json({
        success: false,
        error: "Failed to retrieve viewing request",
      });
    }
  });

  // Public endpoint to update a viewing request using a token (for listing agents)
  app.patch("/api/public/viewing/:token", async (req, res) => {
    try {
      const { token } = req.params;
      const { status, confirmedDate, confirmedEndDate, responseMessage } =
        req.body;

      if (!token) {
        return res.status(400).json({
          success: false,
          error: "Missing token",
        });
      }

      // Validate the token and get associated data
      const validationResult = await validateViewingToken(token);

      if (!validationResult) {
        return res.status(404).json({
          success: false,
          error: "Invalid or expired token",
        });
      }

      const { viewingRequest, property } = validationResult;

      // Validate the status
      if (
        status &&
        ![
          "pending",
          "accepted",
          "rejected",
          "rescheduled",
          "completed",
          "cancelled",
        ].includes(status)
      ) {
        return res.status(400).json({
          success: false,
          error: "Invalid status value",
        });
      }

      // Create update data object
      const updateData: Partial<ViewingRequest> = {};
      if (status) updateData.status = status;
      if (confirmedDate) updateData.confirmedDate = new Date(confirmedDate);
      if (confirmedEndDate)
        updateData.confirmedEndDate = new Date(confirmedEndDate);
      if (responseMessage) updateData.responseMessage = responseMessage;

      // If accepting or rescheduling from external access, record who confirmed
      // For public access, we'll use the seller or listing agent as the confirmer if available
      if (["accepted", "rescheduled"].includes(status)) {
        // For public access, we'll use the property's seller or agent ID, prioritizing the agent
        updateData.confirmedById =
          property.agentId || property.sellerId || null;
      }

      // Update the viewing request
      const updatedRequest = await storage.updateViewingRequest(
        viewingRequest.id,
        updateData,
      );

      // Log the activity
      try {
        await storage.createPropertyActivityLog({
          propertyId: property.id,
          userId: property.agentId || property.sellerId || null,
          activity: `Viewing request ${status} via public link`,
          details: {
            requestId: updatedRequest.id,
            status: updatedRequest.status,
            updatedVia: "public_link",
          },
        });
      } catch (logError) {
        console.error(
          "Failed to create activity log for public viewing request update:",
          logError,
        );
        // Continue without failing the whole request
      }

      // Send WebSocket notifications to all relevant users
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
        type: "property_update",
        data: {
          propertyId: property.id,
          viewingRequestId: updatedRequest.id,
          action: "viewing_request_updated",
          status: updatedRequest.status,
          message: `Viewing request has been ${updatedRequest.status} by listing agent via public link`,
        },
      });

      res.json({
        success: true,
        data: updatedRequest,
      });
    } catch (error) {
      console.error("Update public viewing request error:", error);
      res.status(500).json({
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to update viewing request",
      });
    }
  });

  async function findNearestAgent(geographicalArea: string) {
    try {
      // Find agents who serve this area
      // Using a simple LIKE query for now - could be enhanced with proper geocoding later
      const agents = await storage.findAgentsByServiceArea(geographicalArea);
      
      if (agents && agents.length > 0) {
        // For now, just return the first matching agent
        // Could be enhanced with load balancing, ratings, etc.
        return agents[0];
      }
      
      return null;
    } catch (error) {
      console.error("Error finding nearest agent:", error);
      return null;
    }
  }

  // In your registration route handler:
  app.post("/api/register", async (req, res) => {
    try {
      const userData = req.body;
      
      // Create the user
      const user = await storage.createUser({
        ...userData,
        role: userData.role || "buyer",
      });

      // If this is a buyer, try to match them with an agent
      if (user.role === "buyer" && userData.geographicalArea) {
        const matchedAgent = await findNearestAgent(userData.geographicalArea);
        
        if (matchedAgent) {
          // Assign the agent to the buyer
          await storage.assignAgentToBuyer(user.id, matchedAgent.id);
          
          // Send notification email to both buyer and agent
          try {
            await sendAgentMatchEmail(user, matchedAgent);
          } catch (emailError) {
            console.error("Error sending match notification email:", emailError);
          }
        }
      }

      // Create session
      req.session.userId = user.id;
      await req.session.save();

      res.json({
        success: true,
        data: {
          user,
          assignedAgent: matchedAgent || null,
        },
      });
    } catch (error) {
      console.error("Registration error:", error);
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : "Registration failed",
      });
    }
  });

  return httpServer;
}
