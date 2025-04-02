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

type LoginData = {
  email: string;
  password: string;
  role: "buyer" | "seller" | "agent" | "admin";
};

type RegisterData = {
  email: string;
  password: string;
  role: "buyer" | "seller" | "agent" | "admin";
  firstName?: string;
  lastName?: string;
  profilePhotoUrl?: string;
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
  const [, setLocation] = useLocation();
  
  const {
    data: user,
    error,
    isLoading,
  } = useQuery<User | null, Error>({
    queryKey: ["/api/auth/user"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    initialData: null, // Explicitly set initial data to null
  });
  
  // Connect to WebSocket when user is authenticated
  useEffect(() => {
    if (user?.id) {
      console.log("Connecting WebSocket with user ID:", user.id);
      websocketClient.setUserId(user.id);
    }
  }, [user?.id]);

  const loginMutation = useMutation({
    mutationFn: async (credentials: LoginData) => {
      try {
        console.log("Login credentials:", credentials);
        // Don't re-validate here as it was already validated by the form
        const res = await apiRequest("POST", "/api/auth/login", credentials);
        return await res.json();
      } catch (error) {
        console.error("Login error:", error);
        throw new Error(error instanceof Error ? error.message : "Login failed");
      }
    },
    onSuccess: (user: User) => {
      queryClient.setQueryData(["/api/auth/user"], user);
      
      // Redirect based on role and verification status
      if (user.role === "buyer" && user.profileStatus !== "verified") {
        setLocation("/buyer/kyc");
      } else if (user.role === "agent" && user.profileStatus !== "verified") {
        setLocation("/agent/kyc");
      } else if (user.role === "buyer") {
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
        throw new Error(error instanceof Error ? error.message : "Registration failed");
      }
    },
    onSuccess: (user: User) => {
      queryClient.setQueryData(["/api/auth/user"], user);
      
      // Redirect based on role
      if (user.role === "buyer") {
        setLocation("/buyer/kyc");
      } else if (user.role === "agent") {
        setLocation("/agent/kyc");
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
      queryClient.setQueryData(["/api/auth/user"], null);
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
