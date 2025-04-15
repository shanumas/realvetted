import { storage } from './storage';
import { User } from '@shared/schema';

// Veriff API key provided by the user
const VERIFF_API_KEY = '1340b85e-5b2c-4223-8765-fb2f72901afa';

/**
 * Creates a new Veriff verification session for a user
 * @param user The user to create a verification session for
 * @returns The session URL and session ID
 */
export async function createVeriffSession(user: User): Promise<{ url: string; sessionId: string }> {
  try {
    // Create a Veriff verification session
    const response = await fetch('https://stationapi.veriff.com/v1/sessions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${VERIFF_API_KEY}`
      },
      body: JSON.stringify({
        verification: {
          callback: 'https://example.com/callback', // This would be your webhook URL in production
          person: {
            firstName: user.firstName || '',
            lastName: user.lastName || '',
            idNumber: ''
          },
          vendorData: String(user.id), // Store user ID for reference
          timestamp: new Date().toISOString()
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Failed to create Veriff session: ${response.statusText}`);
    }

    const data = await response.json();
    return {
      url: data.verification.url,
      sessionId: data.verification.id
    };
  } catch (error) {
    console.error('Error creating Veriff session:', error);
    throw error;
  }
}

// The processVeriffWebhook function has been moved directly into the webhook handler in routes.ts

/**
 * Checks the status of a Veriff verification session
 * @param sessionId The ID of the Veriff session to check
 * @returns The status of the verification
 */
export async function checkVeriffSessionStatus(sessionId: string): Promise<string> {
  try {
    console.log(`Checking Veriff session status for session: ${sessionId}`);
    
    const response = await fetch(`https://stationapi.veriff.com/v1/sessions/${sessionId}/decision`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${VERIFF_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });
    
    // Log the response status and headers for debugging
    console.log(`Veriff API response status: ${response.status} ${response.statusText}`);
    console.log(`Veriff API response headers:`, Object.fromEntries(response.headers.entries()));

    if (!response.ok) {
      if (response.status === 404) {
        return 'pending'; // Decision not made yet
      }
      throw new Error(`Failed to check Veriff session status: ${response.statusText}`);
    }

    const data = await response.json();
    console.log(`Veriff API response data:`, JSON.stringify(data, null, 2));
    
    return data.verification.status;
  } catch (error) {
    console.error('Error checking Veriff session status:', error);
    return 'error';
  }
}