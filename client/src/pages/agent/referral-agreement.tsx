import { useState, useRef, useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import SignatureCanvas from "react-signature-canvas";
import { Loader2, RefreshCw, Check } from "lucide-react";

// Schema for the referral agreement form
const referralAgreementSchema = z.object({
  agentName: z.string().min(1, "Full name is required"),
  licenseNumber: z.string().min(1, "License number is required"),
  address: z.string().min(1, "Address is required"),
  city: z.string().min(1, "City is required"),
  state: z.string().min(1, "State is required"),
  zip: z.string().min(1, "ZIP code is required"),
  agreeToTerms: z.literal(true, {
    errorMap: () => ({ message: "You must agree to the terms" }),
  }),
});

type ReferralAgreementValues = z.infer<typeof referralAgreementSchema>;

export default function ReferralAgreementPage() {
  const { user, isLoading: isLoadingAuth } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [signature, setSignature] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [lookingUpLicense, setLookingUpLicense] = useState(false);
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
    if (!isLoadingAgreement && existingAgreement?.hasSigned && user?.profileStatus === "verified") {
      navigate("/agent/dashboard");
    }
    
    // If agent has already signed the agreement but hasn't completed KYC, redirect to KYC page
    if (!isLoadingAgreement && existingAgreement?.hasSigned && user?.profileStatus !== "verified") {
      navigate("/agent/kyc");
    }
  }, [user, isLoadingAuth, isLoadingAgreement, existingAgreement, navigate]);

  const form = useForm<ReferralAgreementValues>({
    resolver: zodResolver(referralAgreementSchema),
    defaultValues: {
      agentName: user ? `${user.firstName || ""} ${user.lastName || ""}`.trim() : "",
      licenseNumber: user?.licenseNumber || "",
      address: user?.addressLine1 || "",
      city: user?.city || "",
      state: user?.state || "",
      zip: user?.zip || "",
      agreeToTerms: false as unknown as true, // This cast is necessary for the form to work with the z.literal(true) schema
    },
  });

  // Update form when user data loads
  useEffect(() => {
    if (user) {
      form.reset({
        agentName: `${user.firstName || ""} ${user.lastName || ""}`.trim(),
        licenseNumber: user.licenseNumber || "",
        address: user.addressLine1 || "",
        city: user.city || "",
        state: user.state || "",
        zip: user.zip || "",
        agreeToTerms: false as unknown as true, // This cast is necessary for the form to work with the z.literal(true) schema
      });
    }
  }, [user, form]);

  // Handle license lookup
  const handleLicenseLookup = async () => {
    const licenseNumber = form.getValues("licenseNumber");
    if (!licenseNumber) {
      toast({
        title: "License Number Required",
        description: "Please enter your license number to look up your information.",
        variant: "destructive",
      });
      return;
    }

    try {
      setLookingUpLicense(true);
      
      const response = await fetch(`/api/agent/license-lookup?licenseNumber=${encodeURIComponent(licenseNumber)}`);
      
      if (!response.ok) {
        throw new Error('Failed to look up license');
      }
      
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to find license information');
      }
      
      // Populate the form with the agent's details from the license lookup
      if (data.data) {
        const { name, address, city, state, zip } = data.data;
        
        // Update the form fields
        if (name) {
          form.setValue('agentName', name);
        }
        
        if (address) {
          form.setValue('address', address);
        }
        
        if (city) {
          form.setValue('city', city);
        }
        
        if (state) {
          form.setValue('state', state);
        }
        
        if (zip) {
          form.setValue('zip', zip);
        }
        
        toast({
          title: "License Information Found",
          description: "Your information has been filled based on your license details.",
        });
      }
      
    } catch (error) {
      console.error('License lookup error:', error);
      toast({
        title: 'License Lookup Failed',
        description: error instanceof Error ? error.message : 'Failed to look up license information',
        variant: 'destructive'
      });
    } finally {
      setLookingUpLicense(false);
    }
  };

  // Clear signature
  const clearSignature = () => {
    if (signatureRef.current) {
      signatureRef.current.clear();
      setSignature(null);
    }
  };

  // Preview the agreement
  const previewAgreement = async () => {
    const values = form.getValues();
    
    if (!signature) {
      toast({
        title: "Signature Required",
        description: "Please sign the agreement before previewing",
        variant: "destructive",
      });
      return;
    }

    try {
      const response = await fetch("/api/agreements/agent-referral/preview", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...values,
          signature,
          date: new Date().toISOString().split("T")[0], // Current date in YYYY-MM-DD format
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to generate preview");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      setPreviewUrl(url);
      setIsPreviewOpen(true);
    } catch (error) {
      console.error("Preview error:", error);
      toast({
        title: "Preview Failed",
        description: error instanceof Error ? error.message : "Failed to generate preview",
        variant: "destructive",
      });
    }
  };

  // Submit the agreement
  const submitAgreement = async (values: ReferralAgreementValues) => {
    if (!signature) {
      toast({
        title: "Signature Required",
        description: "Please sign the agreement",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsSubmitting(true);
      
      const response = await fetch("/api/agreements/agent-referral", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...values,
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
      queryClient.invalidateQueries({queryKey: ["/api/agreements/agent-referral"]});
      
      // Redirect to KYC verification page
      navigate("/agent/kyc");
      
    } catch (error) {
      console.error("Submission error:", error);
      toast({
        title: "Submission Failed",
        description: error instanceof Error ? error.message : "Failed to submit agreement",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoadingAuth || isLoadingAgreement) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container max-w-3xl py-8">
      <Card>
        <CardHeader>
          <CardTitle>Agent Referral Agreement</CardTitle>
          <CardDescription>
            As an agent using our platform, you agree to pay a 25% referral fee to 
            Randy Brummett for any transactions that result from leads provided 
            through this service.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(submitAgreement)}
              className="space-y-6"
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="agentName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Full Name</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="licenseNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>License Number</FormLabel>
                      <div className="flex space-x-2">
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <Button 
                          type="button" 
                          variant="outline"
                          onClick={handleLicenseLookup}
                          disabled={lookingUpLicense || !field.value}
                        >
                          {lookingUpLicense ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <RefreshCw className="mr-2 h-4 w-4" />
                          )}
                          Look Up
                        </Button>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="address"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Address</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <FormField
                  control={form.control}
                  name="city"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>City</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="state"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>State</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="zip"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>ZIP Code</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="space-y-4">
                <div>
                  <h3 className="font-medium mb-2">Agreement Terms</h3>
                  <div className="bg-gray-50 p-4 rounded-md text-sm">
                    <p className="mb-3">
                      I, <span className="font-bold">{form.watch("agentName") || "[Your Name]"}</span>, 
                      a licensed real estate agent with license number <span className="font-bold">{form.watch("licenseNumber") || "[License Number]"}</span>, 
                      hereby agree to pay a referral fee of 25% of any commission earned 
                      from transactions with clients referred to me through the PropertyMatch platform.
                    </p>
                    <p className="mb-3">
                      This referral fee shall be paid to Randy Brummett within 5 business days 
                      of my receipt of commission from the closing of any transaction with a 
                      referred client.
                    </p>
                    <p className="mb-3">
                      I understand that this is a legally binding agreement that applies to any 
                      and all clients I am introduced to through the PropertyMatch platform, 
                      regardless of when the transaction closes.
                    </p>
                    <p>
                      By signing below, I acknowledge that I have read, understood, and agree 
                      to abide by these terms.
                    </p>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">
                    Signature
                  </label>
                  <div className="border border-gray-300 rounded-md overflow-hidden mb-2">
                    <SignatureCanvas
                      ref={signatureRef}
                      canvasProps={{
                        className: "w-full h-40 bg-white",
                      }}
                      onEnd={() => {
                        if (signatureRef.current) {
                          setSignature(
                            signatureRef.current.toDataURL("image/png")
                          );
                        }
                      }}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={clearSignature}
                  >
                    Clear Signature
                  </Button>
                </div>

                <FormField
                  control={form.control}
                  name="agreeToTerms"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                      <div className="space-y-1 leading-none">
                        <FormLabel>
                          I agree to the terms of this referral agreement
                        </FormLabel>
                        <FormMessage />
                      </div>
                    </FormItem>
                  )}
                />
              </div>

              <div className="flex justify-between pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={previewAgreement}
                  disabled={!signature || isSubmitting}
                >
                  Preview Agreement
                </Button>
                <Button
                  type="submit"
                  disabled={!signature || isSubmitting}
                >
                  {isSubmitting ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="mr-2 h-4 w-4" />
                  )}
                  Submit Agreement
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>

      {/* Preview Dialog */}
      <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Agreement Preview</DialogTitle>
            <DialogDescription>
              Review your agreement before submitting
            </DialogDescription>
          </DialogHeader>
          <div className="w-full h-[70vh]">
            {previewUrl && (
              <iframe
                src={previewUrl}
                className="w-full h-full border-0"
                title="Agreement Preview"
              />
            )}
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setIsPreviewOpen(false)}>
              Close Preview
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}