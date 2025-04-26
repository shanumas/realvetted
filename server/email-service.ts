import {
  Property,
  User,
  ViewingRequest,
  Email,
  InsertEmail,
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
    type: "viewing_request" | "property" | "agreement";
    id: number;
  };
}

// For legacy compatibility until full migration - don't use this directly anymore
const sentEmails: SentEmail[] = [];

/**
 * Send a property tour request email notification
 * @param viewingRequest The viewing request object
 * @param property The property object
 * @param buyer The buyer user object
 * @param agent The buyer's agent user object
 * @param listingAgentEmail Email of the listing agent
 * @returns The sent email record
 */
export async function sendTourRequestEmail(
  viewingRequest: ViewingRequest,
  property: Property,
  buyer: User,
  agent: User | undefined,
  listingAgentEmail: string,
  listingAgentName: string
): Promise<SentEmail> {
  // Format the date and time for the email
  const requestDate = new Date(viewingRequest.requestedDate);
  const requestEndDate = new Date(viewingRequest.requestedEndDate);

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
  const formattedStartTime = requestDate.toLocaleTimeString(
    "en-US",
    timeOptions,
  );
  const formattedEndTime = requestEndDate.toLocaleTimeString(
    "en-US",
    timeOptions,
  );
  const formattedDateTime = `${formattedDate} between ${formattedStartTime} and ${formattedEndTime}`;

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

  try {
    // Prepare the message content

    // Send email using EmailJS Node.js version
    const response = await emailjs.send(
      "service_erfsoqn", // Service ID
      "template_4bptn9b", // Template ID
      {
        to_email: to.join(", "),
        cc_email: cc.join(", "), // Include buyer's agent in CC

        brbc_document: "", // Not applicable for tour requests
        prequalification_document: "", // Not applicable for tour requests

        buyer_name: buyer.firstName + " " + buyer.lastName,
        buyer_phone: buyer.phone,
        buyer_email: buyer.email,
        property_address: property.address,
        requested_date_time: formattedDateTime,
        listing_agent_name: listingAgentName || "Listing Agent",
      },
    );

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
  entityType: "viewing_request" | "property" | "agreement",
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
      "service_erfsoqn", // Service ID
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
