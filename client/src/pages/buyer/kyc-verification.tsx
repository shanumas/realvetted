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
import { uploadIDDocuments } from "@/lib/openai";
import { apiRequest } from "@/lib/queryClient";
import { Loader2, Upload } from "lucide-react";
import { kycUpdateSchema } from "@shared/schema";

type KYCFormValues = z.infer<typeof kycUpdateSchema>;

export default function BuyerKYC() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [idFront, setIdFront] = useState<File | null>(null);
  const [idBack, setIdBack] = useState<File | null>(null);

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

  const handleIdFrontUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setIdFront(e.target.files[0]);
    }
  };

  const handleIdBackUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setIdBack(e.target.files[0]);
    }
  };

  const onSubmit = async (values: KYCFormValues) => {
    try {
      setIsSubmitting(true);

      if (!idFront || !idBack) {
        toast({
          title: "Missing documents",
          description: "Please upload both front and back of your ID",
          variant: "destructive",
        });
        setIsSubmitting(false);
        return;
      }

      // Upload ID documents
      const uploadResult = await uploadIDDocuments(idFront, idBack);
      
      // Update user profile with KYC info
      const response = await apiRequest("PUT", "/api/users/kyc", {
        ...values,
        idFrontUrl: uploadResult.idFrontUrl,
        idBackUrl: uploadResult.idBackUrl,
      });

      if (!response.ok) {
        throw new Error("Failed to submit KYC information");
      }

      toast({
        title: "KYC Submitted",
        description: "Your identity verification has been submitted and is being processed.",
      });

      // Redirect to dashboard
      navigate("/buyer/dashboard");
    } catch (error) {
      console.error("KYC submission error:", error);
      toast({
        title: "Submission failed",
        description: error instanceof Error ? error.message : "An unexpected error occurred",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
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
                  <h3 className="text-lg font-medium text-gray-900">Upload ID Documents</h3>
                  <p className="text-sm text-gray-500 mt-1">Please upload clear images of your identification documents.</p>
                </div>
                
                <div className="space-y-4">
                  {/* ID Front Upload */}
                  <div 
                    className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer ${
                      idFront ? "border-green-300 bg-green-50" : "border-gray-300"
                    }`}
                    onClick={() => document.getElementById("id-front")?.click()}
                  >
                    <div className="space-y-2">
                      <Upload className="mx-auto h-8 w-8 text-gray-400" />
                      <div className="text-sm text-gray-600">
                        <label htmlFor="id-front" className="cursor-pointer font-medium text-primary-600 hover:text-primary-500">
                          {idFront ? idFront.name : "Upload front of ID"}
                        </label>
                        <p className="text-xs mt-1">JPG, PNG or PDF up to 5MB</p>
                      </div>
                      <input 
                        id="id-front" 
                        type="file" 
                        className="hidden" 
                        accept="image/*, application/pdf" 
                        onChange={handleIdFrontUpload}
                      />
                    </div>
                  </div>
                  
                  {/* ID Back Upload */}
                  <div 
                    className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer ${
                      idBack ? "border-green-300 bg-green-50" : "border-gray-300"
                    }`}
                    onClick={() => document.getElementById("id-back")?.click()}
                  >
                    <div className="space-y-2">
                      <Upload className="mx-auto h-8 w-8 text-gray-400" />
                      <div className="text-sm text-gray-600">
                        <label htmlFor="id-back" className="cursor-pointer font-medium text-primary-600 hover:text-primary-500">
                          {idBack ? idBack.name : "Upload back of ID"}
                        </label>
                        <p className="text-xs mt-1">JPG, PNG or PDF up to 5MB</p>
                      </div>
                      <input 
                        id="id-back" 
                        type="file" 
                        className="hidden" 
                        accept="image/*, application/pdf"
                        onChange={handleIdBackUpload}
                      />
                    </div>
                  </div>
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
                
                <Button type="submit" className="w-full" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : null}
                  Submit for Verification
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
