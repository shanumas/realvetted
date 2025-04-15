import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, Mail, AlertCircle, CheckCircle2 } from "lucide-react";

interface AgentEmailEditorProps {
  propertyId: number;
  currentEmail: string | null;
}

export function AgentEmailEditor({ propertyId, currentEmail }: AgentEmailEditorProps) {
  const { toast } = useToast();
  const [email, setEmail] = useState(currentEmail || "");
  const [showSuccess, setShowSuccess] = useState(false);

  // Mutation to update the agent email
  const updateEmailMutation = useMutation({
    mutationFn: async (agentEmail: string) => {
      const response = await apiRequest(
        "PATCH",
        `/api/properties/${propertyId}/agent-email`,
        { agentEmail }
      );
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to update agent email");
      }
      
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Agent email updated",
        description: "The agent email has been successfully updated.",
      });
      setShowSuccess(true);
      
      // Hide success message after 3 seconds
      setTimeout(() => {
        setShowSuccess(false);
      }, 3000);
      
      // Invalidate property queries to refresh property data
      queryClient.invalidateQueries({ queryKey: [`/api/properties/${propertyId}`] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update agent email",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Handle form submission
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Simple email validation
    if (!email || !email.includes("@") || !email.includes(".")) {
      toast({
        title: "Invalid email",
        description: "Please enter a valid email address.",
        variant: "destructive",
      });
      return;
    }
    
    // If the email hasn't changed, don't submit
    if (email === currentEmail) {
      toast({
        title: "No changes",
        description: "The email address has not changed.",
      });
      return;
    }
    
    updateEmailMutation.mutate(email);
  };

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle className="text-xl flex items-center">
          <Mail className="mr-2 h-5 w-5" />
          Agent Email Settings
        </CardTitle>
        <CardDescription>
          Update the listing agent's email address for this property
        </CardDescription>
      </CardHeader>
      
      <form onSubmit={handleSubmit}>
        <CardContent>
          {showSuccess && (
            <Alert className="mb-4 bg-green-50 text-green-800 border-green-300">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              <AlertTitle>Success</AlertTitle>
              <AlertDescription>
                The agent email has been updated successfully.
              </AlertDescription>
            </Alert>
          )}
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="agentEmail">Agent Email Address</Label>
              <Input
                id="agentEmail"
                type="email"
                placeholder="agent@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={updateEmailMutation.isPending}
              />
              <p className="text-xs text-gray-500">
                This email will be used to contact the listing agent about this property.
              </p>
            </div>
          </div>
        </CardContent>
        
        <CardFooter className="flex justify-end">
          <Button 
            type="submit" 
            disabled={updateEmailMutation.isPending || email === currentEmail || !email}
          >
            {updateEmailMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Updating...
              </>
            ) : (
              <>
                Save Changes
              </>
            )}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}