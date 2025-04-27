import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Loader2,
  FileText,
  MailCheck,
  AlertTriangle,
  ExternalLink,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface PrequalificationUploadProps {
  isOpen: boolean;
  onClose: () => void;
  onVerified: () => void;
  user?: {
    prequalificationAttempts?: number;
    failedPrequalificationUrls?: string[];
    prequalificationMessage?: string;
  };
}

export function PrequalificationUpload({
  isOpen,
  onClose,
  onVerified,
  user,
}: PrequalificationUploadProps) {
  const { toast } = useToast();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // Get user info from API if not provided as prop
  const { data: userData } = useQuery({
    queryKey: ["/api/auth/user"],
    enabled: !user && isOpen, // Only fetch if user isn't provided as prop and dialog is open
  });

  // Use provided user data or fetched data
  const currentUser = user || userData;

  // Calculate attempts info
  const attempts = currentUser?.prequalificationAttempts || 0;
  const remainingAttempts = Math.max(0, 3 - attempts);
  const hasFailedDocuments =
    currentUser?.failedPrequalificationUrls &&
    currentUser.failedPrequalificationUrls.length > 0;

  // Handle file selection with size validation
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      // Check file size (1MB = 1048576 bytes)
      if (file.size > 1048576) {
        toast({
          title: "File too large",
          description: "Please select a file smaller than 1MB.",
          variant: "destructive",
        });
        // Reset the input field
        e.target.value = "";
        return;
      }
      setSelectedFile(file);
    }
  };

  // State for tracking the upload and approval request status
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRequestingApproval, setIsRequestingApproval] = useState(false);
  const [hasUploaded, setHasUploaded] = useState(false);

  // Request pre-qualification approval
  const requestApprovalMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("/api/buyer/prequalification-approval", "POST");
    },
    onSuccess: () => {
      toast({
        title: "Approval request sent",
        description: "Your pre-qualification approval request has been sent.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Request failed",
        description:
          error.message || "Failed to send pre-qualification approval request.",
        variant: "destructive",
      });
    },
  });

  const handleRequestApproval = async () => {
    setIsRequestingApproval(true);
    try {
      await requestApprovalMutation.mutateAsync();
    } finally {
      setIsRequestingApproval(false);
    }
  };

  // Handle manual form submission with XMLHttpRequest for better FormData handling
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!selectedFile) {
      toast({
        title: "No file selected",
        description: "Please select a pre-qualification document to upload.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);

    // Create FormData with the file
    const formData = new FormData();
    formData.append("file", selectedFile);
    //formData.append("verificationMethod", "prequalification");

    console.log(
      "Uploading file:",
      selectedFile.name,
      "Size:",
      selectedFile.size,
      "Type:",
      selectedFile.type,
    );

    // Use XMLHttpRequest for better FormData handling
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/buyer/prequalification");

    // Add event listeners
    xhr.onload = function () {
      setIsSubmitting(false);
      if (xhr.status >= 200 && xhr.status < 300) {
        const response = JSON.parse(xhr.responseText);
        if (response.success) {
          toast({
            title: "Document uploaded",
            description:
              "Your pre-qualification document has been uploaded and will be verified.",
          });
          // Invalidate user data so the verification status is updated
          queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
          onVerified();
          onClose();
        } else {
          toast({
            title: "Upload failed",
            description:
              response.error || "There was an error uploading your document.",
            variant: "destructive",
          });
        }
      } else {
        console.error(
          "Upload failed:",
          xhr.status,
          xhr.statusText,
          xhr.responseText,
        );
        toast({
          title: "Upload failed",
          description:
            xhr.responseText || `Error ${xhr.status}: ${xhr.statusText}`,
          variant: "destructive",
        });
      }
    };

    xhr.onerror = function () {
      setIsSubmitting(false);
      console.error("Network error during upload");
      toast({
        title: "Upload failed",
        description: "Network error occurred during upload. Please try again.",
        variant: "destructive",
      });
    };

    // Log upload progress
    xhr.upload.onprogress = function (event) {
      if (event.lengthComputable) {
        const percentComplete = Math.round((event.loaded / event.total) * 100);
        console.log(`Upload progress: ${percentComplete}%`);
      }
    };

    // Send the FormData
    xhr.send(formData);
  };

  const isLoading = isSubmitting || isRequestingApproval;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Upload Pre-qualification Document</DialogTitle>
          <DialogDescription>
            Upload a pre-qualification document from any lender to verify your
            buying status. If automatic approval fails, you can request manual
            approval if needed.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} encType="multipart/form-data">
          <div className="space-y-4 py-4">
            {/* Previous rejection message */}
            {currentUser?.prequalificationMessage &&
              !currentUser?.prequalificationValidated && (
                <Alert variant="warning" className="mt-2">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Previous verification issue</AlertTitle>
                  <AlertDescription>
                    {currentUser.prequalificationMessage}
                  </AlertDescription>
                </Alert>
              )}

            {/* Document upload area - disabled if max attempts reached */}
            <div
              className={`border bg-gray-50 p-4 rounded-lg border-dashed ${remainingAttempts === 0 ? "border-red-200 bg-red-50 cursor-not-allowed" : "border-gray-300 hover:border-blue-400 hover:bg-blue-50 cursor-pointer"} transition-colors relative`}
            >
              <input
                id="document"
                name="file"
                type="file"
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                accept=".pdf,.jpg,.jpeg,.png"
                onChange={handleFileChange}
                disabled={isLoading || remainingAttempts === 0}
              />
              <div className="text-center">
                <FileText
                  className={`h-8 w-8 mx-auto mb-2 ${remainingAttempts === 0 ? "text-red-300" : "text-blue-500"}`}
                />
                <p
                  className={`text-sm font-medium ${remainingAttempts === 0 ? "text-red-500" : "text-gray-700"}`}
                >
                  {remainingAttempts === 0
                    ? "Max attempts reached"
                    : selectedFile
                      ? "Change document"
                      : "Upload pre-qualification document"}
                </p>
                <p
                  className={`text-xs mt-1 ${remainingAttempts === 0 ? "text-red-400" : "text-gray-500"}`}
                >
                  {remainingAttempts === 0
                    ? "Contact support for assistance"
                    : "Drag and drop or click to select a file (PDF, JPG, PNG)"}
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  Maximum file size: 1MB
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
                    {Math.round(selectedFile.size / 1024)} KB • Selected for
                    upload
                  </p>
                </div>
              </div>
            )}

            <div className="bg-gray-50 p-3 rounded-md border border-gray-100">
              <h4 className="text-sm font-medium text-gray-700">
                What types of documents work?
              </h4>
              <ul className="mt-1 space-y-1 text-xs text-gray-600 ml-4 list-disc">
                <li>Pre-qualification letter from any lender or bank</li>
                <li>Pre-approval letter for a mortgage</li>
                <li>Proof of funds letter from a financial institution</li>
                <li>
                  Bank statement showing sufficient funds (with sensitive
                  information redacted)
                </li>
              </ul>
            </div>
          </div>

          <DialogFooter className="mt-2">
            <Button
              variant="outline"
              type="button"
              onClick={onClose}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>Upload Document</>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
