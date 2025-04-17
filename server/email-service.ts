import { Property, User, ViewingRequest } from "@shared/schema";
import fs from "fs";
import path from "path";

// Record type for storing sent emails
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

// In-memory store for sent emails (in a real app, these would be stored in the database)
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
  listingAgentEmail: string
): Promise<SentEmail> {
  // Format the date and time for the email
  const requestDate = new Date(viewingRequest.requestedDate);
  const requestEndDate = new Date(viewingRequest.requestedEndDate);
  
  const dateOptions: Intl.DateTimeFormatOptions = { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  };
  const timeOptions: Intl.DateTimeFormatOptions = { 
    hour: '2-digit', 
    minute: '2-digit',
    hour12: true
  };

  const formattedDate = requestDate.toLocaleDateString('en-US', dateOptions);
  const formattedStartTime = requestDate.toLocaleTimeString('en-US', timeOptions);
  const formattedEndTime = requestEndDate.toLocaleTimeString('en-US', timeOptions);
  const formattedDateTime = `${formattedDate} between ${formattedStartTime} and ${formattedEndTime}`;

  // Determine verification status
  const isKYCVerified = buyer.verificationMethod === "kyc" && buyer.profileStatus === "verified";
  const hasPrequalification = buyer.verificationMethod === "prequalification" && buyer.prequalificationValidated;
  const verificationInfo = isKYCVerified 
    ? "For your assurance, the buyer has been fully vetted through a Know Your Customer (KYC) verification process." 
    : hasPrequalification 
      ? "For your assurance, the buyer has provided a verified pre-qualification document from a lender."
      : "The buyer's verification is pending. Please exercise caution.";

  // Prepare recipient and CC addresses
  const to = [listingAgentEmail];
  const cc = agent ? [agent.email] : [];

  // Construct the email body
  const subject = `Home Preview Request – ${property.address}`;
  const body = `
Dear ${property.listingAgentName || "Listing Agent"},

I hope this email finds you well. I am reaching out on behalf of my client, ${buyer.firstName} ${buyer.lastName}, who is interested in previewing your listing at ${property.address}. They have selected a preferred date and time for the showing: ${formattedDateTime}.

As their designated buyer's agent through our REALVetted platform, I want to ensure a smooth process. Please note that I will not be attending the showing in person. Instead, I kindly ask that you or a representative from your team grant my client access to the home at the scheduled time.

${verificationInfo} Additionally, a signed Buyer Representation and Broker Compensation Agreement are on file. Their direct contact information is as follows:

Buyer Name: ${buyer.firstName} ${buyer.lastName}
Phone Number: ${buyer.phone || "Not provided"}

To confirm the requested showing, please respond to this email or contact the buyer directly. If the proposed time does not work, feel free to reach out to ${buyer.firstName} ${buyer.lastName} directly to arrange an alternative. 

Should you have any questions or require further details, I am happy to assist.

Thank you for your time and cooperation—I look forward to working together.

${agent ? `${agent.firstName} ${agent.lastName}` : "REALVetted Agent"}
${agent && agent.licenseNumber ? `DRE License #${agent.licenseNumber}` : ""}
${agent && agent.phone ? `Direct Phone ${agent.phone}` : ""}
${agent && agent.addressLine1 ? `${agent.addressLine1}${agent.city && agent.state ? `, ${agent.city}, ${agent.state}` : ""}` : ""}
REALVetted – Real Estate, Verified and Simplified
  `;

  // In a production app, this would connect to an email service like SendGrid or Mailgun
  // For now, we'll just log the email and store it in our in-memory array
  console.log(`
======= TOUR REQUEST EMAIL NOTIFICATION =======
TO: ${to.join(", ")}
CC: ${cc.join(", ")}
SUBJECT: ${subject}
BODY:
${body}
======= END EMAIL =======
  `);

  // Create a sent email record
  const emailId = `email_${new Date().getTime()}_${Math.random().toString(36).substring(2, 10)}`;
  const sentEmail: SentEmail = {
    id: emailId,
    to,
    cc,
    subject,
    body,
    timestamp: new Date(),
    sentBy: {
      id: buyer.id,
      role: "buyer"
    },
    relatedEntity: {
      type: "viewing_request",
      id: viewingRequest.id
    }
  };

  // Store the email record
  sentEmails.push(sentEmail);

  // In a real application, we would save this to the database
  
  return sentEmail;
}

/**
 * Get all sent emails for a specific entity
 * @param entityType The type of entity (viewing_request, property, etc.)
 * @param entityId The ID of the entity
 * @returns Array of sent email records
 */
export function getSentEmailsForEntity(
  entityType: "viewing_request" | "property" | "agreement", 
  entityId: number
): SentEmail[] {
  return sentEmails.filter(email => 
    email.relatedEntity.type === entityType && 
    email.relatedEntity.id === entityId
  );
}

/**
 * Get all sent emails for a specific user
 * @param userId The user ID
 * @returns Array of sent email records
 */
export function getSentEmailsForUser(userId: number): SentEmail[] {
  return sentEmails.filter(email => email.sentBy.id === userId);
}