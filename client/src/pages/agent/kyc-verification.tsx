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
import { Textarea } from "@/components/ui/textarea";
import { uploadIDDocuments, extractDataFromID, KYCExtractedData } from "@/lib/openai";
import { apiRequest } from "@/lib/queryClient";
import { Loader2, Upload, FileCheck } from "lucide-react";
import { kycUpdateSchema } from "@shared/schema";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";

// Array of US states for agent location selection
const US_STATES = [
  "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado", "Connecticut", 
  "Delaware", "Florida", "Georgia", "Hawaii", "Idaho", "Illinois", "Indiana", "Iowa", 
  "Kansas", "Kentucky", "Louisiana", "Maine", "Maryland", "Massachusetts", "Michigan", 
  "Minnesota", "Mississippi", "Missouri", "Montana", "Nebraska", "Nevada", "New Hampshire", 
  "New Jersey", "New Mexico", "New York", "North Carolina", "North Dakota", "Ohio", "Oklahoma", 
  "Oregon", "Pennsylvania", "Rhode Island", "South Carolina", "South Dakota", "Tennessee", 
  "Texas", "Utah", "Vermont", "Virginia", "Washington", "West Virginia", "Wisconsin", "Wyoming",
  "District of Columbia"
];

// Extend the base KYC schema for agents to include expertise
const agentKycSchema = kycUpdateSchema.extend({
  expertise: z.string().min(1, "Please describe your expertise"),
  licenseNumber: z.string().min(1, "License number is required"),
  state: z.string().min(1, "State is required to match you with local properties"),
});

type AgentKYCFormValues = z.infer<typeof agentKycSchema>;

export default function AgentKYC() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isProcessingID, setIsProcessingID] = useState(false);
  const [idFront, setIdFront] = useState<File | null>(null);
  const [idBack, setIdBack] = useState<File | null>(null);
  const [dataExtracted, setDataExtracted] = useState(false);

  const form = useForm<AgentKYCFormValues>({
    resolver: zodResolver(agentKycSchema),
    defaultValues: {
      firstName: user?.firstName || "",
      lastName: user?.lastName || "",
      dateOfBirth: "",
      addressLine1: user?.addressLine1 || "",
      addressLine2: user?.addressLine2 || "",
      city: user?.city || "",
      state: user?.state || "",
      zip: user?.zip || "",
      expertise: "",
      licenseNumber: "",
    },
  });
  
  // Extract and fill data from ID when both front and back are uploaded
  useEffect(() => {
    const extractDataAndFillForm = async () => {
      if (idFront && idBack) {
        try {
          setIsProcessingID(true);
          
          // Show extraction toast
          toast({
            title: "Processing ID",
            description: "We're extracting information from your ID...",
          });
          
          // Extract data from ID
          const extractedData = await extractDataFromID(idFront, idBack);
          
          // Update form values with extracted data
          if (extractedData) {
            const updates: Partial<AgentKYCFormValues> = {};
            
            if (extractedData.firstName) updates.firstName = extractedData.firstName;
            if (extractedData.lastName) updates.lastName = extractedData.lastName;
            if (extractedData.dateOfBirth) updates.dateOfBirth = extractedData.dateOfBirth;
            if (extractedData.addressLine1) updates.addressLine1 = extractedData.addressLine1;
            if (extractedData.addressLine2) updates.addressLine2 = extractedData.addressLine2;
            if (extractedData.city) updates.city = extractedData.city;
            if (extractedData.state) updates.state = extractedData.state;
            if (extractedData.zip) updates.zip = extractedData.zip;
            
            form.reset({ ...form.getValues(), ...updates });
            setDataExtracted(true);
            
            toast({
              title: "ID Processed",
              description: "Information from your ID has been automatically filled in. Please verify and correct if needed.",
            });
          }
        } catch (error) {
          console.error("Error extracting ID data:", error);
          toast({
            title: "Processing error",
            description: "Could not automatically extract data from your ID. Please fill in the information manually.",
            variant: "destructive",
          });
        } finally {
          setIsProcessingID(false);
        }
      }
    };
    
    if (idFront && idBack && !dataExtracted) {
      extractDataAndFillForm();
    }
  }, [idFront, idBack, dataExtracted, form, toast]);

  const handleIdFrontUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setIdFront(e.target.files[0]);
      setDataExtracted(false); // Reset extraction flag when new ID is uploaded
    }
  };

  const handleIdBackUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setIdBack(e.target.files[0]);
      setDataExtracted(false); // Reset extraction flag when new ID is uploaded
    }
  };

  const onSubmit = async (values: AgentKYCFormValues) => {
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
      
      const responseData = await response.json();

      toast({
        title: "KYC Submitted",
        description: "Your agent verification has been submitted and is being processed.",
      });

      // Check if there's a redirect URL in the response
      if (responseData.redirectUrl) {
        // If we need to redirect to the referral agreement page
        navigate(responseData.redirectUrl);
      } else {
        // Default redirect to dashboard
        navigate("/agent/dashboard");
      }
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
          Agent Verification
        </h2>
        <p className="mt-2 text-center text-sm text-gray-600">
          We need to verify your identity and credentials before you can start working with buyers
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
                  {/* Processing indicator */}
                  {isProcessingID && (
                    <div className="p-3 bg-blue-50 text-blue-700 rounded-lg flex items-center justify-center space-x-2 mb-4">
                      <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
                      <span>Processing your ID documents...</span>
                    </div>
                  )}
                  
                  {/* Successfully extracted data indicator */}
                  {dataExtracted && (
                    <div className="p-3 bg-green-50 text-green-700 rounded-lg flex items-center justify-center space-x-2 mb-4">
                      <FileCheck className="h-5 w-5 text-green-500" />
                      <span>ID data successfully extracted! Please verify the information below.</span>
                    </div>
                  )}
                  
                  {/* ID Front Upload */}
                  <div 
                    className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer ${
                      idFront 
                        ? dataExtracted 
                          ? "border-green-300 bg-green-50" 
                          : "border-blue-300 bg-blue-50" 
                        : "border-gray-300"
                    }`}
                    onClick={() => !isProcessingID && document.getElementById("id-front")?.click()}
                  >
                    <div className="space-y-2">
                      {idFront && isProcessingID ? (
                        <Loader2 className="mx-auto h-8 w-8 animate-spin text-blue-500" />
                      ) : idFront && dataExtracted ? (
                        <FileCheck className="mx-auto h-8 w-8 text-green-500" />
                      ) : (
                        <Upload className="mx-auto h-8 w-8 text-gray-400" />
                      )}
                      <div className="text-sm text-gray-600">
                        <label htmlFor="id-front" className={`cursor-pointer font-medium ${isProcessingID ? 'text-blue-600' : 'text-primary-600 hover:text-primary-500'}`}>
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
                        disabled={isProcessingID}
                      />
                    </div>
                  </div>
                  
                  {/* ID Back Upload */}
                  <div 
                    className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer ${
                      idBack 
                        ? dataExtracted 
                          ? "border-green-300 bg-green-50" 
                          : "border-blue-300 bg-blue-50" 
                        : "border-gray-300"
                    }`}
                    onClick={() => !isProcessingID && document.getElementById("id-back")?.click()}
                  >
                    <div className="space-y-2">
                      {idBack && isProcessingID ? (
                        <Loader2 className="mx-auto h-8 w-8 animate-spin text-blue-500" />
                      ) : idBack && dataExtracted ? (
                        <FileCheck className="mx-auto h-8 w-8 text-green-500" />
                      ) : (
                        <Upload className="mx-auto h-8 w-8 text-gray-400" />
                      )}
                      <div className="text-sm text-gray-600">
                        <label htmlFor="id-back" className={`cursor-pointer font-medium ${isProcessingID ? 'text-blue-600' : 'text-primary-600 hover:text-primary-500'}`}>
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
                        disabled={isProcessingID}
                      />
                    </div>
                  </div>
                </div>
                
                {/* Agent Specific Details */}
                <div className="space-y-4">
                  <h4 className="text-md font-medium text-gray-700">Agent Details</h4>
                  <FormField
                    control={form.control}
                    name="licenseNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Real Estate License Number</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="expertise"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Areas of Expertise</FormLabel>
                        <FormControl>
                          <Textarea 
                            placeholder="Describe your experience, specializations, and areas you serve" 
                            className="resize-none" 
                            {...field} 
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                
                {/* Personal Details */}
                <div className="space-y-4">
                  <h4 className="text-md font-medium text-gray-700">Personal Details</h4>
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
                            <Select
                              onValueChange={field.onChange}
                              defaultValue={field.value}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select a state" />
                              </SelectTrigger>
                              <SelectContent>
                                {US_STATES.map((state) => (
                                  <SelectItem key={state} value={state}>
                                    {state}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </FormControl>
                          <FormMessage />
                          <p className="text-xs text-gray-500 mt-1">
                            Your primary state of operation will be used to match you with relevant properties
                          </p>
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
