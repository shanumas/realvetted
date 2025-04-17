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
  const [signature2, setSignature2] = useState<string>('');
  const [signatureDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [sigPad, setSigPad] = useState<SignatureCanvas | null>(null);
  const [sigPad2, setSigPad2] = useState<SignatureCanvas | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  // Always set isEditable to true by default
  const [isEditable] = useState<boolean>(true);
  // State to track which signature is active (1 or 2)
  const [activeSignature, setActiveSignature] = useState<number>(1);
  
  // Determine if current user is agent or buyer
  const isAgent = user?.role === 'agent';
  
  // State to store existing agreements
  const [existingSignature, setExistingSignature] = useState<string | null>(null);
  const [existingSignature2, setExistingSignature2] = useState<string | null>(null);
  
  // State to keep track of form field values that user enters in PDF
  const [formFieldValues, setFormFieldValues] = useState<Record<string, string>>({});
  
  // Reference to the iframe for PDF viewing
  const iframeRef = useRef<HTMLIFrameElement>(null);
  
  // Initial load of PDF
  useEffect(() => {
    if (isOpen && property?.id) {
      // Generate a PDF preview for the form
      generatePdfPreview();
    }
  }, [isOpen, property?.id]);
  
  // Add listener for PDF form field changes
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe || !iframe.contentWindow) return;
    
    // Listen for messages from the iframe (PDF viewer)
    const handleFormFieldChange = (event: MessageEvent) => {
      // Check if the message is from our PDF viewer
      if (event.data && event.data.type === 'pdf_form_field_change') {
        // Update form field values
        setFormFieldValues(prev => ({
          ...prev,
          [event.data.fieldName]: event.data.value
        }));
        
        console.log(`Form field ${event.data.fieldName} changed to: ${event.data.value}`);
        
        // Trigger save with a debounce (after field changes stop for a bit)
        // Fetch the current PDF content from the iframe and save it
        if (pdfUrl && property?.id) {
          // Set a timeout to get and save the PDF after user has stopped typing
          const debounceTime = 1000; // 1 second
          
          if ((window as any).saveTimeoutId) {
            clearTimeout((window as any).saveTimeoutId);
          }
          
          (window as any).saveTimeoutId = setTimeout(async () => {
            try {
              console.log("Auto-saving PDF after field change");
              // Get the PDF content directly from the iframe
              const response = await fetch(pdfUrl);
              if (response.ok) {
                const pdfBlob = await response.blob();
                await saveEditedPdf(pdfBlob);
              }
            } catch (error) {
              console.error("Error auto-saving PDF:", error);
            }
          }, debounceTime);
        }
      }
    };
    
    window.addEventListener('message', handleFormFieldChange);
    
    // Inject script into iframe to capture form field changes
    const injectFormFieldTracker = () => {
      try {
        if (iframe.contentDocument && iframe.contentWindow) {
          // Create a script element
          const script = iframe.contentDocument.createElement('script');
          script.textContent = `
            // Watch for input events on form fields
            document.addEventListener('input', function(event) {
              // Check if the target is a form field (input, textarea, select)
              if (event.target.tagName === 'INPUT' || 
                  event.target.tagName === 'TEXTAREA' || 
                  event.target.tagName === 'SELECT') {
                
                // Send message to parent window with field name and value
                window.parent.postMessage({
                  type: 'pdf_form_field_change',
                  fieldName: event.target.name || event.target.id,
                  value: event.target.value
                }, '*');
              }
            });
          `;
          
          // Add the script to the iframe's document
          iframe.contentDocument.head.appendChild(script);
        }
      } catch (error) {
        console.error('Error injecting form field tracker script:', error);
      }
    };
    
    // Add load event listener to inject the script after iframe loads
    iframe.addEventListener('load', injectFormFieldTracker);
    
    // Save PDF when mouse leaves iframe area
    const handleMouseLeave = async () => {
      if (pdfUrl && property?.id) {
        console.log("Mouse left PDF area, auto-saving current state");
        try {
          // Get the PDF content directly from the iframe
          const response = await fetch(pdfUrl);
          if (response.ok) {
            const pdfBlob = await response.blob();
            await saveEditedPdf(pdfBlob);
          }
        } catch (error) {
          console.error("Error auto-saving PDF on mouse leave:", error);
        }
      }
    };
    
    // Add event listener for mouse leaving the iframe area
    const iframeContainer = iframe.parentElement;
    if (iframeContainer) {
      iframeContainer.addEventListener('mouseleave', handleMouseLeave);
    }
    
    // Clean up
    return () => {
      if ((window as any).saveTimeoutId) {
        clearTimeout((window as any).saveTimeoutId);
      }
      window.removeEventListener('message', handleFormFieldChange);
      iframe.removeEventListener('load', injectFormFieldTracker);
      if (iframeContainer) {
        iframeContainer.removeEventListener('mouseleave', handleMouseLeave);
      }
    };
  }, [iframeRef.current, pdfUrl, property?.id]);
  
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
    buyerName2: '', // This can be filled in by the user in the PDF form
    
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
          buyerSignatureDate1: signatureDate,
          buyerSignature2: signature2,
          buyerSignatureDate2: signatureDate
        }),
  };

  const clearSignature = () => {
    if (activeSignature === 1 && sigPad) {
      sigPad.clear();
      setSignature('');
    } else if (activeSignature === 2 && sigPad2) {
      sigPad2.clear();
      setSignature2('');
    }
  };

  const handleSignEnd = () => {
    if (activeSignature === 1 && sigPad) {
      const signatureData = sigPad.toDataURL();
      setSignature(signatureData);
    } else if (activeSignature === 2 && sigPad2) {
      const signatureData = sigPad2.toDataURL();
      setSignature2(signatureData);
    }
  };

  // Function to handle auto-saving edited PDF
  const saveEditedPdf = async (pdfBlob: Blob) => {
    try {
      if (!property?.id) return;
      
      // Convert PDF blob to base64
      const reader = new FileReader();
      return new Promise<void>((resolve, reject) => {
        reader.onloadend = async () => {
          try {
            const base64data = reader.result?.toString().split(',')[1]; // Remove data URL prefix
            
            if (!base64data) {
              console.error("Could not convert PDF to base64");
              resolve();
              return;
            }
            
            console.log("Saving edited PDF to database for property ID:", property.id);
            
            // Send the PDF content to the server
            const saveResponse = await apiRequest(
              'POST',
              `/api/properties/${property.id}/save-edited-pdf`,
              {
                pdfContent: base64data,
                viewingRequestId: viewingRequestId
              }
            );
            
            if (!saveResponse.ok) {
              console.error("Error saving PDF:", await saveResponse.text());
            } else {
              const responseText = await saveResponse.text();
              console.log("PDF saved successfully. Response:", responseText);
            }
            
            resolve();
          } catch (err) {
            console.error("Error in save operation:", err);
            reject(err);
          }
        };
        
        reader.onerror = () => {
          reject(new Error("Error reading PDF file"));
        };
        
        reader.readAsDataURL(pdfBlob);
      });
    } catch (error) {
      console.error("Error saving edited PDF:", error);
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
      const queryParams = isEditable ? `?editable=true${viewingRequestId ? `&viewingRequestId=${viewingRequestId}` : ''}` : '';
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
  
  // No longer needed since PDFs are always editable now

  const handleSave = async () => {
    // Use existing signature if it exists, otherwise require a new one
    const signatureToUse = existingSignature || signature;
    const signature2ToUse = existingSignature2 || signature2;
    
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
          : { 
              buyerSignature1: signatureToUse,
              buyerSignature2: signature2ToUse 
            }
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

  // Download functionality has been removed as per requirements
  
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

            {!isAgent && (
              <div className="mb-4">
                <div className="flex border-b border-gray-200">
                  <button
                    className={`px-4 py-2 font-medium text-sm ${activeSignature === 1 ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500'}`}
                    onClick={() => setActiveSignature(1)}
                  >
                    Primary Buyer Signature
                  </button>
                  <button
                    className={`px-4 py-2 font-medium text-sm ${activeSignature === 2 ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500'}`}
                    onClick={() => setActiveSignature(2)}
                  >
                    Secondary Buyer Signature (Optional)
                  </button>
                </div>
              </div>
            )}
            
            {activeSignature === 1 && (
              <>
                {existingSignature ? (
                  <>
                    <div className="mt-2 p-4 border border-gray-300 rounded-md bg-gray-50">
                      <p className="text-sm text-gray-600 mb-2">Your signature:</p>
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
              </>
            )}

            {activeSignature === 2 && !isAgent && (
              <>
                {existingSignature2 ? (
                  <>
                    <div className="mt-2 p-4 border border-gray-300 rounded-md bg-gray-50">
                      <p className="text-sm text-gray-600 mb-2">Second buyer signature:</p>
                      <img 
                        src={existingSignature2} 
                        alt="Second buyer signature" 
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
                      onClick={() => setExistingSignature2(null)}
                    >
                      Sign Again
                    </Button>
                  </>
                ) : (
                  <div className="relative border border-gray-300 rounded-md mt-1 bg-white">
                    <SignatureCanvas
                      ref={(ref) => setSigPad2(ref)}
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
              </>
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
          <Button 
            onClick={handleSave} 
            disabled={loading || (!signature && !existingSignature)}
          >
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