import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, Mail, AlertCircle, CheckCircle2, Pencil, X, Check } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

interface AgentEmailEditorProps {
  propertyId: number;
  currentEmail: string | null;
  inline?: boolean;
}

export function AgentEmailEditor({ propertyId, currentEmail, inline = false }: AgentEmailEditorProps) {
  const { toast } = useToast();
  const [email, setEmail] = useState(currentEmail || "");
  const [showSuccess, setShowSuccess] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isInlineEditing, setIsInlineEditing] = useState(false);

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
      setIsDialogOpen(false);
      setIsInlineEditing(false);
      
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
  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    
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
      setIsDialogOpen(false);
      setIsInlineEditing(false);
      return;
    }
    
    updateEmailMutation.mutate(email);
  };

  // For inline editing mode
  if (inline) {
    if (isInlineEditing) {
      return (
        <div className="flex items-center space-x-2">
          <Input
            type="email"
            placeholder="agent@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-8 w-52 text-sm"
            autoFocus
          />
          <Button 
            size="icon" 
            variant="ghost" 
            onClick={handleSubmit}
            disabled={updateEmailMutation.isPending}
            className="h-8 w-8"
          >
            {updateEmailMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Check className="h-4 w-4" />
            )}
          </Button>
          <Button 
            size="icon" 
            variant="ghost" 
            onClick={() => {
              setEmail(currentEmail || "");
              setIsInlineEditing(false);
            }}
            className="h-8 w-8"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      );
    }
    
    return (
      <div className="flex items-center">
        <span className="text-gray-700">{currentEmail}</span>
        <Button 
          size="icon" 
          variant="ghost" 
          onClick={() => setIsInlineEditing(true)}
          className="h-7 w-7 ml-2"
          title="Edit agent email"
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
      </div>
    );
  }

  // For full dialog mode
  return (
    <>
      <Button 
        variant="outline" 
        size="sm" 
        onClick={() => setIsDialogOpen(true)}
        className="flex items-center"
      >
        <Pencil className="mr-1 h-3 w-3" />
        Edit Agent Email
      </Button>
      
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center">
              <Mail className="mr-2 h-5 w-5" />
              Update Agent Email
            </DialogTitle>
            <DialogDescription>
              Update the listing agent's email address for this property
            </DialogDescription>
          </DialogHeader>
          
          <form onSubmit={handleSubmit}>
            {showSuccess && (
              <Alert className="mb-4 bg-green-50 text-green-800 border-green-300">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <AlertTitle>Success</AlertTitle>
                <AlertDescription>
                  The agent email has been updated successfully.
                </AlertDescription>
              </Alert>
            )}
            
            <div className="space-y-4 py-4">
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
            
            <DialogFooter>
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => setIsDialogOpen(false)}
              >
                Cancel
              </Button>
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
                  "Save Changes"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}