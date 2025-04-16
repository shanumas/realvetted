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
        accept: "application/json",
        "x-auth-client": VERIFF_API_KEY,
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
      case "success":
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
    // Log the session ID being checked
    console.log(`Checking Veriff session status for ID: ${sessionId}`);

    const signature = crypto
      .createHmac("sha256", SHARED_SECRET)
      .update(sessionId)
      .digest("hex");

    // Make the API request to Veriff
    try {
      const response = await fetch(
        `https://stationapi.veriff.com/v1/sessions/${sessionId}/decision/fullauto?version=1.0.0`,
        {
          method: "GET",
          headers: {
            accept: "application/json",
            "x-auth-client": VERIFF_API_KEY,
            "x-hmac-signature": signature,
          },
        },
      );

      const responseText = await response.text();

      console.log(`Veriff API Response Status Verification: ${responseText}`);

      // Handle different response statuses appropriately
      if (!response.ok) {
        if (response.status === 404) {
          console.log("Verification not found or still in progress");
          return "pending"; // Decision not made yet
        }

        console.log(`Error response from Veriff: ${responseText}`);
        return "pending";
      }

      // Parse the JSON response if it's valid

      console.log(`Veriff API Response Body: ${responseText}`);

      if (!responseText || responseText.trim() === "") {
        console.log("Empty response from Veriff API");
        return "pending";
      }

      try {
        const data = JSON.parse(responseText);
        if (data && data.status) {
          console.log(`Verification status: ${data.status}`);
          return data.status;
        } else {
          console.log("Invalid response format from Veriff API:", data);
          return "pending";
        }
      } catch (jsonError) {
        console.error("Error parsing Veriff API JSON response:", jsonError);
        console.log("Raw response that couldn't be parsed:", responseText);
        return "pending";
      }
    } catch (fetchError) {
      console.error("Error fetching from Veriff API:", fetchError);
      return "pending";
    }
  } catch (error) {
    console.error("Error checking Veriff session status:", error);
    return "pending"; // Changed from "error" to "pending" for consistency
  }
}
