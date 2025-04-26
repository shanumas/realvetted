import { Switch, Route, Redirect, useLocation } from "wouter";
import React, { useEffect, Suspense, lazy } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "./hooks/use-auth";

// Lazy load pages
const PublicViewingRequest = lazy(() => import("@/pages/public/viewing-request"));
const AgentEmailOutbox = lazy(() => import("@/pages/agent/email-outbox"));
const AdminEmailOutbox = lazy(() => import("@/pages/admin/email-outbox"));
import { ProtectedRoute } from "./lib/protected-route";
import AuthPage from "@/pages/auth-page";
import NotFound from "@/pages/not-found";
import BuyerDashboard from "@/pages/buyer/dashboard";
import BuyerPropertyDetail from "@/pages/buyer/property-detail";
import BuyerProfile from "@/pages/buyer/profile";
import AgentKYC from "@/pages/agent/kyc-verification";
import AgentDashboard from "@/pages/agent/dashboard";
import AgentPropertyDetail from "@/pages/agent/property-detail";
import AgentReferralAgreement from "@/pages/agent/referral-agreement";
import SellerDashboard from "@/pages/seller/dashboard";
import SellerPropertyDetail from "@/pages/seller/property-detail";
import SellerPropertyView from "@/pages/seller/property-view";
import AdminDashboard from "@/pages/admin/dashboard";
import { Loader2 } from "lucide-react";

function Router() {
  return (
    <Switch>
      <Route path="/auth" component={AuthPage} />
      
      {/* Buyer Routes */}
      <ProtectedRoute path="/buyer/dashboard" component={BuyerDashboard} allowedRoles={["buyer"]} />
      <ProtectedRoute path="/buyer/property/:id" component={BuyerPropertyDetail} allowedRoles={["buyer"]} />
      <ProtectedRoute path="/buyer/profile" component={BuyerProfile} allowedRoles={["buyer"]} />
      
      {/* Agent Routes */}
      <ProtectedRoute path="/agent/kyc" component={AgentKYC} allowedRoles={["agent"]} />
      <ProtectedRoute path="/agent/referral-agreement" component={AgentReferralAgreement} allowedRoles={["agent"]} />
      <ProtectedRoute path="/agent/dashboard" component={AgentDashboard} allowedRoles={["agent"]} />
      <ProtectedRoute path="/agent/property/:id" component={AgentPropertyDetail} allowedRoles={["agent"]} />
      <ProtectedRoute path="/agent/email-outbox" component={(props) => (
        <Suspense fallback={<div className="flex items-center justify-center min-h-screen">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="ml-2">Loading email outbox...</p>
        </div>}>
          <AgentEmailOutbox {...props} />
        </Suspense>
      )} allowedRoles={["agent"]} />
      
      {/* Seller Routes */}
      <ProtectedRoute path="/seller/dashboard" component={SellerDashboard} allowedRoles={["seller"]} />
      <ProtectedRoute path="/seller/property/:id" component={SellerPropertyDetail} allowedRoles={["seller"]} />
      <ProtectedRoute path="/seller/property-view/:id" component={SellerPropertyView} allowedRoles={["seller"]} />
      
      {/* Admin Routes */}
      <ProtectedRoute path="/admin/dashboard" component={AdminDashboard} allowedRoles={["admin"]} />
      <ProtectedRoute path="/admin/email-outbox" component={(props) => (
        <Suspense fallback={<div className="flex items-center justify-center min-h-screen">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="ml-2">Loading admin email outbox...</p>
        </div>}>
          <AdminEmailOutbox {...props} />
        </Suspense>
      )} allowedRoles={["admin"]} />
      
      {/* Public Routes (No Authentication Required) */}
      <Route path="/public/viewing-request/:token" component={(props) => (
        <Suspense fallback={<div className="flex items-center justify-center min-h-screen">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="ml-2">Loading viewing request...</p>
        </div>}>
          <PublicViewingRequest {...props} />
        </Suspense>
      )} />
      
      {/* Default route redirects to auth page */}
      <Route path="/" component={HomePage} />
      
      {/* Fallback to 404 */}
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Router />
      </AuthProvider>
    </QueryClientProvider>
  );
}

// Home page with redirection logic based on authentication status
function HomePage() {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  
  // Effect to redirect based on auth status and role
  useEffect(() => {
    if (!isLoading && user) {
      // Try to restore the last visited location from localStorage
      const lastLocation = localStorage.getItem("lastLocation");
      
      // Only redirect if there's no saved location or the saved location is the root/auth page
      if (!lastLocation || lastLocation === '/' || lastLocation === '/auth' || lastLocation === '/buyer/kyc') {
        // Default redirection based on role and verification status
        if (user.role === "buyer") {
          // Buyers go directly to dashboard regardless of verification status
          // This allows tracking of buyer journey without requiring KYC
          setLocation("/buyer/dashboard");
        } else if (user.role === "agent" && user.profileStatus !== "verified") {
          setLocation("/agent/kyc");
        } else if (user.role === "agent" && user.profileStatus === "verified") {
          // Check if agent has signed the referral agreement
          const checkReferralAgreement = async () => {
            try {
              const response = await fetch('/api/agreements/agent-referral');
              const data = await response.json();
              
              if (!data.data) {
                // No referral agreement found, redirect to sign
                setLocation("/agent/referral-agreement");
              } else {
                // Agreement exists, go to dashboard
                setLocation("/agent/dashboard");
              }
            } catch (error) {
              console.error("Error checking referral agreement:", error);
              // Default to dashboard
              setLocation("/agent/dashboard");
            }
          };
          
          checkReferralAgreement();
        } else if (user.role === "seller") {
          setLocation("/seller/dashboard");
        } else if (user.role === "admin") {
          setLocation("/admin/dashboard");
        }
      } else {
        // Restore the last visited location
        console.log("Restoring last location:", lastLocation);
        setLocation(lastLocation);
      }
    }
  }, [user, isLoading, setLocation]);
  
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  
  // If not logged in or still loading, show the auth page
  if (!user) {
    return <AuthPage />;
  }
  
  // This will show briefly during redirection
  return (
    <div className="flex items-center justify-center min-h-screen">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}

export default App;
