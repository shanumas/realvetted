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
    console.log("--------Received Veriff webhook data:");

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
        // Also update the verification method to "kyc" when verification succeeds
        await storage.updateUser(userId, {
          profileStatus: "verified",
          verificationMethod: "kyc",
        });
        console.log(`User ${userId} verified successfully via KYC`);
        return; // Return early since we've already updated the user
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
    console.log(`Updating user ${userId} profile status to ${profileStatus}`);
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

      const data = JSON.parse(responseText);
      if (data && data.decision) {
        console.log(`Verification status: ${data.decision}`);

        // If verification is successful and we have the vendorData (user ID),
        // also update the verification method to KYC
        if (
          data.decision === "success" &&
          data.verification &&
          data.verification.vendorData
        ) {
          try {
            const userId = parseInt(data.verification.vendorData);
            if (!isNaN(userId)) {
              // Update user profileStatus and verificationMethod
              await storage.updateUser(userId, {
                profileStatus: "verified",
                verificationMethod: "kyc",
              });
              console.log(
                `User ${userId} verified successfully via KYC (from status check)`,
              );
            }
          } catch (updateError) {
            console.error(
              "Error updating user verification method:",
              updateError,
            );
          }
        }

        return data.decision;
      } else {
        return data.decision || "pending";
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
