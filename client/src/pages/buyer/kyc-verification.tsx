import { useState, useEffect } from "react";
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
import { createVeriffSession, launchVeriff, checkVeriffStatus } from "@/lib/veriff";
import { apiRequest } from "@/lib/queryClient";
import { Loader2, Check, ExternalLink, CheckCircle } from "lucide-react";
import { kycUpdateSchema } from "@shared/schema";
import { forceVerification } from "@/lib/verification";

type KYCFormValues = z.infer<typeof kycUpdateSchema>;

export default function BuyerKYC() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isVerificationStarted, setIsVerificationStarted] = useState(false);
  const [verificationSessionId, setVerificationSessionId] = useState<string | null>(null);
  
  // Check for URL parameters to see if we're in "retry" mode
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const retry = urlParams.get('retry');
    
    // Only redirect if not in retry mode AND user is verified/pending
    if (!retry && user && (user.profileStatus === 'verified')) {
      toast({
        title: "Verification status",
        description: "Your identity is already verified",
      });
      
      navigate("/buyer/dashboard");
    }
  }, [user, navigate, toast]);

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

  // Set up polling for verification status
  useEffect(() => {
    let pollingInterval: NodeJS.Timeout | null = null;
    
    if (verificationSessionId && isVerificationStarted) {
      // Poll every 5 seconds to check verification status
      pollingInterval = setInterval(async () => {
        try {
          const status = await checkVeriffStatus(verificationSessionId);
          console.log("Verification status:", status);
          
          // If verification is approved or declined, stop polling and update UI
          if (status === 'approved' || status === 'declined' || status === 'expired' || status === 'abandoned') {
            if (pollingInterval) {
              clearInterval(pollingInterval);
            }
            
            if (status === 'approved') {
              toast({
                title: "Verification Approved",
                description: "Your identity has been successfully verified.",
              });
              
              // Redirect to dashboard
              navigate("/buyer/dashboard");
            } else if (status === 'declined') {
              toast({
                title: "Verification Declined",
                description: "Your identity verification was declined. Please try again with accurate information.",
                variant: "destructive",
              });
              setIsVerificationStarted(false);
            } else {
              toast({
                title: "Verification Expired",
                description: "Your verification session has expired. Please try again.",
                variant: "destructive",
              });
              setIsVerificationStarted(false);
            }
          }
        } catch (error) {
          console.error("Error checking verification status:", error);
        }
      }, 5000); // Check every 5 seconds
    }
    
    // Clean up interval on component unmount
    return () => {
      if (pollingInterval) {
        clearInterval(pollingInterval);
      }
    };
  }, [verificationSessionId, isVerificationStarted, navigate, toast]);

  // Start Veriff verification flow
  const startVerification = async () => {
    try {
      setIsSubmitting(true);
      
      // Create a Veriff verification session
      const sessionData = await createVeriffSession();
      setVerificationSessionId(sessionData.sessionId);
      
      // Launch Veriff verification
      launchVeriff(sessionData.url, handleVerificationComplete);
      
      // Update UI
      setIsVerificationStarted(true);
      
      toast({
        title: "Verification Started",
        description: "Please complete the identity verification process in the new window.",
      });
      
      // Submit the basic info right away so we have it in our system
      await submitBasicInfo();
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
        description: "Your identity verification has been submitted. Processing verification...",
      });
      
      // Check the verification status regularly until it changes from pending
      if (verificationSessionId) {
        let verificationComplete = false;
        let attemptCount = 0;
        const maxAttempts = 5;
        
        // Show a loading toast that we're checking status
        toast({
          title: "Checking verification status",
          description: "Please wait while we check your verification status...",
        });
        
        try {
          while (!verificationComplete && attemptCount < maxAttempts) {
            // Wait before checking (start with 2 seconds, increase each time)
            await new Promise(resolve => setTimeout(resolve, 2000 + attemptCount * 1000));
            
            // Force an update of the user's verification status
            const forceResponse = await apiRequest("POST", "/api/users/force-verification");
            if (!forceResponse.ok) {
              console.warn("Failed to force verification update:", await forceResponse.text());
            }
            
            // Fetch the current user to get the latest profile status
            const userResponse = await apiRequest("GET", "/api/auth/user");
            if (userResponse.ok) {
              const userData = await userResponse.json();
              
              // If status has changed from pending, we're done
              if (userData.profileStatus === 'verified') {
                verificationComplete = true;
                toast({
                  title: "Verification Successful",
                  description: "Your identity has been verified successfully!",
                });
                
                // Redirect to dashboard
                navigate("/buyer/dashboard");
              } else if (userData.profileStatus === 'rejected') {
                verificationComplete = true;
                toast({
                  title: "Verification Failed",
                  description: "Your identity verification was rejected. Please try again.",
                  variant: "destructive",
                });
              }
            }
            
            attemptCount++;
          }
          
          // If we've tried the maximum number of times and still no change, just redirect
          if (!verificationComplete) {
            toast({
              title: "Verification In Progress",
              description: "Your verification is still processing. You'll be notified when it completes.",
            });
            
            // Redirect to dashboard
            navigate("/buyer/dashboard");
          }
        } catch (error) {
          console.error("Error checking verification status:", error);
          toast({
            title: "Status Check Failed",
            description: "We couldn't determine if your verification completed. Please check your dashboard for updates.",
            variant: "destructive",
          });
          
          // Redirect to dashboard anyway
          navigate("/buyer/dashboard");
        } finally {
          // We don't need to dismiss toast manually - they auto-dismiss
        }
      }
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
                
                <div className="flex flex-col space-y-3">
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
                  

                </div>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
