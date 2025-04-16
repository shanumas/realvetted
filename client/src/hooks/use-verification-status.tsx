import { useState, useEffect } from "react";
import { useAuth } from "./use-auth";
import { useToast } from "./use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

/**
 * Hook to check Veriff verification status in the background
 * @param sessionId The Veriff session ID to check (optional)
 * @param interval Time in milliseconds between checks (default: 30000 - 30 seconds)
 * @returns Object containing status and functions
 */
export function useVerificationStatus(
  sessionId?: string | null,
  interval = 30000,
) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [checking, setChecking] = useState(false);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  // Skip verification checks if the user is already verified
  const shouldCheck =
    user &&
    user.profileStatus !== "verified" &&
    sessionId && // Only check if we have a session ID
    (!lastChecked || new Date().getTime() - lastChecked.getTime() > interval);

  // Function to check verification status
  const checkStatus = async () => {
    // If the user is already verified, no need to check further
    if (!user || checking) {
      return;
    }

    // If user is already verified, clear the session ID from localStorage and return
    if (user.profileStatus === "verified") {
      if (sessionId) {
        localStorage.removeItem("veriffSessionId");
      }
      return;
    }

    try {
      setChecking(true);

      // If we have a session ID, check that specific session
      if (sessionId) {
        const response = await apiRequest(
          "GET",
          `/api/veriff/status/${sessionId}`,
        );
        const data = await response.json();

        // Check for either decision field or status field with "approved" value
        if (data.decision === "approved" || data.status === "approved") {
          // Session is approved, refresh user data to get updated status
          queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });

          toast({
            title: "Verification Complete",
            description: "Your identity has been successfully verified!",
          });

          // Clear the session ID from localStorage as verification is complete
          localStorage.removeItem("veriffSessionId");
        }
      }
      // Otherwise, check the user's current verification status
      else {
        // Refresh user data to check if verification status has changed
        queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      }

      setLastChecked(new Date());
    } catch (error) {
      console.error("Error checking verification status:", error);
    } finally {
      setChecking(false);
    }
  };

  // Periodically check status
  useEffect(() => {
    if (!shouldCheck) return;

    // Initial check when component mounts
    checkStatus();

    // Set up interval for periodic checks
    const intervalId = setInterval(checkStatus, interval);

    // Clean up interval on unmount
    return () => clearInterval(intervalId);
  }, [user?.id, user?.profileStatus, sessionId, interval, shouldCheck]);

  return {
    checking,
    lastChecked,
    checkNow: checkStatus,
    isVerified: user?.profileStatus === "verified",
  };
}
