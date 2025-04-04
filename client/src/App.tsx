import { Switch, Route, Redirect, useLocation } from "wouter";
import { useEffect } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "./hooks/use-auth";
import { ProtectedRoute } from "./lib/protected-route";
import AuthPage from "@/pages/auth-page";
import NotFound from "@/pages/not-found";
import BuyerKYC from "@/pages/buyer/kyc-verification";
import BuyerDashboard from "@/pages/buyer/dashboard";
import BuyerPropertyDetail from "@/pages/buyer/property-detail";
import AgentKYC from "@/pages/agent/kyc-verification";
import AgentDashboard from "@/pages/agent/dashboard";
import AgentPropertyDetail from "@/pages/agent/property-detail";
import SellerDashboard from "@/pages/seller/dashboard";
import SellerPropertyDetail from "@/pages/seller/property-detail";
import AdminDashboard from "@/pages/admin/dashboard";
import { Loader2 } from "lucide-react";

function Router() {
  return (
    <Switch>
      <Route path="/auth" component={AuthPage} />
      
      {/* Buyer Routes */}
      <ProtectedRoute path="/buyer/kyc" component={BuyerKYC} allowedRoles={["buyer"]} />
      <ProtectedRoute path="/buyer/dashboard" component={BuyerDashboard} allowedRoles={["buyer"]} />
      <ProtectedRoute path="/buyer/property/:id" component={BuyerPropertyDetail} allowedRoles={["buyer"]} />
      
      {/* Agent Routes */}
      <ProtectedRoute path="/agent/kyc" component={AgentKYC} allowedRoles={["agent"]} />
      <ProtectedRoute path="/agent/dashboard" component={AgentDashboard} allowedRoles={["agent"]} />
      <ProtectedRoute path="/agent/property/:id" component={AgentPropertyDetail} allowedRoles={["agent"]} />
      
      {/* Seller Routes */}
      <ProtectedRoute path="/seller/dashboard" component={SellerDashboard} allowedRoles={["seller"]} />
      <ProtectedRoute path="/seller/property/:id" component={SellerPropertyDetail} allowedRoles={["seller"]} />
      
      {/* Admin Routes */}
      <ProtectedRoute path="/admin/dashboard" component={AdminDashboard} allowedRoles={["admin"]} />
      
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
      if (!lastLocation || lastLocation === '/' || lastLocation === '/auth') {
        // Default redirection based on role and verification status
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
