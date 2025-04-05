import { useAuth } from "@/hooks/use-auth";
import { Loader2 } from "lucide-react";
import { Redirect, Route } from "wouter";
import { useEffect, useState } from "react";

interface ProtectedRouteProps {
  path: string;
  component: () => React.ReactNode;
  allowedRoles: string[];
}

export function ProtectedRoute({
  path,
  component: Component,
  allowedRoles,
}: ProtectedRouteProps) {
  const { user, isLoading } = useAuth();
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  
  // Use this effect to handle initial authentication check
  useEffect(() => {
    // Only complete the auth check once we've confirmed loading is done
    if (!isLoading) {
      setIsCheckingAuth(false);
    }
  }, [isLoading]);

  return (
    <Route path={path}>
      {() => {
        // Show loading spinner while initially checking auth
        if (isLoading || isCheckingAuth) {
          return (
            <div className="flex items-center justify-center min-h-screen">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          );
        }

        // If user is not authenticated, redirect to auth page
        if (!user) {
          return <Redirect to="/auth" />;
        }

        // Special case: Allow agents and sellers to access buyer property pages
        if (path.startsWith('/buyer/property/') && (user.role === 'agent' || user.role === 'seller')) {
          return <Component />;
        }
        
        // If user doesn't have the required role, redirect to their dashboard
        if (!allowedRoles.includes(user.role)) {
          // Redirect to the appropriate dashboard based on role
          if (user.role === "buyer") {
            return <Redirect to="/buyer/dashboard" />;
          } else if (user.role === "seller") {
            return <Redirect to="/seller/dashboard" />;
          } else if (user.role === "agent") {
            return <Redirect to="/agent/dashboard" />;
          } else if (user.role === "admin") {
            return <Redirect to="/admin/dashboard" />;
          }
          
          // Fallback
          return <Redirect to="/auth" />;
        }

        // User is authenticated and has the right role
        return <Component />;
      }}
    </Route>
  );
}
