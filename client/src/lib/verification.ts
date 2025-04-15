import { apiRequest } from './queryClient';
import { queryClient } from './queryClient';

/**
 * Forces the verification status to "verified" for the current user
 * This is used when the normal verification process via Veriff is not working
 */
export async function forceVerification() {
  try {
    const response = await apiRequest('POST', '/api/users/force-verification');
    if (!response.ok) {
      throw new Error('Failed to force verification status');
    }
    
    // Invalidate the user query to refresh the UI with new status
    queryClient.invalidateQueries({ queryKey: ['/api/auth/me'] });
    
    return true;
  } catch (error) {
    console.error('Error forcing verification:', error);
    throw error;
  }
}