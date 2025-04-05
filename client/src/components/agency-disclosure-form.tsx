import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { Property, User } from "@shared/schema";
import { useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Loader2, FileText, Check, RefreshCw } from "lucide-react";
import SignatureCanvas from 'react-signature-canvas';

interface AgencyDisclosureFormProps {
  property?: Property;
  agent?: User;
  isOpen: boolean;
  onClose: () => void;
  viewingRequestId?: number;
}

export function AgencyDisclosureForm({ 
  property, 
  agent, 
  isOpen, 
  onClose,
  viewingRequestId
}: AgencyDisclosureFormProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [signature, setSignature] = useState<string>('');
  const [signatureDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [sigPad, setSigPad] = useState<SignatureCanvas | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  // Always set isEditable to true by default
  const [isEditable] = useState<boolean>(true);
  
  // Determine if current user is agent or buyer
  const isAgent = user?.role === 'agent';
  
  // State to store existing agreements
  const [existingSignature, setExistingSignature] = useState<string | null>(null);
  
  // Reference to the iframe for PDF viewing
  const iframeRef = useRef<HTMLIFrameElement>(null);
  
  // Initial load of PDF
  useEffect(() => {
    if (isOpen && property?.id) {
      // Generate a PDF preview for the form
      generatePdfPreview();
    }
  }, [isOpen, property?.id]);
  
  // Initial PDF load is sufficient now, no need to watch isEditable changes
  // since it's now a constant value
  
  // Check for existing agreement when the modal opens
  useEffect(() => {
    if (isOpen && property?.id && viewingRequestId) {
      const fetchExistingAgreement = async () => {
        try {
          // Get agreements for this property
          const response = await apiRequest('GET', `/api/properties/${property.id}/agreements`);
          const data = await response.json();
          
          if (data.success && data.data && data.data.length > 0) {
            // Find agency disclosure agreements
            const agencyAgreements = data.data.filter(
              (agreement: any) => agreement.type === 'agency_disclosure'
            );
            
            if (agencyAgreements.length > 0) {
              // Use most recent agreement
              const latestAgreement = agencyAgreements[agencyAgreements.length - 1];
              
              // If the current user is an agent, check for existing agent signature
              if (isAgent && latestAgreement.agentSignature) {
                setExistingSignature(latestAgreement.agentSignature);
              }
              // If the user is a buyer, check for existing buyer signature
              else if (!isAgent && latestAgreement.buyerSignature) {
                setExistingSignature(latestAgreement.buyerSignature);
              }
            }
          }
        } catch (error) {
          console.error("Error fetching agreements:", error);
        }
      };
      
      fetchExistingAgreement();
    }
  }, [isOpen, property?.id, viewingRequestId, isAgent]);

  // Show an error message if property or agent is missing
  if (!property || !agent) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Error Opening Form</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="text-red-500">
              {!property && !agent && "Missing property and agent data."}
              {!property && agent && "Missing property data."}
              {property && !agent && "Missing agent data."}
            </div>
            <p>This could be because the viewing request doesn't have complete data.</p>
          </div>
          <DialogFooter>
            <Button onClick={onClose}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  // Form data to be sent to the server
  const formData = {
    // Buyer information
    buyerName1: user?.firstName && user?.lastName 
      ? `${user.firstName} ${user.lastName}` 
      : user?.email || '',
    
    // Property information
    propertyAddress: property.address,
    propertyCity: property.city || '',
    propertyState: property.state || '',
    propertyZip: property.zip || '',
    
    // Agent information
    agentName: `${agent.firstName || ''} ${agent.lastName || ''}`.trim() || agent.email,
    agentBrokerageName: "Coldwell Banker Grass Roots Realty",
    agentLicenseNumber: "2244751",
    
    // Set the appropriate signature based on user role
    ...(isAgent 
      ? {
          agentSignature: signature,
          agentSignatureDate: signatureDate
        } 
      : {
          buyerSignature1: signature,
          buyerSignatureDate1: signatureDate
        }),
  };

  const clearSignature = () => {
    if (sigPad) {
      sigPad.clear();
      setSignature('');
    }
  };

  const handleSignEnd = () => {
    if (sigPad) {
      const signatureData = sigPad.toDataURL();
      setSignature(signatureData);
    }
  };

  const generatePdfPreview = async () => {
    try {
      if (!property?.id) return;
      
      // Revoke any existing object URLs to prevent memory leaks
      if (pdfUrl) {
        window.URL.revokeObjectURL(pdfUrl);
        setPdfUrl(null);
      }

      // First, try to get existing agreements for this property
      let existingAgreementUrl = null;
      
      try {
        const agreementsResponse = await apiRequest('GET', `/api/properties/${property.id}/agreements`);
        const agreementsData = await agreementsResponse.json();
        
        if (agreementsData.success && agreementsData.data && agreementsData.data.length > 0) {
          // Find agency disclosure agreements
          const agencyAgreements = agreementsData.data.filter(
            (agreement: any) => agreement.type === 'agency_disclosure'
          );
          
          // Get the most recent agreement with a document URL
          if (agencyAgreements.length > 0) {
            const latestAgreement = agencyAgreements[agencyAgreements.length - 1];
            if (latestAgreement.documentUrl) {
              existingAgreementUrl = latestAgreement.documentUrl;
            }
          }
        }
      } catch (error) {
        console.error("Error fetching agreements for preview:", error);
        // Continue with generating a new preview if we can't get existing agreements
      }
      
      // Always use editable PDFs
      // If we have an existing agreement document, use that
      if (existingAgreementUrl) {
        try {
          // Convert standard URL path to our editable PDF endpoint
          // For example: /uploads/agreements/file.pdf -> /editable-pdf/agreements/file.pdf
          let editablePdfUrl = existingAgreementUrl;
          
          if (existingAgreementUrl.startsWith('/uploads/')) {
            // Extract the path after /uploads/
            const pathAfterUploads = existingAgreementUrl.substring('/uploads/'.length);
            // Create the editable PDF URL
            editablePdfUrl = `/editable-pdf/${pathAfterUploads}`;
          }
          
          // Add timestamp to prevent caching
          const timestamp = Date.now();
          const documentUrl = `${editablePdfUrl}?t=${timestamp}`;
          
          // Use standard fetch to get the document
          const docResponse = await fetch(documentUrl);
          
          if (!docResponse.ok) {
            throw new Error("Failed to fetch existing document");
          }
          
          // Get the PDF as a blob
          const blob = await docResponse.blob();
          
          // Create a temporary URL for the blob
          const url = window.URL.createObjectURL(blob);
          setPdfUrl(url);
          
          console.log("Successfully loaded existing editable PDF agreement");
          return url;
        } catch (fetchError) {
          console.error("Error fetching existing document:", fetchError);
          // Fall back to generating a new preview if we can't fetch the existing document
        }
      }
      
      // If no existing document or fetch failed, generate a new preview
      // Always use editable=true
      const response = await apiRequest(
        'POST', 
        `/api/properties/${property.id}/preview-agency-disclosure?editable=true`, 
        formData
      );
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to generate preview");
      }
      
      // Get the PDF as a blob
      const blob = await response.blob();
      
      // Create a temporary URL for the blob
      const url = window.URL.createObjectURL(blob);
      setPdfUrl(url);
      
      return url;
    } catch (error) {
      console.error("Error generating PDF preview:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to generate preview",
        variant: "destructive",
      });
      return null;
    }
  };
  
  // No longer needed since PDFs are always editable now

  const handleSave = async () => {
    // Use existing signature if it exists, otherwise require a new one
    const signatureToUse = existingSignature || signature;
    
    if (!signatureToUse) {
      toast({
        title: "Signature Required",
        description: "Please sign the form before saving",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      // Submit the form data to generate the PDF with the appropriate signature
      const formDataToSubmit = {
        ...formData,
        // Override with the signature we're actually using
        ...(isAgent 
          ? { agentSignature: signatureToUse }
          : { buyerSignature1: signatureToUse }
        ),
        viewingRequestId
      };
      
      const response = await apiRequest(
        'POST', 
        `/api/properties/${property.id}/generate-agency-disclosure`, 
        formDataToSubmit
      );
      
      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || "Failed to generate and save the agency disclosure form");
      }
      
      toast({
        title: "Form Submitted",
        description: "Agency Disclosure Form has been successfully signed and saved.",
      });
      
      // Invalidate queries to refresh data
      if (viewingRequestId) {
        queryClient.invalidateQueries({ queryKey: ['/api/viewing-requests/agent'] });
        queryClient.invalidateQueries({ queryKey: ['/api/viewing-requests/buyer'] });
      }
      queryClient.invalidateQueries({ queryKey: [`/api/properties/${property.id}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/properties/${property.id}/agreements`] });
      
      onClose();
    } catch (error) {
      console.error("Error saving agency disclosure form:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to save the form. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };


  
  // Clean up URLs when component unmounts
  useEffect(() => {
    return () => {
      if (pdfUrl) {
        window.URL.revokeObjectURL(pdfUrl);
      }
    };
  }, [pdfUrl]);
  
  return (
    <Dialog open={isOpen} onOpenChange={() => {
      // Clean up before closing
      if (pdfUrl) {
        window.URL.revokeObjectURL(pdfUrl);
        setPdfUrl(null);
      }
      onClose();
    }}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Agency Disclosure Form
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Title for the normal PDF section */}
          <div className="mb-2">
            <h3 className="text-md font-semibold">Standard Agency Disclosure Form</h3>
            <p className="text-xs text-gray-500">
              This is the standard California Agency Disclosure Form
            </p>
          </div>
          
          {/* PDF Controls */}
          <div className="flex items-center justify-end mb-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => generatePdfPreview()}
              className="bg-white shadow-sm"
            >
              <RefreshCw className="w-4 h-4 mr-1" /> Reload PDF
            </Button>
          </div>
          
          {/* PDF Viewer */}
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            {pdfUrl ? (
              <div className="relative w-full h-[500px]">
                <iframe
                  ref={iframeRef}
                  src={pdfUrl}
                  className="w-full h-full"
                  title="Agency Disclosure Form"
                  onError={(e) => {
                    console.error("PDF iframe error:", e);
                    // When iframe fails to load, regenerate the PDF
                    toast({
                      title: "PDF Loading Issue",
                      description: "Trying to reload the PDF. Please wait...",
                      variant: "default",
                    });
                    // Attempt to regenerate the PDF after a short delay
                    setTimeout(() => {
                      generatePdfPreview();
                    }, 1000);
                  }}
                />
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center w-full h-[500px] bg-gray-100">
                <Loader2 className="w-8 h-8 animate-spin text-gray-500 mb-4" />
                <p className="text-gray-600 text-sm">Loading PDF document...</p>
              </div>
            )}
          </div>

          {/* Signature Area */}
          <div className="pt-4">
            <h3 className="text-lg font-medium mb-2">Your Signature</h3>
            
            {existingSignature ? (
              <>
                <div className="mt-2 p-4 border border-gray-300 rounded-md bg-gray-50">
                  <p className="text-sm text-gray-600 mb-2">You have already signed this form:</p>
                  <img 
                    src={existingSignature} 
                    alt="Your existing signature" 
                    className="max-h-[100px] mx-auto"
                  />
                  <p className="text-xs text-gray-500 mt-2 text-center">
                    Signed on {signatureDate}
                  </p>
                </div>
                <Button 
                  type="button" 
                  variant="outline" 
                  size="sm"
                  className="mt-2"
                  onClick={() => setExistingSignature(null)}
                >
                  Sign Again
                </Button>
              </>
            ) : (
              <div className="relative border border-gray-300 rounded-md mt-1 bg-white">
                <SignatureCanvas
                  ref={(ref) => setSigPad(ref)}
                  canvasProps={{
                    width: 600,
                    height: 150,
                    className: 'signature-canvas border rounded-md',
                  }}
                  onEnd={handleSignEnd}
                />
                <Button 
                  type="button" 
                  variant="outline" 
                  size="sm" 
                  className="absolute top-2 right-2"
                  onClick={clearSignature}
                >
                  Clear
                </Button>
              </div>
            )}
            
            <p className="text-sm text-gray-600 mt-4">
              By signing, you acknowledge that you have received and read the California Agency Disclosure Form, 
              which explains the different types of agency relationships in real estate transactions.
            </p>
          </div>
        </div>

        <DialogFooter className="flex justify-end space-x-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Check className="mr-2 h-4 w-4" />
                Sign & Submit
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}