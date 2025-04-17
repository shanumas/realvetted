import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, FileText, MailCheck, XCircle, Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

interface ManualApprovalFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmitted: () => void;
}

export function ManualApprovalForm({ isOpen, onClose, onSubmitted }: ManualApprovalFormProps) {
  const { toast } = useToast();
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [formData, setFormData] = useState({
    desiredLoanAmount: "",
    monthlyIncome: "",
    employmentStatus: "",
    creditScore: "",
    downPaymentAmount: "",
    additionalNotes: ""
  });
  
  // Handle form field changes
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  // Handle file selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      // Convert FileList to array and concatenate with existing files
      const newFiles = Array.from(e.target.files);
      
      // Enforce max 5 documents
      if (selectedFiles.length + newFiles.length > 5) {
        toast({
          title: "Maximum files reached",
          description: "You can upload a maximum of 5 supporting documents.",
          variant: "destructive",
        });
        return;
      }
      
      setSelectedFiles(prev => [...prev, ...newFiles]);
      // Clear the input value so the same file can be selected again if needed
      e.target.value = '';
    }
  };

  // Remove a file
  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  // State for tracking the submission status
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    if (Object.values(formData).some(val => val === "") && selectedFiles.length === 0) {
      toast({
        title: "Incomplete form",
        description: "Please fill in some information or upload supporting documents.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    
    // Create FormData with all form fields and files
    const submitFormData = new FormData();
    
    // Add form fields
    Object.entries(formData).forEach(([key, value]) => {
      submitFormData.append(key, value);
    });
    
    // Add files with numbered keys
    selectedFiles.forEach((file, index) => {
      submitFormData.append(`supportingDoc${index + 1}`, file);
    });
    
    // Use XMLHttpRequest for better FormData handling
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/buyer/prequalification-approval");
    
    // Add event listeners
    xhr.onload = function() {
      setIsSubmitting(false);
      if (xhr.status >= 200 && xhr.status < 300) {
        const response = JSON.parse(xhr.responseText);
        if (response.success) {
          toast({
            title: "Approval request sent",
            description: "Your request has been submitted and will be reviewed.",
          });
          // Also update the user to indicate they've requested manual approval
          apiRequest('/api/buyer/set-manual-approval-requested', 
            'POST', 
            { manualApprovalRequested: true }
          ).then(() => {
            // Invalidate user data so the verification status is updated
            queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
            onSubmitted();
            onClose();
          });
        } else {
          toast({
            title: "Request failed",
            description: response.error || "There was an error submitting your request.",
            variant: "destructive",
          });
        }
      } else {
        console.error("Request failed:", xhr.status, xhr.statusText, xhr.responseText);
        toast({
          title: "Request failed",
          description: xhr.responseText || `Error ${xhr.status}: ${xhr.statusText}`,
          variant: "destructive",
        });
      }
    };
    
    xhr.onerror = function() {
      setIsSubmitting(false);
      console.error("Network error during request");
      toast({
        title: "Request failed",
        description: "Network error occurred. Please try again.",
        variant: "destructive",
      });
    };
    
    // Send the FormData
    xhr.send(submitFormData);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Request Pre-qualification Approval</DialogTitle>
          <DialogDescription>
            Provide information about your financial situation to help the lender approve your pre-qualification status.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} encType="multipart/form-data">
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="desiredLoanAmount">Desired Loan Amount</Label>
                <Input
                  id="desiredLoanAmount"
                  name="desiredLoanAmount"
                  placeholder="e.g. $450,000"
                  value={formData.desiredLoanAmount}
                  onChange={handleInputChange}
                />
              </div>
              
              <div>
                <Label htmlFor="monthlyIncome">Monthly Income</Label>
                <Input
                  id="monthlyIncome"
                  name="monthlyIncome"
                  placeholder="e.g. $8,500"
                  value={formData.monthlyIncome}
                  onChange={handleInputChange}
                />
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="employmentStatus">Employment Status</Label>
                <Input
                  id="employmentStatus"
                  name="employmentStatus"
                  placeholder="e.g. Full-time, Self-employed"
                  value={formData.employmentStatus}
                  onChange={handleInputChange}
                />
              </div>
              
              <div>
                <Label htmlFor="creditScore">Credit Score Range</Label>
                <Input
                  id="creditScore"
                  name="creditScore"
                  placeholder="e.g. 700-750"
                  value={formData.creditScore}
                  onChange={handleInputChange}
                />
              </div>
            </div>
            
            <div>
              <Label htmlFor="downPaymentAmount">Down Payment Amount</Label>
              <Input
                id="downPaymentAmount"
                name="downPaymentAmount"
                placeholder="e.g. $90,000"
                value={formData.downPaymentAmount}
                onChange={handleInputChange}
              />
            </div>
            
            <div>
              <Label htmlFor="additionalNotes">Additional Notes</Label>
              <Textarea
                id="additionalNotes"
                name="additionalNotes"
                placeholder="Any additional information you'd like the lender to know..."
                rows={3}
                value={formData.additionalNotes}
                onChange={handleInputChange}
              />
            </div>
            
            <div className="mt-6">
              <Label className="block mb-2">Upload Supporting Documents (Max 5)</Label>
              <div className="flex items-center justify-between">
                <div className="text-sm text-gray-500 mb-2">
                  {selectedFiles.length}/5 documents selected
                </div>
                <Button 
                  type="button" 
                  variant="outline" 
                  size="sm"
                  className="mb-2"
                  onClick={() => document.getElementById('supporting-docs')?.click()}
                  disabled={selectedFiles.length >= 5 || isSubmitting}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add Document
                </Button>
              </div>
              
              <input
                id="supporting-docs"
                name="supportingDocs"
                type="file"
                className="hidden"
                accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                onChange={handleFileChange}
                multiple
                disabled={selectedFiles.length >= 5 || isSubmitting}
              />
              
              <div className="border rounded-md p-1 bg-gray-50">
                {selectedFiles.length > 0 ? (
                  <div className="space-y-2">
                    {selectedFiles.map((file, index) => (
                      <div key={index} className="bg-white p-2 rounded-md border flex items-center justify-between">
                        <div className="flex items-center overflow-hidden">
                          <FileText className="h-4 w-4 text-blue-500 mr-2 flex-shrink-0" />
                          <div className="overflow-hidden">
                            <p className="text-sm font-medium truncate">
                              {file.name}
                            </p>
                            <p className="text-xs text-gray-500">
                              {Math.round(file.size / 1024)} KB
                            </p>
                          </div>
                        </div>
                        <Button 
                          type="button" 
                          variant="ghost" 
                          size="sm"
                          className="h-8 w-8 p-0" 
                          onClick={() => removeFile(index)}
                          disabled={isSubmitting}
                        >
                          <XCircle className="h-4 w-4 text-gray-500" />
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center p-4 text-gray-500 text-sm">
                    No supporting documents selected
                  </div>
                )}
              </div>
              
              <div className="text-xs text-gray-500 mt-2">
                Upload documents like pay stubs, bank statements, or employment verification letters
                to support your pre-qualification request.
              </div>
            </div>
          </div>

          <DialogFooter className="mt-4">
            <Button 
              variant="outline" 
              type="button" 
              onClick={onClose} 
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Submitting...
                </>
              ) : (
                <>
                  <MailCheck className="mr-2 h-4 w-4" />
                  Submit Request
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}