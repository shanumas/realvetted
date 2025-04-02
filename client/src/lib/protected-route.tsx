import { useAuth } from "@/hooks/use-auth";
import { Loader2 } from "lucide-react";
import { Redirect, Route } from "wouter";

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

  return (
    <Route path={path}>
      {() => {
        if (isLoading) {
          return (
            <div className="flex items-center justify-center min-h-screen">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          );
        }

        if (!user) {
          return <Redirect to="/auth" />;
        }

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

        return <Component />;
      }}
    </Route>
  );
}
