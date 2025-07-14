import { createContext, ReactNode, useContext, useEffect } from "react";
import {
  useQuery,
  useMutation,
  UseMutationResult,
} from "@tanstack/react-query";
import { User, loginUserSchema, registerUserSchema } from "@shared/schema";
import { getQueryFn, apiRequest, queryClient } from "../lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import websocketClient from "@/lib/websocket";

// Helper function to save the current location
function saveCurrentLocation(location: string) {
  // Don't save auth page
  if (location === "/auth") return;
  localStorage.setItem("lastLocation", location);
}

// Helper function to get the last saved location
function getLastLocation(): string | null {
  return localStorage.getItem("lastLocation");
}

type LoginData = {
  email: string;
  password: string;
  role: "buyer" | "seller" | "agent" | "admin";
  rememberMe?: boolean;
};

type RegisterData = {
  email: string;
  password: string;
  role: "buyer" | "seller" | "agent" | "admin";
  firstName?: string;
  lastName?: string;
  profilePhotoUrl?: string;
  licenseNumber?: string;
};

type AuthContextType = {
  user: User | null;
  isLoading: boolean;
  error: Error | null;
  loginMutation: UseMutationResult<User, Error, LoginData>;
  logoutMutation: UseMutationResult<void, Error, void>;
  registerMutation: UseMutationResult<User, Error, RegisterData>;
};

export const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();
  const [location, setLocation] = useLocation();

  // Save current location whenever it changes
  useEffect(() => {
    saveCurrentLocation(location);
  }, [location]);

  const {
    data: user,
    error,
    isLoading,
  } = useQuery<User | null, Error>({
    queryKey: ["/api/auth/user"], // Simplified key without timestamp to prevent excessive refreshing
    queryFn: getQueryFn({ on401: "returnNull" }),
    initialData: null, // Explicitly set initial data to null
    refetchOnWindowFocus: true,
    refetchOnMount: true,
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 1, // Single retry is enough
    retryDelay: 1000, // Wait 1 second between retries
  });

  // Connect to WebSocket when user is authenticated
  useEffect(() => {
    if (user?.id) {
      console.log("Connecting WebSocket with user ID:", user.id);
      websocketClient.setUserId(user.id);
    }
  }, [user?.id]);

  // Restore last location on authentication if on the root path
  useEffect(() => {
    // Only run when authentication is confirmed and we're at the root
    if (!isLoading && user && location === "/") {
      const lastLocation = getLastLocation();
      if (lastLocation) {
        console.log("Restoring last location:", lastLocation);
        setLocation(lastLocation);
      }
    }
  }, [isLoading, user, location, setLocation]);

  const loginMutation = useMutation({
    mutationFn: async (credentials: LoginData) => {
      try {
        console.log("Login credentials:", credentials);
        // Don't re-validate here as it was already validated by the form
        const res = await apiRequest("POST", "/api/auth/login", credentials);
        return await res.json();
      } catch (error) {
        console.error("Login error:", error);
        throw new Error(
          error instanceof Error ? error.message : "Login failed",
        );
      }
    },
    onSuccess: (user: User) => {
      queryClient.setQueryData(["/api/auth/user"], user);

      // Redirect based on role and verification status
      if (user.role === "agent" && user.profileStatus !== "verified") {
        setLocation("/agent/kyc");
      } else if (user.role === "buyer") {
        // Always redirect buyers to dashboard regardless of verification status
        // Buyers can still use the platform and will see a verification banner on the dashboard
        setLocation("/buyer/dashboard");
      } else if (user.role === "seller") {
        setLocation("/seller/dashboard");
      } else if (user.role === "agent") {
        setLocation("/agent/dashboard");
      } else if (user.role === "admin") {
        setLocation("/admin/dashboard");
      }

      toast({
        title: "Login successful",
        description: `Welcome back, ${user.firstName || user.email}!`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Login failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const registerMutation = useMutation({
    mutationFn: async (data: RegisterData) => {
      try {
        console.log("Register data:", data);
        // Don't re-validate here as it was already validated by the form
        const res = await apiRequest("POST", "/api/auth/register", data);
        return await res.json();
      } catch (error) {
        console.error("Registration error:", error);
        throw new Error(
          error instanceof Error ? error.message : "Registration failed",
        );
      }
    },
    onSuccess: (user: User) => {
      queryClient.setQueryData(["/api/auth/user"], user);

      // Redirect based on role
      if (user.role === "buyer") {
        // Send buyers directly to dashboard after signup
        setLocation("/buyer/dashboard");
      } else if (user.role === "agent") {
        // For agents, redirect to referral agreement page immediately after signup
        setLocation("/agent/dashboard");
      } else if (user.role === "seller") {
        setLocation("/seller/dashboard");
      } else if (user.role === "admin") {
        setLocation("/admin/dashboard");
      }

      toast({
        title: "Registration successful",
        description: "Your account has been created successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Registration failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/auth/logout");
    },
    onSuccess: () => {
      // Clear user data from query client cache
      queryClient.setQueryData(["/api/auth/user"], null);

      // Invalidate all queries to ensure clean state
      queryClient.invalidateQueries();

      // Reset the query client completely to ensure no stale data persists
      queryClient.clear();

      // Clear all localStorage items to ensure clean session
      localStorage.removeItem("lastLocation");

      // Additional cleanup for any other stored items
      localStorage.removeItem("veriffSessionId");

      // Disconnect WebSocket
      websocketClient.disconnect();

      // Redirect to auth page
      setLocation("/auth");

      toast({
        title: "Logged out",
        description: "You have been logged out successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Logout failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  //console.log('DATABASE_URL:', process.env.DATABASE_URL);

  return (
    <AuthContext.Provider
      value={{
        user: user ?? null,
        isLoading,
        error,
        loginMutation,
        logoutMutation,
        registerMutation,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
