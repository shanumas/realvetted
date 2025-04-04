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
import { Loader2, FileText, Download, Check } from "lucide-react";
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
  const [isEditable, setIsEditable] = useState<boolean>(false);
  
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
  
  // Update PDF when editable toggle changes
  useEffect(() => {
    if (isOpen && property?.id) {
      generatePdfPreview();
    }
  }, [isEditable]);
  
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
      
      // Generate a preview of the form, adding the editable query parameter if needed
      const queryParams = isEditable ? '?editable=true' : '';
      const response = await apiRequest(
        'POST', 
        `/api/properties/${property.id}/preview-agency-disclosure${queryParams}`, 
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
  
  // Handle toggle change for editable PDF
  const handleEditableToggle = (checked: boolean) => {
    setIsEditable(checked);
    // Regenerate the PDF preview whenever the editable toggle changes
    generatePdfPreview();
  };

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

  const handleDownload = async () => {
    try {
      // Always generate a fresh PDF for download to ensure it has the current editable state
      const url = await generatePdfPreview();
      if (!url) throw new Error("Failed to generate PDF");
      
      // Create a link and trigger download
      const a = document.createElement('a');
      a.href = url;
      const fileNameSuffix = isEditable ? '_editable' : '';
      a.download = `Agency_Disclosure_${property.address.replace(/\s+/g, '_')}${fileNameSuffix}.pdf`;
      document.body.appendChild(a);
      a.click();
      
      // Clean up
      document.body.removeChild(a);
    } catch (error) {
      console.error("Error downloading preview:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to download preview",
        variant: "destructive",
      });
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
          
          {/* Special PDF Placeholder Link */}
          <div className="mb-4 bg-green-50 p-4 rounded-md border border-green-200">
            <h3 className="text-md font-semibold text-green-700 mb-2 flex items-center">
              <FileText className="w-5 h-5 mr-2" />
              PDF Form Field Replacement Demo
            </h3>
            <p className="text-sm text-green-600 mb-2">
              This feature demonstrates PDF form field manipulation, showing how we would replace the text "1" with "uma".
            </p>
            <div className="bg-yellow-50 p-3 rounded-md border border-yellow-200 mb-3">
              <p className="text-sm text-yellow-700 font-medium">
                Important: Click the button below to open a demonstration PDF in a new tab. 
                The PDF includes the original document plus an explanatory page about form field replacement.
              </p>
            </div>
            <a 
              href="/api/placeholder-replacement" 
              target="_blank"
              rel="noopener noreferrer" 
              className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
            >
              <FileText className="w-4 h-4 mr-2" />
              View PDF Form Field Replacement Demo
            </a>
          </div>

          {/* PDF Viewer */}
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            {pdfUrl ? (
              <iframe
                ref={iframeRef}
                src={pdfUrl}
                className="w-full h-[500px]"
                title="Agency Disclosure Form"
              />
            ) : (
              <div className="flex items-center justify-center w-full h-[500px] bg-gray-100">
                <Loader2 className="w-8 h-8 animate-spin text-gray-500" />
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

        <DialogFooter className="flex justify-between space-x-2">
          <div className="flex space-x-2">
            <Button variant="outline" type="button" onClick={handleDownload}>
              <Download className="w-4 h-4 mr-2" />
              Download PDF
            </Button>
          </div>
          <div className="flex space-x-2">
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
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}