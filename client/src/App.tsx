import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "./hooks/use-auth";
import { ProtectedRoute } from "./lib/protected-route";
import AuthPage from "@/pages/auth-page";
import NotFound from "@/pages/not-found";
import BuyerKYC from "@/pages/buyer/kyc-verification";
import BuyerDashboard from "@/pages/buyer/dashboard";
import PropertyDetail from "@/pages/buyer/property-detail";
import AgentKYC from "@/pages/agent/kyc-verification";
import AgentDashboard from "@/pages/agent/dashboard";
import SellerDashboard from "@/pages/seller/dashboard";
import AdminDashboard from "@/pages/admin/dashboard";

function Router() {
  return (
    <Switch>
      <Route path="/auth" component={AuthPage} />
      
      {/* Buyer Routes */}
      <ProtectedRoute path="/buyer/kyc" component={BuyerKYC} allowedRoles={["buyer"]} />
      <ProtectedRoute path="/buyer/dashboard" component={BuyerDashboard} allowedRoles={["buyer"]} />
      <ProtectedRoute path="/buyer/property/:id" component={PropertyDetail} allowedRoles={["buyer"]} />
      
      {/* Agent Routes */}
      <ProtectedRoute path="/agent/kyc" component={AgentKYC} allowedRoles={["agent"]} />
      <ProtectedRoute path="/agent/dashboard" component={AgentDashboard} allowedRoles={["agent"]} />
      
      {/* Seller Routes */}
      <ProtectedRoute path="/seller/dashboard" component={SellerDashboard} allowedRoles={["seller"]} />
      
      {/* Admin Routes */}
      <ProtectedRoute path="/admin/dashboard" component={AdminDashboard} allowedRoles={["admin"]} />
      
      {/* Default route redirects to auth */}
      <Route path="/">
        <AuthPage />
      </Route>
      
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

export default App;
