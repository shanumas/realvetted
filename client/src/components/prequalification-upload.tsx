import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, FileText } from "lucide-react";
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

  // Upload pre-qualification document mutation
  const uploadMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      // Manual fetch to ensure FormData is sent correctly
      const response = await fetch("/api/buyer/prequalification", {
        method: "POST",
        body: formData,
        credentials: "include"
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || `Upload failed with status: ${response.status}`);
      }
      
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
      console.error("Upload error:", error);
      toast({
        title: "Upload failed",
        description: error instanceof Error ? error.message : "There was an error uploading your document.",
        variant: "destructive",
      });
    },
  });

  // Handle form submission
  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    if (!selectedFile) {
      toast({
        title: "No file selected",
        description: "Please select a pre-qualification document to upload.",
        variant: "destructive",
      });
      return;
    }

    // Create FormData and append the file with the correct field name expected by multer
    const formData = new FormData();
    formData.append("file", selectedFile, selectedFile.name);
    formData.append("verificationMethod", "prequalification");
    
    console.log("Uploading file:", selectedFile.name, "Size:", selectedFile.size, "Type:", selectedFile.type);
    
    uploadMutation.mutate(formData);
  };

  const isLoading = uploadMutation.isPending;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Upload Pre-qualification Document</DialogTitle>
          <DialogDescription>
            Upload a pre-qualification document from any lender to verify your buying status.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
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