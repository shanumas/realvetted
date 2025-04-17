import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, FileText, UserCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface PrequalificationUploadProps {
  isOpen: boolean;
  onClose: () => void;
  onVerified: () => void;
}

export function PrequalificationUpload({ isOpen, onClose, onVerified }: PrequalificationUploadProps) {
  const { toast } = useToast();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [activeTab, setActiveTab] = useState<"upload" | "verification">("upload");

  // Handle file selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setSelectedFile(e.target.files[0]);
    }
  };

  // Upload pre-qualification document mutation
  const uploadMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const response = await apiRequest("POST", "/api/buyer/prequalification", undefined, {
        body: formData,
        customHeaders: {
          // No Content-Type header needed, browser sets it with boundary
        },
      });
      return response.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({
          title: "Document uploaded",
          description: "Your pre-qualification document has been uploaded and will be verified.",
        });
        // Invalidate user data so the verification status is updated
        queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
        onVerified();
        onClose();
      } else {
        toast({
          title: "Upload failed",
          description: data.error || "There was an error uploading your document.",
          variant: "destructive",
        });
      }
    },
    onError: (error) => {
      toast({
        title: "Upload failed",
        description: error instanceof Error ? error.message : "There was an error uploading your document.",
        variant: "destructive",
      });
    },
  });

  // Start KYC verification mutation
  const startVerificationMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/buyer/verify-identity", {
        verificationMethod: "kyc",
      });
      return response.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        if (data.redirectUrl) {
          // Redirect to the Veriff verification URL
          window.location.href = data.redirectUrl;
        } else {
          toast({
            title: "Verification initiated",
            description: "Your identity verification has been initiated.",
          });
          onVerified();
          onClose();
        }
      } else {
        toast({
          title: "Verification failed",
          description: data.error || "There was an error starting the verification process.",
          variant: "destructive",
        });
      }
    },
    onError: (error) => {
      toast({
        title: "Verification failed",
        description: error instanceof Error ? error.message : "There was an error starting the verification process.",
        variant: "destructive",
      });
    },
  });

  // Handle form submission
  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    if (activeTab === "upload") {
      if (!selectedFile) {
        toast({
          title: "No file selected",
          description: "Please select a pre-qualification document to upload.",
          variant: "destructive",
        });
        return;
      }

      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("verificationMethod", "prequalification");
      
      uploadMutation.mutate(formData);
    } else {
      startVerificationMutation.mutate();
    }
  };

  const isLoading = uploadMutation.isPending || startVerificationMutation.isPending;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Buyer Verification Required</DialogTitle>
          <DialogDescription>
            Before you can request property tours, you need to verify your identity or upload a pre-qualification document from any lender.
          </DialogDescription>
        </DialogHeader>

        <div className="mb-4 bg-yellow-50 p-3 rounded-md border border-yellow-100">
          <p className="text-sm text-yellow-800 font-medium">
            You have two options to proceed with your verification:
          </p>
          <ul className="text-sm text-yellow-700 mt-1 ml-4 list-disc">
            <li>Upload a pre-qualification document from any lender (fastest option)</li>
            <li>Verify your identity through our secure verification partner</li>
          </ul>
          <p className="text-xs text-yellow-600 mt-2">
            Choose the option that works best for you. Only one is required.
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as "upload" | "verification")}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="upload" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              <span>Upload Document</span>
            </TabsTrigger>
            <TabsTrigger value="verification" className="flex items-center gap-2">
              <UserCheck className="h-4 w-4" />
              <span>Verify Identity</span>
            </TabsTrigger>
          </TabsList>

          <form onSubmit={handleSubmit}>
            <TabsContent value="upload" className="space-y-4 py-4">
              <div className="space-y-4">
                <div className="border bg-gray-50 p-4 rounded-lg border-dashed border-gray-300 hover:border-blue-400 hover:bg-blue-50 transition-colors cursor-pointer relative">
                  <input
                    id="document"
                    type="file"
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    accept=".pdf,.jpg,.jpeg,.png"
                    onChange={handleFileChange}
                    disabled={isLoading}
                  />
                  <div className="text-center">
                    <FileText className="h-8 w-8 text-blue-500 mx-auto mb-2" />
                    <p className="text-sm font-medium text-gray-700">
                      {selectedFile ? 'Change document' : 'Upload pre-qualification document'}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      Drag and drop or click to select a file (PDF, JPG, PNG)
                    </p>
                  </div>
                </div>

                {selectedFile && (
                  <div className="bg-green-50 p-3 rounded-md border border-green-100 flex items-center">
                    <FileText className="h-5 w-5 text-green-500 mr-2 flex-shrink-0" />
                    <div className="overflow-hidden">
                      <p className="text-sm font-medium text-green-700 truncate">
                        {selectedFile.name}
                      </p>
                      <p className="text-xs text-green-600">
                        {Math.round(selectedFile.size / 1024)} KB • Selected for upload
                      </p>
                    </div>
                  </div>
                )}

                <div className="bg-gray-50 p-3 rounded-md border border-gray-100">
                  <h4 className="text-sm font-medium text-gray-700">What types of documents work?</h4>
                  <ul className="mt-1 space-y-1 text-xs text-gray-600 ml-4 list-disc">
                    <li>Pre-qualification letter from any lender or bank</li>
                    <li>Pre-approval letter for a mortgage</li>
                    <li>Proof of funds letter from a financial institution</li>
                    <li>Bank statement showing sufficient funds (with sensitive information redacted)</li>
                  </ul>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="verification" className="space-y-4 py-4">
              <div className="bg-blue-50 p-4 rounded-md">
                <h3 className="font-medium flex items-center text-blue-800">
                  <UserCheck className="h-5 w-5 mr-2 text-blue-500" />
                  Identity Verification
                </h3>
                <p className="mt-2 text-sm text-blue-600">
                  We'll use Veriff to verify your identity. This process takes about 5 minutes and requires:
                </p>
                <ul className="mt-2 text-sm text-blue-600 list-disc pl-5 space-y-1">
                  <li>A valid government-issued photo ID</li>
                  <li>Access to your device's camera</li>
                  <li>A well-lit environment</li>
                </ul>
              </div>
            </TabsContent>

            <DialogFooter className="mt-6">
              <Button variant="outline" type="button" onClick={onClose} disabled={isLoading}>
                Cancel
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {activeTab === "upload" ? "Uploading..." : "Starting verification..."}
                  </>
                ) : (
                  <>
                    {activeTab === "upload" ? "Upload Document" : "Start Verification"}
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}