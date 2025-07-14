import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import SignatureCanvas from "react-signature-canvas";
import { Loader2, FileText } from "lucide-react";

import { useAuth } from "@/hooks/use-auth";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogHeader,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function ReferralAgreementPage() {
  const { user, isLoading: isLoadingAuth } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [signature, setSignature] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [agreeToTerms, setAgreeToTerms] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [isConfirmDialogOpen, setIsConfirmDialogOpen] = useState(false);
  const signatureRef = useRef<SignatureCanvas>(null);

  // Query to check if user has already signed the agreement
  const { data: existingAgreement, isLoading: isLoadingAgreement } = useQuery({
    queryKey: ["/api/agreements/agent-referral"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/agreements/agent-referral");
      return res.json();
    },
    enabled: !!user,
    retry: false,
  });

  // Redirect if not logged in or not an agent
  useEffect(() => {
    if (!isLoadingAuth && !user) {
      navigate("/auth");
      return;
    }

    if (!isLoadingAuth && user && user.role !== "agent") {
      navigate("/");
      return;
    }

    // If agent has already signed the agreement and has completed KYC, redirect to dashboard
    if (
      !isLoadingAgreement &&
      existingAgreement?.data &&
      user?.profileStatus === "verified"
    ) {
      navigate("/agent/dashboard");
    }

    // If agent has already signed the agreement but hasn't completed KYC, redirect to KYC page
    if (
      !isLoadingAgreement &&
      existingAgreement?.data &&
      user?.profileStatus !== "verified"
    ) {
      //navigate("/agent/kyc");
    }
  }, [user, isLoadingAuth, isLoadingAgreement, existingAgreement, navigate]);

  // Load the pre-filled PDF when component mounts
  useEffect(() => {
    if (user && user.role === "agent") {
      loadPrefillePdf();
    }
  }, [user]);

  // Handle changes to the signature canvas
  const handleSignatureEnd = () => {
    if (signatureRef.current) {
      const dataURL = signatureRef.current.toDataURL("image/png");
      setSignature(dataURL);
    }
  };

  // Clear signature
  const clearSignature = () => {
    if (signatureRef.current) {
      signatureRef.current.clear();
      setSignature(null);
    }
  };

  // Load the pre-filled PDF with agent information
  const loadPrefillePdf = async () => {
    try {
      // Request the pre-filled PDF with agent information already populated
      const response = await fetch("/api/agreements/agent-referral/pdf");

      if (!response.ok) {
        throw new Error("Failed to load agreement PDF");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      setPdfUrl(url);
    } catch (error) {
      console.error("Error loading agreement PDF:", error);
      toast({
        title: "Error",
        description: "Failed to load the agreement PDF. Please try again.",
        variant: "destructive",
      });
    }
  };

  // Submit the signed agreement
  const submitSignedAgreement = async () => {
    if (!signature) {
      toast({
        title: "Signature Required",
        description: "Please sign the agreement before submitting",
        variant: "destructive",
      });
      return;
    }

    if (!agreeToTerms) {
      toast({
        title: "Agreement Required",
        description: "You must agree to the terms before submitting",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsSubmitting(true);
      setIsConfirmDialogOpen(false);

      // Get the user data to submit with the signature
      const response = await fetch("/api/agreements/agent-referral", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          signature,
          date: new Date().toISOString().split("T")[0], // Current date in YYYY-MM-DD format
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to submit agreement");
      }

      const data = await response.json();

      toast({
        title: "Agreement Submitted",
        description: "Your referral agreement has been submitted successfully",
      });

      // Invalidate the query to refetch the agreement status
      queryClient.invalidateQueries({
        queryKey: ["/api/agreements/agent-referral"],
      });

      // Redirect to KYC verification page
      navigate("/agent/dashboard");
    } catch (error) {
      console.error("Submission error:", error);
      toast({
        title: "Submission Failed",
        description:
          error instanceof Error ? error.message : "Failed to submit agreement",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Open confirmation dialog
  const openConfirmDialog = () => {
    if (!signature) {
      toast({
        title: "Signature Required",
        description: "Please sign the agreement before submitting",
        variant: "destructive",
      });
      return;
    }

    if (!agreeToTerms) {
      toast({
        title: "Agreement Required",
        description: "You must agree to the terms before submitting",
        variant: "destructive",
      });
      return;
    }

    setIsConfirmDialogOpen(true);
  };

  if (isLoadingAuth || isLoadingAgreement) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container max-w-5xl py-8">
      <Card>
        <CardHeader>
          <CardTitle>Agent Referral Agreement</CardTitle>
          <CardDescription>
            Review and sign the referral agreement to join our platform. As an
            agent, you agree to pay a 25% referral fee to Randy Brummett for any
            transactions that result from leads provided through this service.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* PDF Viewer */}
          <div className="border border-gray-200 rounded-lg overflow-hidden bg-white h-[500px]">
            {pdfUrl ? (
              <iframe
                src={pdfUrl}
                className="w-full h-full"
                title="Agent Referral Agreement"
              />
            ) : (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            )}
          </div>

          {/* Signature Area */}
          <div className="space-y-2">
            <h3 className="text-lg font-medium">Your Signature</h3>
            <p className="text-sm text-gray-500">
              Sign below to indicate your agreement to the referral terms.
            </p>

            <div className="border border-gray-300 rounded-md p-2 bg-white">
              <SignatureCanvas
                ref={signatureRef}
                onEnd={handleSignatureEnd}
                canvasProps={{
                  className: "signature-canvas w-full h-40",
                }}
              />
            </div>

            <div className="flex justify-end space-x-2">
              <Button type="button" variant="outline" onClick={clearSignature}>
                Clear
              </Button>
            </div>
          </div>

          {/* Agreement Checkbox */}
          <div className="flex items-start space-x-3 pt-4">
            <Checkbox
              id="agreeToTerms"
              checked={agreeToTerms}
              onCheckedChange={(checked) => {
                setAgreeToTerms(checked === true);
              }}
            />
            <div className="space-y-1 leading-none">
              <Label htmlFor="agreeToTerms">
                I agree to the referral fee agreement terms
              </Label>
              <p className="text-sm text-gray-500">
                By checking this box, you agree to pay a 25% referral fee for
                any transactions resulting from leads provided through this
                platform.
              </p>
            </div>
          </div>
        </CardContent>
        <CardFooter className="flex justify-end gap-2">
          <Button
            type="button"
            onClick={openConfirmDialog}
            disabled={isSubmitting || !signature || !agreeToTerms}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Submitting...
              </>
            ) : (
              <>
                <FileText className="mr-2 h-4 w-4" />
                Sign and Submit
              </>
            )}
          </Button>
        </CardFooter>
      </Card>

      {/* Confirmation Dialog */}
      <Dialog open={isConfirmDialogOpen} onOpenChange={setIsConfirmDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Submission</DialogTitle>
            <DialogDescription>
              Are you sure you want to submit this agreement? This action cannot
              be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsConfirmDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button onClick={submitSignedAgreement} disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Submitting...
                </>
              ) : (
                "Confirm and Submit"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
