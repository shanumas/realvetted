import { useState } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { createVeriffSession, launchVeriff } from "@/lib/veriff";
import { apiRequest } from "@/lib/queryClient";
import { Loader2, Check, ExternalLink } from "lucide-react";
import { kycUpdateSchema } from "@shared/schema";

type KYCFormValues = z.infer<typeof kycUpdateSchema>;

export default function BuyerKYC() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isVerificationStarted, setIsVerificationStarted] = useState(false);
  const [verificationSessionId, setVerificationSessionId] = useState<string | null>(null);

  const form = useForm<KYCFormValues>({
    resolver: zodResolver(kycUpdateSchema),
    defaultValues: {
      firstName: user?.firstName || "",
      lastName: user?.lastName || "",
      dateOfBirth: "",
      addressLine1: user?.addressLine1 || "",
      addressLine2: user?.addressLine2 || "",
      city: user?.city || "",
      state: user?.state || "",
      zip: user?.zip || "",
    },
  });

  // Start Veriff verification flow
  const startVerification = async () => {
    try {
      setIsSubmitting(true);
      
      // Create a Veriff verification session
      const sessionData = await createVeriffSession();
      setVerificationSessionId(sessionData.sessionId);
      
      // Store session ID in localStorage to allow background checking
      localStorage.setItem('veriffSessionId', sessionData.sessionId);
      
      // Launch Veriff verification
      launchVeriff(sessionData.url, handleVerificationComplete);
      
      // Update UI
      setIsVerificationStarted(true);
      
      toast({
        title: "Verification Started",
        description: "Please complete the identity verification process in the new window.",
      });
    } catch (error) {
      console.error("Verification error:", error);
      toast({
        title: "Verification failed",
        description: error instanceof Error ? error.message : "An unexpected error occurred",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };
  
  // Handle the completion of Veriff verification
  const handleVerificationComplete = async (status: 'completed' | 'canceled' | 'error') => {
    if (status === 'completed') {
      toast({
        title: "Verification Submitted",
        description: "Your identity verification has been submitted and is being processed.",
      });
      
      // Update user profile with basic info
      await submitBasicInfo();
    } else if (status === 'canceled') {
      toast({
        title: "Verification Canceled",
        description: "You canceled the verification process. Please try again when ready.",
        variant: "destructive",
      });
      setIsVerificationStarted(false);
    } else {
      toast({
        title: "Verification Error",
        description: "There was an error with the verification process. Please try again.",
        variant: "destructive",
      });
      setIsVerificationStarted(false);
    }
  };
  
  // Submit the basic user info even without completing verification
  const submitBasicInfo = async () => {
    try {
      setIsSubmitting(true);
      
      // Get the form values
      const values = form.getValues();
      
      // Update user profile with KYC info
      const response = await apiRequest("PUT", "/api/users/kyc", {
        ...values,
        verificationSessionId
      });

      if (!response.ok) {
        throw new Error("Failed to submit profile information");
      }

      // Redirect to dashboard
      navigate("/buyer/dashboard");
    } catch (error) {
      console.error("Profile submission error:", error);
      toast({
        title: "Submission failed",
        description: error instanceof Error ? error.message : "An unexpected error occurred",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };
  
  // Submit handler for the form
  const onSubmit = async (values: KYCFormValues) => {
    // Start the verification process
    await startVerification();
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <h2 className="text-center text-3xl font-extrabold text-gray-900">
          Identity Verification
        </h2>
        <p className="mt-2 text-center text-sm text-gray-600">
          We need to verify your identity before you can start using PropertyMatch
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <Card>
          <CardContent className="pt-6">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <div>
                  <h3 className="text-lg font-medium text-gray-900">Identity Verification</h3>
                  <p className="text-sm text-gray-500 mt-1">
                    We use Veriff, a trusted identity verification service, to securely verify your identity.
                  </p>
                </div>
                
                <div className="space-y-4">
                  {/* Verification Status */}
                  {isVerificationStarted ? (
                    <div className="p-3 bg-blue-50 text-blue-700 rounded-lg flex items-center justify-center space-x-2 mb-4">
                      <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
                      <span>Identity verification in progress. Please complete the process in the opened window.</span>
                    </div>
                  ) : verificationSessionId ? (
                    <div className="p-3 bg-green-50 text-green-700 rounded-lg flex items-center justify-center space-x-2 mb-4">
                      <Check className="h-5 w-5 text-green-500" />
                      <span>Verification session submitted! Your identity will be verified shortly.</span>
                    </div>
                  ) : (
                    <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
                      <div className="flex items-center justify-center mb-4">
                        <ExternalLink className="h-12 w-12 text-primary-600" />
                      </div>
                      <h4 className="text-center text-md font-medium mb-2">Veriff Secure Identity Verification</h4>
                      <p className="text-center text-sm text-gray-600 mb-4">
                        You'll be guided through a secure process to verify your identity using your government-issued ID 
                        and a live selfie. This helps ensure the safety and security of all PropertyMatch users.
                      </p>
                      
                      <ul className="text-sm space-y-2 mb-3">
                        <li className="flex items-start">
                          <Check className="h-4 w-4 text-green-500 mr-2 mt-0.5" />
                          <span>Have your government-issued ID (driver's license, passport, etc.) ready</span>
                        </li>
                        <li className="flex items-start">
                          <Check className="h-4 w-4 text-green-500 mr-2 mt-0.5" />
                          <span>Ensure you're in a well-lit area</span>
                        </li>
                        <li className="flex items-start">
                          <Check className="h-4 w-4 text-green-500 mr-2 mt-0.5" />
                          <span>Your webcam will be used for a quick live selfie</span>
                        </li>
                      </ul>
                    </div>
                  )}
                </div>
                
                {/* Personal Details */}
                <div className="space-y-4">
                  <h4 className="text-md font-medium text-gray-700">Confirm Personal Details</h4>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="firstName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>First name</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="lastName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Last name</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="dateOfBirth"
                      render={({ field }) => (
                        <FormItem className="sm:col-span-2">
                          <FormLabel>Date of birth</FormLabel>
                          <FormControl>
                            <Input type="date" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="addressLine1"
                      render={({ field }) => (
                        <FormItem className="sm:col-span-2">
                          <FormLabel>Address line 1</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="addressLine2"
                      render={({ field }) => (
                        <FormItem className="sm:col-span-2">
                          <FormLabel>Address line 2 (optional)</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
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
                        <FormItem className="sm:col-span-2">
                          <FormLabel>ZIP code</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
                
                <div className="flex space-x-3">
                  <Button type="submit" className="flex-1" disabled={isSubmitting || isVerificationStarted}>
                    {isSubmitting ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : null}
                    {isVerificationStarted ? "Verification in Progress..." : "Verify Identity"}
                  </Button>
                  <Button 
                    type="button" 
                    variant="outline" 
                    className="flex-1"
                    onClick={() => navigate("/buyer/dashboard")}
                  >
                    Skip for Now
                  </Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
