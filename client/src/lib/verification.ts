import { apiRequest } from './queryClient';
import { queryClient } from './queryClient';

/**
 * Forces the verification status check with Veriff for the current user
 * Used to update the local user profile status based on Veriff's verification result
 * @param sessionId Optional Veriff session ID to check specific session
 * @returns True if the verification was successfully checked, the status is in the response
 */
export async function forceVerification(sessionId?: string) {
  try {
    // Create request body with session ID if provided
    const body = sessionId ? { sessionId } : {};
    
    const response = await apiRequest('POST', '/api/users/force-verification', body);
    if (!response.ok) {
      throw new Error('Failed to force verification status');
    }
    
    // Invalidate the user query to refresh the UI with new status
    queryClient.invalidateQueries({ queryKey: ['/api/auth/user'] });
    
    // Return response data if needed
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error forcing verification:', error);
    throw error;
  }
}