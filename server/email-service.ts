import {
  Property,
  User,
  ViewingRequest,
  Email,
  InsertEmail,
  SupportMessage,
  Agreement,
} from "@shared/schema";
import { storage } from "./storage";
import fs from "fs";
import path from "path";
import emailjs from "@emailjs/nodejs";

// Initialize EmailJS with public key
emailjs.init({
  publicKey: process.env.E_PUBLIC,
  privateKey: process.env.E_PRIVATE,
});

// Legacy interface for backward compatibility
export interface SentEmail {
  id: string;
  to: string[];
  cc: string[];
  subject: string;
  body: string;
  timestamp: Date;
  sentBy: {
    id: number;
    role: string;
  };
  relatedEntity: {
    type: "viewing_request" | "property" | "agreement" | "support_chat";
    id: number;
  };
}

// For legacy compatibility until full migration - don't use this directly anymore
const sentEmails: SentEmail[] = [];

export async function sendSignedBrbcToBuyer(
  buyer: User,
  documentUrl: string,
  agent?: User,
): Promise<SentEmail> {
  console.log("--------Lets send brbc to buyer: Inside the sending function :");

  // Prepare recipient email - this will be the buyer's email
  const to = [buyer.email];

  // Format buyer's name
  const buyerName =
    `${buyer.firstName || ""} ${buyer.lastName || ""}`.trim() || buyer.email;

  // Format agent's name if available
  const agentName = agent
    ? `${agent.firstName || ""} ${agent.lastName || ""}`.trim()
    : "your agent";

  // Construct the email subject
  const subject = `Your Signed Buyer Representation Agreement`;

  // Construct the email body
  let body = `
Dear ${buyerName},

Thank you for signing your Buyer Representation Agreement with REALVetted. This document establishes your official relationship with ${agentName}.

We've attached a copy of your signed agreement for your records. Please save this document for future reference.

Key Points to Remember:
- This agreement is valid for 90 days
- Your agent will represent your interests in the home buying process
- All property viewings and inquiries should be coordinated through your agent

If you have any questions about this agreement or need assistance with your property search, please contact us at support@realvetted.com.

Thank you for choosing REALVetted for your real estate needs.

Best regards,
The REALVetted Team
`;

  // Log email details for debugging
  console.log(`
======= SIGNED BRBC EMAIL TO BUYER =======
TO: ${to.join(", ")}
SUBJECT: ${subject}
DOCUMENT: ${documentUrl}
======= END EMAIL =======
  `);

  try {
  
    // 🔄 Convert the document to Base64
    const base64Content = await filePathToBase64(documentUrl);
    console.log("base64Content: ", base64Content.length);
  
    // 🚀 Send email via EmailJS with Base64 attachment
    const response = await emailjs.send(
      "service_z8eslzt",
      "template_viismmd",
      {
        buyer_name: buyerName,
        buyer_email: to.join(", "),
        brbc: base64Content, // <-- Now sending the base64 data URI
      },
    );
  
    console.log("BRBC document email sent successfully:", response);
  } catch (error) {
    console.error("Error sending BRBC document email with EmailJS:", error);
  }

  async function filePathToBase64(filePath: string): Promise<string> {
    // Ensure we're using a proper local file path
    const absolutePath = path.join(process.cwd(), filePath);
    const buffer = await fs.promises.readFile(absolutePath);
    return `data:application/pdf;base64,${buffer.toString('base64')}`;
  }
  

  // Create a sent email record
  const emailId = generateUUID();

  // For legacy compatibility
  const sentEmail: SentEmail = {
    id: emailId,
    to,
    cc: [],
    subject,
    body,
    timestamp: new Date(),
    sentBy: {
      id: buyer.id,
      role: "buyer",
    },
    relatedEntity: {
      type: "agreement",
      id: buyer.id,
    },
  };

  // Store the email in the database
  try {
    await storage.createEmail({
      externalId: emailId,
      to,
      cc: [],
      subject,
      body,
      status: "sent",
      sentById: buyer.id,
      sentByRole: "buyer",
      relatedEntityType: "agreement",
      relatedEntityId: buyer.id,
    });
  } catch (error) {
    console.error("Error storing BRBC email in database:", error);
  }

  // Also keep for legacy compatibility
  sentEmails.push(sentEmail);

  return sentEmail;
}

/**
 * Send a property tour request email notification
 * @param viewingRequest The viewing request object
 * @param property The property object
 * @param buyer The buyer user object
 * @param agent The buyer's agent user object
 * @param listingAgentEmail Email of the listing agent
 * @param listingAgentName Name of the listing agent
 * @param publicViewingLink The public link for the viewing
 * @returns The sent email record
 */
export async function sendTourRequestEmail(
  viewingRequest: ViewingRequest,
  property: Property,
  buyer: User,
  agent: User | undefined,
  listingAgentEmail: string,
  listingAgentName: string,
  publicViewingLink: string,
): Promise<SentEmail> {
  // Format the date and time for the email
  const requestDate = new Date(viewingRequest.requestedDate);

  const dateOptions: Intl.DateTimeFormatOptions = {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  };
  const timeOptions: Intl.DateTimeFormatOptions = {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  };

  const formattedDate = requestDate.toLocaleDateString("en-US", dateOptions);
  const formattedTime = requestDate.toLocaleTimeString("en-US", timeOptions);
  const formattedDateTime = `${formattedDate} at ${formattedTime}`;

  // Determine verification status
  const isKYCVerified =
    buyer.verificationMethod === "kyc" && buyer.profileStatus === "verified";
  const hasPrequalification =
    buyer.verificationMethod === "prequalification" &&
    buyer.prequalificationValidated;
  const verificationInfo = isKYCVerified
    ? "For your assurance, the buyer has been fully vetted through a Know Your Customer (KYC) verification process."
    : hasPrequalification
      ? "For your assurance, the buyer has provided a verified pre-qualification document from a lender."
      : "The buyer's verification is pending. Please exercise caution.";

  // Prepare recipient and CC addresses
  const to = [listingAgentEmail];
  const cc = agent ? [agent.email] : [];

  // Log email details for debugging
  console.log(`
======= TOUR REQUEST EMAIL NOTIFICATION =======
TO: ${to.join(", ")}
CC: ${cc.join(", ")}
SUBJECT: ""
BODY: ""
======= END EMAIL =======
  `);

  // EmailJS is already initialized with keys at the top of the file
  const preQualURL = buyer.prequalificationDocUrl || "";

  const baseUrl = process.env.PUBLIC_URL || "https://realvetted.replit.app";

  const cleanedPreQualUrl = preQualURL.replace(/^\/+/, ""); // removes leading slashes
  const fullPreQualUrl = `${baseUrl}/${cleanedPreQualUrl}`;

  console.log(`Full Prequal URL: ${fullPreQualUrl}`);

  // Extract extension from URL
  const extension = fullPreQualUrl.split(".").pop(); // returns 'docx'

  // Construct the filename
  const fileName = `prequal.${extension}`;

  try {
    // Prepare the message content

    // Send email using EmailJS Node.js version
    const response = await emailjs.send(
      "service_z8eslzt", // Service ID
      "template_4bptn9b", // Template ID
      {
        to_email: to.join(", "),
        cc_email: cc.join(", "), // Include buyer's agent in CC
        prequal: {
          uri: fullPreQualUrl,
          name: fileName,
        },

        buyer_name: buyer.firstName + " " + buyer.lastName,
        buyer_phone: buyer.phone,
        buyer_email: buyer.email,
        property_address: property.address,
        requested_date_time: formattedDateTime,
        listing_agent_name: listingAgentName || "Listing Agent",
        calenderLink: publicViewingLink,
      },
    );

    // Log BRBC URL information for debugging
/*     if (fullBrbcUrl) {
      console.log(`Sent tour request email with BRBC document: ${fullBrbcUrl}`);
    } else {
      console.log("No BRBC document included in tour request email");
    } */

    console.log("Email sent successfully:", response);
  } catch (error) {
    console.error("Error sending email with EmailJS:", error);
  }

  // Create a sent email record for both the old in-memory array and the database
  const emailId = `email_${new Date().getTime()}_${Math.random().toString(36).substring(2, 10)}`;

  // For legacy compatibility
  const sentEmail: SentEmail = {
    id: emailId,
    to,
    cc,
    subject: "Property Tour Request",
    body: "Tour request notification for property",
    timestamp: new Date(),
    sentBy: {
      id: buyer.id,
      role: "buyer",
    },
    relatedEntity: {
      type: "viewing_request",
      id: viewingRequest.id,
    },
  };

  // Store the email in the database
  try {
    await storage.createEmail({
      externalId: emailId,
      to,
      cc,
      subject: "Property Tour Request",
      body: "Tour request notification for property",
      status: "sent",
      sentById: buyer.id,
      sentByRole: "buyer",
      relatedEntityType: "viewing_request",
      relatedEntityId: viewingRequest.id,
    });
  } catch (error) {
    console.error("Error storing email in database:", error);
  }

  // Also keep for legacy compatibility
  sentEmails.push(sentEmail);

  return sentEmail;
}

/**
 * Get all sent emails for a specific entity
 * @param entityType The type of entity (viewing_request, property, etc.)
 * @param entityId The ID of the entity
 * @returns Array of email records
 */
export async function getSentEmailsForEntity(
  entityType: "viewing_request" | "property" | "agreement" | "support_chat",
  entityId: number,
): Promise<Email[]> {
  try {
    // Get emails from the database
    return await storage.getEmailsByRelatedEntity(entityType, entityId);
  } catch (error) {
    console.error("Error getting emails from database:", error);

    // Legacy fallback to in-memory array
    const legacyEmails = sentEmails.filter(
      (email) =>
        email.relatedEntity.type === entityType &&
        email.relatedEntity.id === entityId,
    );

    // Convert legacy format to new format
    return legacyEmails.map(convertLegacyEmailToDbEmail);
  }
}

/**
 * Get all sent emails for a specific user
 * @param userId The user ID
 * @returns Array of email records
 */
export async function getSentEmailsForUser(userId: number): Promise<Email[]> {
  try {
    // Get emails from the database
    return await storage.getEmailsByUser(userId);
  } catch (error) {
    console.error("Error getting emails from database:", error);

    // Legacy fallback to in-memory array
    const legacyEmails = sentEmails.filter(
      (email) => email.sentBy.id === userId,
    );

    // Convert legacy format to new format
    return legacyEmails.map(convertLegacyEmailToDbEmail);
  }
}

/**
 * Get all emails in the system
 * @returns Array of all email records
 */
export async function getAllEmails(): Promise<Email[]> {
  try {
    // Get emails from the database
    return await storage.getAllEmails();
  } catch (error) {
    console.error("Error getting all emails from database:", error);

    // Legacy fallback to in-memory array
    return sentEmails.map(convertLegacyEmailToDbEmail);
  }
}

/**
 * Convert a legacy email format to the new database email format
 * @param legacyEmail Email in the old SentEmail format
 * @returns Email in the new database Email format
 */
function convertLegacyEmailToDbEmail(legacyEmail: SentEmail): Email {
  return {
    id: 0, // This will be ignored
    externalId: legacyEmail.id,
    to: legacyEmail.to,
    cc: legacyEmail.cc,
    subject: legacyEmail.subject,
    body: legacyEmail.body,
    status: "sent",
    errorMessage: null,
    timestamp: legacyEmail.timestamp,
    sentById: legacyEmail.sentBy.id,
    sentByRole: legacyEmail.sentBy.role,
    relatedEntityType: legacyEmail.relatedEntity.type,
    relatedEntityId: legacyEmail.relatedEntity.id,
  };
}

/**
 * Generate a unique identifier
 * @returns A unique string ID
 */
function generateUUID(): string {
  return `email_${new Date().getTime()}_${Math.random().toString(36).substring(2, 10)}`;
}

/**
 * Send a pre-qualification approval request email
 * @param buyer The buyer user object
 * @param prequalificationDocUrl URL to the pre-qualification document
 * @param approvalFormData Optional form data with additional buyer information
 * @param supportingDocsUrls Optional array of supporting document URLs
 * @returns The sent email record
 */
export async function sendPrequalificationApprovalEmail(
  buyer: User,
  prequalificationDocUrl: string,
  approvalFormData?: {
    desiredLoanAmount?: string;
    monthlyIncome?: string;
    employmentStatus?: string;
    creditScore?: string;
    downPaymentAmount?: string;
    additionalNotes?: string;
  },
  supportingDocsUrls?: string[],
): Promise<SentEmail> {
  // Prepare recipient email
  const to = ["shanumas@gmail.com"];

  // Construct the email body
  const subject = `Pre-qualification Approval Request - ${buyer.firstName} ${buyer.lastName}`;

  let body = `
Dear Admin,

A buyer has requested manual approval for their pre-qualification document.

Buyer Details:
- Name: ${buyer.firstName} ${buyer.lastName}
- Email: ${buyer.email}
- Phone: ${buyer.phone || "Not provided"}
- Address: ${buyer.addressLine1 || "Not provided"}${buyer.city && buyer.state ? `, ${buyer.city}, ${buyer.state}` : ""}

The buyer has uploaded a pre-qualification document that requires manual verification.
Main Document URL: ${prequalificationDocUrl}
`;

  // Add form data if provided
  if (approvalFormData) {
    body += `
--- Additional Financial Information ---
- Desired Loan Amount: ${approvalFormData.desiredLoanAmount || "Not provided"}
- Monthly Income: ${approvalFormData.monthlyIncome || "Not provided"}
- Employment Status: ${approvalFormData.employmentStatus || "Not provided"}
- Credit Score Range: ${approvalFormData.creditScore || "Not provided"}
- Down Payment Amount: ${approvalFormData.downPaymentAmount || "Not provided"}

Additional Notes:
${approvalFormData.additionalNotes || "None provided"}
`;
  }

  // Add supporting documents if provided
  if (supportingDocsUrls && supportingDocsUrls.length > 0) {
    body += `
--- Supporting Documents ---
The buyer has provided ${supportingDocsUrls.length} supporting document(s):
`;

    supportingDocsUrls.forEach((url, index) => {
      body += `
Document ${index + 1}: ${url}`;
    });
  }

  body += `

Please review the document(s) and update the user's verification status accordingly.

Thank you,
REALVetted - Real Estate, Verified and Simplified
`;

  // Log email details for debugging
  console.log(`
======= PRE-QUALIFICATION APPROVAL REQUEST EMAIL =======
TO: ${to.join(", ")}
SUBJECT: ${subject}
BODY:
${body}
======= END EMAIL =======
  `);

  // EmailJS is already initialized with keys at the top of the file

  try {
    // Prepare the message content for EmailJS
    const messageContent = body;

    // Send email using EmailJS Node.js version
    const response = await emailjs.send(
      "service_z8eslzt", // Service ID
      "template_4bptn9b", // Template ID
      {
        to_email: to.join(", "),
        cc_email: "", // No CC recipients for prequalification emails
        from_name: "REALVetted Prequalification Service",
        subject: subject,
        message: messageContent,
        brbc_document: "", // Not applicable for prequalification requests
        prequalification_document: prequalificationDocUrl || "",
      },
    );

    console.log("Prequalification email sent successfully:", response);
  } catch (error) {
    console.error("Error sending prequalification email with EmailJS:", error);
  }

  // Create a sent email record
  const emailId = generateUUID();

  // For legacy compatibility
  const sentEmail: SentEmail = {
    id: emailId,
    to,
    cc: [],
    subject,
    body,
    timestamp: new Date(),
    sentBy: {
      id: buyer.id,
      role: "buyer",
    },
    relatedEntity: {
      type: "agreement", // Using 'agreement' type for pre-qualification
      id: buyer.id, // Using buyer ID since we don't have a specific entity
    },
  };

  // Store the email in the database
  try {
    await storage.createEmail({
      externalId: emailId,
      to,
      cc: [],
      subject,
      body,
      status: "sent",
      sentById: buyer.id,
      sentByRole: "buyer",
      relatedEntityType: "agreement",
      relatedEntityId: buyer.id,
    });
  } catch (error) {
    console.error("Error storing email in database:", error);
  }

  // Also keep for legacy compatibility
  sentEmails.push(sentEmail);

  return sentEmail;
}

/**
 * Send notification email when a new support chat session starts
 * @param customerName Name of the customer who started the chat
 * @param customerEmail Email of the customer (if provided)
 * @param initialMessage The first message sent by the customer
 * @param sessionId The unique session ID for joining the chat
 * @returns The sent email record
 */
export async function sendSupportChatNotification(
  customerName: string,
  customerEmail: string,
  initialMessage: string,
  sessionId: string,
): Promise<Email | null> {
  // Admin email that will receive notifications
  const adminEmail = "shanumas@gmail.com";

  // Prepare email content
  const subject = `New Customer Support Chat - ${customerName}`;
  const body = `
Dear Admin,

A new customer support chat has been initiated:

Customer: ${customerName}
Email: ${customerEmail}
Session ID: ${sessionId}
Time: ${new Date().toLocaleString()}

First message:
"${initialMessage}"

Please log in to the admin dashboard to respond to this customer.
Support chat URL: https://realvetted.com/admin/support/${sessionId}

Thank you,
REALVetted Support System
  `;

  console.log(`
======= SUPPORT CHAT NOTIFICATION EMAIL =======
TO: ${adminEmail}
SUBJECT: ${subject}
BODY:
${body}
======= END EMAIL =======
  `);

  try {
    // Send email using EmailJS
    const response = await emailjs.send(
      "service_z8eslzt", // Service ID
      "template_4bptn9b", // Template ID
      {
        to_email: adminEmail,
        cc_email: "", // No CC for support notifications
        from_name: "REALVetted Support System",
        subject: subject,
        message: body,
      },
    );

    console.log("Support chat notification email sent successfully:", response);

    // Create email record in database
    const emailId = generateUUID();
    try {
      const newEmail = await storage.createEmail({
        externalId: emailId,
        to: [adminEmail],
        cc: [],
        subject,
        body,
        status: "sent",
        sentById: 0, // System-generated email
        sentByRole: "system",
        relatedEntityType: "support_chat",
        relatedEntityId: 0, // No specific ID for support chats yet
      });
      return newEmail;
    } catch (error) {
      console.error(
        "Error storing support chat notification email in database:",
        error,
      );
      return null;
    }
  } catch (error) {
    console.error("Error sending support chat notification email:", error);
    return null;
  }
}

export async function sendAgentMatchEmail(buyer: User, agent: User): Promise<SentEmail> {
  // Prepare recipient emails
  const to = [buyer.email];
  const cc = [agent.email];

  // Format names
  const buyerName = `${buyer.firstName || ""} ${buyer.lastName || ""}`.trim() || buyer.email;
  const agentName = `${agent.firstName || ""} ${agent.lastName || ""}`.trim() || agent.email;

  // Construct the email subject
  const subject = `Your REALVetted Buyer's Agent Match`;

  // Construct the email body
  const body = `
Dear ${buyerName},

Great news! We've matched you with a buyer's agent in your area. Meet ${agentName}, your dedicated REALVetted buyer's agent.

Agent Details:
- Name: ${agentName}
- Phone: ${agent.phone || "Contact information will be provided"}
- Email: ${agent.email}
- Service Area: ${agent.serviceArea || "Your local area"}

Your agent will be reaching out to you shortly to discuss your home buying goals and help you start your property search.

If you have any questions in the meantime, please don't hesitate to contact us at support@realvetted.com.

Best regards,
The REALVetted Team
`;

  try {
    // Send email using EmailJS
    const response = await emailjs.send(
      "service_z8eslzt",
      "template_4bptn9b",
      {
        to_email: to.join(", "),
        cc_email: cc.join(", "),
        subject: subject,
        message: body,
        buyer_name: buyerName,
        agent_name: agentName,
      },
    );

    console.log("Agent match email sent successfully:", response);
  } catch (error) {
    console.error("Error sending agent match email:", error);
  }

  // Create a sent email record
  const emailId = generateUUID();

  // For legacy compatibility
  const sentEmail: SentEmail = {
    id: emailId,
    to,
    cc,
    subject,
    body,
    timestamp: new Date(),
    sentBy: {
      id: buyer.id,
      role: "system",
    },
    relatedEntity: {
      type: "agreement",
      id: buyer.id,
    },
  };

  // Store the email in the database
  try {
    await storage.createEmail({
      externalId: emailId,
      to,
      cc,
      subject,
      body,
      status: "sent",
      sentById: buyer.id,
      sentByRole: "system",
      relatedEntityType: "agreement",
      relatedEntityId: buyer.id,
    });
  } catch (error) {
    console.error("Error storing agent match email in database:", error);
  }

  // Also keep for legacy compatibility
  sentEmails.push(sentEmail);

  return sentEmail;
}
