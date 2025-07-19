import { Switch, Route, Redirect, useLocation } from "wouter";
import React, { useEffect, Suspense, lazy } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "./hooks/use-auth";

// Lazy load pages
const PublicViewingRequest = lazy(() => import("@/pages/public/viewing-request"));
const AgentEmailOutbox = lazy(() => import("@/pages/agent/email-outbox"));
import { ProtectedRoute } from "./lib/protected-route";
import AuthPage from "@/pages/auth-page";
import AdminLoginPage from "@/pages/admin-login";
import NotFound from "@/pages/not-found";
import BuyerDashboard from "@/pages/buyer/dashboard";
import BuyerPropertyDetail from "@/pages/buyer/property-detail";
import BuyerProfile from "@/pages/buyer/profile";
import AgentDashboard from "@/pages/agent/dashboard";
import AgentPropertyDetail from "@/pages/agent/property-detail";
import SellerDashboard from "@/pages/seller/dashboard";
import SellerPropertyDetail from "@/pages/seller/property-detail";
import SellerPropertyView from "@/pages/seller/property-view";
import AdminDashboard from "@/pages/admin/dashboard";
import { Loader2 } from "lucide-react";

interface RouteParams {
  token?: string;
  id?: string;
}

function Router() {
  return (
    <Switch>
      <Route path="/auth" component={AuthPage} />
      <Route path="/admin" component={AdminLoginPage} />
      
      {/* Buyer Routes */}
      <ProtectedRoute path="/buyer/dashboard" component={BuyerDashboard} allowedRoles={["buyer"]} />
      <ProtectedRoute path="/buyer/property/:id" component={BuyerPropertyDetail} allowedRoles={["buyer"]} />
      <ProtectedRoute path="/buyer/profile" component={BuyerProfile} allowedRoles={["buyer"]} />
      
      {/* Agent Routes */}
      <ProtectedRoute path="/agent/dashboard" component={AgentDashboard} allowedRoles={["agent"]} />
      <ProtectedRoute path="/agent/property/:id" component={AgentPropertyDetail} allowedRoles={["agent"]} />
      <Route path="/agent/email-outbox">
        {() => (
          <Suspense fallback={<div className="flex items-center justify-center min-h-screen">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="ml-2">Loading email outbox...</p>
          </div>}>
            <AgentEmailOutbox />
          </Suspense>
        )}
      </Route>
      
      {/* Seller Routes */}
      <ProtectedRoute path="/seller/dashboard" component={SellerDashboard} allowedRoles={["seller"]} />
      <ProtectedRoute path="/seller/property/:id" component={SellerPropertyDetail} allowedRoles={["seller"]} />
      <ProtectedRoute path="/seller/property-view/:id" component={SellerPropertyView} allowedRoles={["seller"]} />
      
      {/* Admin Routes */}
      <ProtectedRoute path="/admin/dashboard" component={AdminDashboard} allowedRoles={["admin"]} />
      
      {/* Public Routes */}
      <Route path="/viewing-request/:token">
        {(params) => (
          <Suspense fallback={<div className="flex items-center justify-center min-h-screen">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="ml-2">Loading viewing request...</p>
          </div>}>
            <PublicViewingRequest token={params.token} />
          </Suspense>
        )}
      </Route>
      
      {/* Home Page */}
      <Route path="/" component={HomePage} />
      
      {/* 404 Page */}
      <Route component={NotFound} />
    </Switch>
  );
}

// Home page with redirection logic based on authentication status
function HomePage() {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  
  // Clear stale session data when landing on home page
  useEffect(() => {
    if (!user) {
      localStorage.removeItem("lastLocation");
    }
  }, [user]);
  
  // Handle redirections based on auth status
  useEffect(() => {
    if (isLoading) return; // Wait until loading finishes
    
    if (!user) {
      // If not authenticated, redirect to auth page
      setLocation("/auth");
      return;
    }
    
    // For authenticated users, determine the appropriate redirect
    const lastLocation = localStorage.getItem("lastLocation");
    const isDefaultPath = !lastLocation || 
                          lastLocation === '/' || 
                          lastLocation === '/auth' || 
                          lastLocation.includes('/kyc') || 
                          lastLocation.includes('/referral-agreement');
    
    // Only redirect if there's no valid saved location
    if (isDefaultPath) {
      // Default redirection based on role and verification status
      if (user.role === "buyer") {
        setLocation("/buyer/dashboard");
      } else if (user.role === "seller") {
        setLocation("/seller/dashboard");
      } else if (user.role === "admin") {
        setLocation("/admin/dashboard");
      } else if (user.role === "agent") {
        // Simplified agent onboarding - skip KYC and referral agreement checks
        setLocation("/agent/dashboard");
      }
    } else {
      // Restore the last visited location
      console.log("Restoring last location:", lastLocation);
      setLocation(lastLocation);
    }
  }, [user, isLoading, setLocation]);
  
  // Show loading spinner while checking auth status
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  
  // This component doesn't render anything as it only handles redirects
  return null;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Router />
      </AuthProvider>
    </QueryClientProvider>
  );
}
