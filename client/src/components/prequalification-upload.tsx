import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, FileText, MailCheck } from "lucide-react";
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

  // Handle file selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setSelectedFile(e.target.files[0]);
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
        description: error.message || "Failed to send pre-qualification approval request.",
        variant: "destructive",
      });
    }
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
    formData.append("verificationMethod", "prequalification");
    
    console.log("Uploading file:", selectedFile.name, "Size:", selectedFile.size, "Type:", selectedFile.type);
    
    // Use XMLHttpRequest for better FormData handling
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/buyer/prequalification");
    
    // Add event listeners
    xhr.onload = function() {
      setIsSubmitting(false);
      if (xhr.status >= 200 && xhr.status < 300) {
        const response = JSON.parse(xhr.responseText);
        if (response.success) {
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
            description: response.error || "There was an error uploading your document.",
            variant: "destructive",
          });
        }
      } else {
        console.error("Upload failed:", xhr.status, xhr.statusText, xhr.responseText);
        toast({
          title: "Upload failed",
          description: xhr.responseText || `Error ${xhr.status}: ${xhr.statusText}`,
          variant: "destructive",
        });
      }
    };
    
    xhr.onerror = function() {
      setIsSubmitting(false);
      console.error("Network error during upload");
      toast({
        title: "Upload failed",
        description: "Network error occurred during upload. Please try again.",
        variant: "destructive",
      });
    };
    
    // Log upload progress
    xhr.upload.onprogress = function(event) {
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
            Upload a pre-qualification document from any lender to verify your buying status.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} encType="multipart/form-data">
          <div className="space-y-4 py-4">
            <div className="border bg-gray-50 p-4 rounded-lg border-dashed border-gray-300 hover:border-blue-400 hover:bg-blue-50 transition-colors cursor-pointer relative">
              <input
                id="document"
                name="file"
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
            
            <div className="bg-blue-50 p-3 rounded-md border border-blue-100">
              <h4 className="text-sm font-medium text-blue-700 flex items-center">
                <MailCheck className="h-4 w-4 mr-2 text-blue-500" />
                Get Pre-Qualification Approval
              </h4>
              <p className="mt-1 text-xs text-blue-600 mb-2">
                After uploading your document, you can request a manual review and approval of your pre-qualification document.
              </p>
              <Button 
                type="button" 
                variant="outline" 
                size="sm"
                className="bg-white/70 border-blue-200 text-blue-700 hover:bg-blue-100 hover:text-blue-800"
                onClick={handleRequestApproval}
                disabled={isRequestingApproval}
              >
                {isRequestingApproval ? (
                  <>
                    <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                    Sending Request...
                  </>
                ) : (
                  <>
                    Request Approval
                  </>
                )}
              </Button>
            </div>

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

          <DialogFooter className="mt-2">
            <Button variant="outline" type="button" onClick={onClose} disabled={isLoading}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  Upload Document
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}