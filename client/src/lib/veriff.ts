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
 * @param onComplete Callback when the verification is complete
 */
export function launchVeriff(
  sessionUrl: string,
  onComplete: (status: 'completed' | 'canceled' | 'error') => void
): void {
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
      
      // Force status update on window close
      updateVerificationStatus()
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
 */
async function updateVerificationStatus(): Promise<void> {
  try {
    // Call the force verification endpoint to update the status
    await apiRequest('POST', '/api/users/force-verification');
    
    // Invalidate the user data in the cache to make sure we get fresh data
    // This assumes you're using TanStack Query elsewhere
    if (window.queryClient) {
      window.queryClient.invalidateQueries({ queryKey: ['/api/auth/user'] });
    }
  } catch (error) {
    console.error("Failed to update verification status:", error);
    throw error;
  }
}

/**
 * Alternative implementation using Veriff SDK for embedded integration
 * @param sessionUrl The Veriff session URL
 * @param containerId The ID of the HTML element to mount Veriff to
 * @param onComplete Callback when verification completes
 */
export function initVeriffSDK(
  sessionUrl: string,
  containerId: string,
  onComplete: (status: 'completed' | 'canceled' | 'error') => void
): void {
  try {
    // Extract session ID from URL
    const url = new URL(sessionUrl);
    const sessionId = url.pathname.split('/').pop() || '';
    
    if (!sessionId) {
      throw new Error('Invalid session URL');
    }
    
    const veriff = Veriff({
      host: 'https://magic.veriff.me',
      sessionId,
      container: containerId,
      onSession: (err, response) => {
        if (err) {
          console.error('Veriff session error:', err);
          onComplete('error');
          return;
        }
        console.log('Veriff session started:', response);
      }
    });
    
    veriff.mount({
      submitCallback: () => {
        console.log('Verification submitted');
      },
      closeCallback: () => {
        console.log('Verification closed');
        onComplete('canceled');
      },
      errorCallback: (error) => {
        console.error('Verification error:', error);
        onComplete('error');
      }
    });
  } catch (error) {
    console.error('Error initializing Veriff SDK:', error);
    onComplete('error');
  }
}

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