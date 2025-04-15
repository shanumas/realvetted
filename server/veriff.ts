import { storage } from "./storage";
import { User } from "@shared/schema";
import * as crypto from "crypto";

// Veriff API key provided by the user
const VERIFF_API_KEY = "1340b85e-5b2c-4223-8765-fb2f72901afa";

const SHARED_SECRET = "220dbc0a-8f57-4597-82a2-e70a36708cf6";

/**
 * Creates a new Veriff verification session for a user
 * @param user The user to create a verification session for
 * @returns The session URL and session ID
 */
export async function createVeriffSession(
  user: User,
): Promise<{ url: string; sessionId: string }> {
  try {
    // Create a Veriff verification session
    const response = await fetch("https://stationapi.veriff.com/v1/sessions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-AUTH-CLIENT": VERIFF_API_KEY,
      },
      body: JSON.stringify({
        verification: {
          callback: "https://example.com/callback", // This would be your webhook URL in production
          person: {
            firstName: user.firstName || "",
            lastName: user.lastName || "",
            idNumber: "",
          },
          vendorData: String(user.id), // Store user ID for reference
          timestamp: new Date().toISOString(),
        },
      }),
    });

    if (!response.ok) {
      throw new Error(
        `Failed to create Veriff session: ${response.statusText}`,
      );
    }

    const data = await response.json();
    return {
      url: data.verification.url,
      sessionId: data.verification.id,
    };
  } catch (error) {
    console.error("Error creating Veriff session:", error);
    throw error;
  }
}

/**
 * Processes a Veriff webhook to update the user's verification status
 * @param webhookData The data received from Veriff's webhook
 */
export async function processVeriffWebhook(webhookData: any): Promise<void> {
  try {
    // Validate webhook signature if needed

    const userId = parseInt(webhookData.vendorData);
    const status = webhookData.verification.status;

    if (isNaN(userId)) {
      throw new Error("Invalid user ID in webhook data");
    }

    // Get the user
    const user = await storage.getUser(userId);
    if (!user) {
      throw new Error(`User not found with ID: ${userId}`);
    }

    let profileStatus: string;

    // Map Veriff statuses to our app's status
    switch (status) {
      case "approved":
        profileStatus = "verified";
        break;
      case "declined":
        profileStatus = "rejected";
        break;
      case "expired":
      case "abandoned":
        profileStatus = "pending"; // Allow retry
        break;
      default:
        profileStatus = "pending";
    }

    // Update the user's profile status
    await storage.updateUser(userId, { profileStatus });
  } catch (error) {
    console.error("Error processing Veriff webhook:", error);
    throw error;
  }
}

/**
 * Checks the status of a Veriff verification session
 * @param sessionId The ID of the Veriff session to check
 * @returns The status of the verification
 */
export async function checkVeriffSessionStatus(
  sessionId: string,
): Promise<string> {
  try {
    const signature = crypto
      .createHmac("sha256", SHARED_SECRET)
      .update(sessionId)
      .digest("hex");
    const response = await fetch(
      `https://stationapi.veriff.com/v1/sessions/${sessionId}/decision`,
      {
        method: "GET",
        headers: {
          accept: "application/json",
          "x-auth-client": VERIFF_API_KEY,
          "x-hmac-signature": signature,
        },
      },
    );

    if (!response.ok) {
      if (response.status === 404) {
        return "pending"; // Decision not made yet
      }
      console.log("Response content:", await response.text());
      throw new Error(
        `Failed to check Veriff session status: ${response.statusText}`,
      );
    }

    const data = await response.json();
    // Add null check before accessing status
    if (!data || !data.verification) {
      console.log("Unexpected response format:", data);
      return "pending"; // Default to pending when data format is unexpected
    }
    return data.verification.status;
  } catch (error) {
    console.error("Error checking Veriff session status:", error);
    return "error";
  }
}
