import Veriff from '@veriff/js-sdk';
import { apiRequest } from './queryClient';

/**
 * Interface for the response from creating a Veriff session
 */
interface VeriffSessionResponse {
  url: string;
  sessionId: string;
}

/**
 * Creates a new Veriff session for the current user
 * @returns The session data including URL and session ID
 */
export async function createVeriffSession(): Promise<VeriffSessionResponse> {
  try {
    const response = await apiRequest('POST', '/api/veriff/create-session');
    if (!response.ok) {
      throw new Error('Failed to create verification session');
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error creating Veriff session:', error);
    throw error;
  }
}

/**
 * Launches the Veriff verification flow for the user
 * @param sessionUrl The Veriff session URL to redirect to
 * @param sessionId The Veriff session ID (extracted from URL if not provided)
 * @param onComplete Callback when the verification is complete
 */
export function launchVeriff(
  sessionUrl: string,
  onComplete: (status: 'completed' | 'canceled' | 'error') => void,
  sessionId?: string
): void {
  // Extract session ID from URL if not provided
  let veriffSessionId = sessionId;
  if (!veriffSessionId) {
    try {
      const url = new URL(sessionUrl);
      veriffSessionId = url.pathname.split('/').pop() || '';
    } catch (e) {
      console.error("Failed to extract session ID from URL:", e);
    }
  }
  
  // Open Veriff in a new window
  const veriffWindow = window.open(sessionUrl, '_blank');
  
  // Check if window opened successfully
  if (!veriffWindow) {
    onComplete('error');
    return;
  }
  
  // Check when the window is closed
  const checkInterval = setInterval(() => {
    if (veriffWindow.closed) {
      clearInterval(checkInterval);
      
      // Force status update on window close, passing the session ID
      updateVerificationStatus(veriffSessionId)
        .then(() => {
          onComplete('completed');
        })
        .catch(error => {
          console.error("Error updating verification status:", error);
          onComplete('completed'); // Still call completed even if update fails
        });
    }
  }, 1000);
}

/**
 * Updates the user's verification status by checking with the server
 * This can be called after the Veriff window closes to make sure status is up-to-date
 * @param sessionId Optional verification session ID to check specific session
 */
async function updateVerificationStatus(sessionId?: string): Promise<void> {
  try {
    // Call the force verification endpoint to update the status
    // Include session ID if available
    await apiRequest('POST', '/api/users/force-verification', 
      sessionId ? { sessionId } : undefined
    );
    
    // Invalidate the user data in the cache to make sure we get fresh data
    // This assumes you're using TanStack Query elsewhere
    // Use the imported queryClient rather than the window object
    const { queryClient } = await import('./queryClient');
    queryClient.invalidateQueries({ queryKey: ['/api/auth/user'] });
  } catch (error) {
    console.error("Failed to update verification status:", error);
    throw error;
  }
}

/**
 * Alternative implementation using Veriff SDK for embedded integration
 * This function is not currently used and has been commented out due to type incompatibilities
 * With the Veriff SDK. We're using the launchVeriff function instead which opens in a new window.
 */
// export function initVeriffSDK() { 
//   // Removed due to type incompatibilities with the Veriff SDK
// }

/**
 * Checks the status of a Veriff verification session
 * @param sessionId The Veriff session ID to check
 * @returns The status of the verification
 */
export async function checkVeriffStatus(sessionId: string): Promise<string> {
  try {
    const response = await apiRequest('GET', `/api/veriff/status/${sessionId}`);
    if (!response.ok) {
      throw new Error('Failed to check verification status');
    }
    
    const data = await response.json();
    return data.status;
  } catch (error) {
    console.error('Error checking Veriff status:', error);
    throw error;
  }
}