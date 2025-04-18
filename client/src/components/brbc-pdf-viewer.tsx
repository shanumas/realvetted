import React, { useState, useRef, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Loader2, FileText, Check, User, UserPlus } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import SignatureCanvas from "react-signature-canvas";

// Utility to save and restore signature canvas data
interface SignatureData {
  primary: string | null;
  initials: string | null;
  buyer2Primary: string | null;
  buyer2Initials: string | null;
}

interface BRBCPdfViewerProps {
  isOpen: boolean;
  onClose: () => void;
  onSigned?: () => void;
}

export function BRBCPdfViewer({ isOpen, onClose, onSigned }: BRBCPdfViewerProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(true);
  const [pdfUrl, setPdfUrl] = useState("");
  const [isSigning, setIsSigning] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasSigned, setHasSigned] = useState(false);
  const [activeTab, setActiveTab] = useState("buyer1-signature");
  
  // Signature refs for different signature types
  const signatureRef = useRef<SignatureCanvas>(null);
  const initialsRef = useRef<SignatureCanvas>(null);
  const buyer2SignatureRef = useRef<SignatureCanvas>(null);
  const buyer2InitialsRef = useRef<SignatureCanvas>(null);
  
  // Signature empty states
  const [signatureIsEmpty, setSignatureIsEmpty] = useState(true);
  const [initialsIsEmpty, setInitialsIsEmpty] = useState(true);
  const [buyer2SignatureIsEmpty, setBuyer2SignatureIsEmpty] = useState(true);
  const [buyer2InitialsIsEmpty, setBuyer2InitialsIsEmpty] = useState(true);
  
  // State to store signature images when switching tabs
  const [savedSignatures, setSavedSignatures] = useState<SignatureData>({
    primary: null,
    initials: null,
    buyer2Primary: null,
    buyer2Initials: null
  });

  useEffect(() => {
    // When the dialog opens, load the prefilled PDF
    if (isOpen) {
      const url = `/api/docs/brbc.pdf?fillable=true&prefill=buyer&inline=true&t=${Date.now()}`;
      setPdfUrl(url);
      setIsLoading(true);
      setHasSigned(false);
      setIsSigning(false);
    }
  }, [isOpen]);

  const handlePdfLoad = () => {
    setIsLoading(false);
  };

  const handlePdfError = () => {
    setIsLoading(false);
    toast({
      title: "Error Loading PDF",
      description: "There was a problem loading the agreement. Please try again.",
      variant: "destructive",
    });
  };

  // Clear the signature canvas based on active tab
  const clearSignature = () => {
    if (activeTab === "buyer1-signature" && signatureRef.current) {
      // Clear the canvas
      signatureRef.current.clear();
      // Update empty state
      setSignatureIsEmpty(true);
      // Also update the saved signatures state
      setSavedSignatures(prev => ({ ...prev, primary: null }));
      
    } else if (activeTab === "buyer1-initials" && initialsRef.current) {
      // Clear the canvas
      initialsRef.current.clear();
      // Update empty state
      setInitialsIsEmpty(true);
      // Also update the saved signatures state
      setSavedSignatures(prev => ({ ...prev, initials: null }));
      
    } else if (activeTab === "buyer2-signature" && buyer2SignatureRef.current) {
      // Clear the canvas
      buyer2SignatureRef.current.clear();
      // Update empty state
      setBuyer2SignatureIsEmpty(true);
      // Also update the saved signatures state
      setSavedSignatures(prev => ({ ...prev, buyer2Primary: null }));
      
    } else if (activeTab === "buyer2-initials" && buyer2InitialsRef.current) {
      // Clear the canvas
      buyer2InitialsRef.current.clear();
      // Update empty state
      setBuyer2InitialsIsEmpty(true);
      // Also update the saved signatures state
      setSavedSignatures(prev => ({ ...prev, buyer2Initials: null }));
    }
  };

  // Save current signature data before switching tabs
  const saveCurrentSignature = () => {
    try {
      const updatedSignatures = { ...savedSignatures };
      
      if (activeTab === "buyer1-signature" && signatureRef.current) {
        // Set to either data URL or null based on isEmpty
        updatedSignatures.primary = signatureRef.current.isEmpty() 
          ? null 
          : signatureRef.current.toDataURL();
        
        // Update the empty state
        setSignatureIsEmpty(signatureRef.current.isEmpty());
        
      } else if (activeTab === "buyer1-initials" && initialsRef.current) {
        // Set to either data URL or null based on isEmpty
        updatedSignatures.initials = initialsRef.current.isEmpty() 
          ? null 
          : initialsRef.current.toDataURL();
        
        // Update the empty state
        setInitialsIsEmpty(initialsRef.current.isEmpty());
        
      } else if (activeTab === "buyer2-signature" && buyer2SignatureRef.current) {
        // Set to either data URL or null based on isEmpty
        updatedSignatures.buyer2Primary = buyer2SignatureRef.current.isEmpty() 
          ? null 
          : buyer2SignatureRef.current.toDataURL();
        
        // Update the empty state
        setBuyer2SignatureIsEmpty(buyer2SignatureRef.current.isEmpty());
        
      } else if (activeTab === "buyer2-initials" && buyer2InitialsRef.current) {
        // Set to either data URL or null based on isEmpty
        updatedSignatures.buyer2Initials = buyer2InitialsRef.current.isEmpty() 
          ? null 
          : buyer2InitialsRef.current.toDataURL();
        
        // Update the empty state
        setBuyer2InitialsIsEmpty(buyer2InitialsRef.current.isEmpty());
      }
      
      setSavedSignatures(updatedSignatures);
    } catch (err) {
      console.error('Error saving signature:', err);
    }
  };
  
  // Helper method to restore saved signatures when switching tabs
  const restoreSignaturesOnTabLoad = (newTab: string) => {
    setTimeout(() => {
      try {
        if (newTab === "buyer1-signature" && signatureRef.current && savedSignatures.primary) {
          const img = new Image();
          img.onload = () => {
            const canvas = signatureRef.current;
            if (canvas) {
              canvas.clear();
              canvas.fromDataURL(savedSignatures.primary as string);
              
              // Manually update empty state after a slight delay to ensure canvas has time to update
              setTimeout(() => {
                setSignatureIsEmpty(canvas.isEmpty());
                // Force check for validation by simulating an end event
                checkSignature();
              }, 100);
            }
          };
          img.src = savedSignatures.primary;
        } else if (newTab === "buyer1-initials" && initialsRef.current && savedSignatures.initials) {
          const img = new Image();
          img.onload = () => {
            const canvas = initialsRef.current;
            if (canvas) {
              canvas.clear();
              canvas.fromDataURL(savedSignatures.initials as string);
              
              // Manually update empty state after a slight delay
              setTimeout(() => {
                setInitialsIsEmpty(canvas.isEmpty());
                // Force check for validation
                checkSignature();
              }, 100);
            }
          };
          img.src = savedSignatures.initials;
        } else if (newTab === "buyer2-signature" && buyer2SignatureRef.current && savedSignatures.buyer2Primary) {
          const img = new Image();
          img.onload = () => {
            const canvas = buyer2SignatureRef.current;
            if (canvas) {
              canvas.clear();
              canvas.fromDataURL(savedSignatures.buyer2Primary as string);
              
              // Manually update empty state
              setTimeout(() => {
                setBuyer2SignatureIsEmpty(canvas.isEmpty());
                checkSignature();
              }, 100);
            }
          };
          img.src = savedSignatures.buyer2Primary;
        } else if (newTab === "buyer2-initials" && buyer2InitialsRef.current && savedSignatures.buyer2Initials) {
          const img = new Image();
          img.onload = () => {
            const canvas = buyer2InitialsRef.current;
            if (canvas) {
              canvas.clear();
              canvas.fromDataURL(savedSignatures.buyer2Initials as string);
              
              // Manually update empty state
              setTimeout(() => {
                setBuyer2InitialsIsEmpty(canvas.isEmpty());
                checkSignature();
              }, 100);
            }
          };
          img.src = savedSignatures.buyer2Initials;
        }
      } catch (err) {
        console.error('Error restoring signature:', err);
      }
    }, 50); // Small delay to ensure canvas is ready
  };
  
  // Check if the signature canvas is empty based on active tab and update the PDF preview
  const checkSignature = () => {
    // Save state for UI validation
    if (activeTab === "buyer1-signature" && signatureRef.current) {
      const isEmpty = signatureRef.current.isEmpty();
      setSignatureIsEmpty(isEmpty);
      
      // If not empty, update PDF preview with signature
      if (!isEmpty) {
        const signatureData = signatureRef.current.toDataURL();
        updatePdfPreviewWithSignature(signatureData, "primary");
      }
      
    } else if (activeTab === "buyer1-initials" && initialsRef.current) {
      const isEmpty = initialsRef.current.isEmpty();
      setInitialsIsEmpty(isEmpty);
      
      // If not empty, update PDF preview with initials
      if (!isEmpty) {
        const initialsData = initialsRef.current.toDataURL();
        updatePdfPreviewWithSignature(initialsData, "initials");
      }
      
    } else if (activeTab === "buyer2-signature" && buyer2SignatureRef.current) {
      const isEmpty = buyer2SignatureRef.current.isEmpty();
      setBuyer2SignatureIsEmpty(isEmpty);
      
      // If not empty, update PDF preview with signature
      if (!isEmpty) {
        const signatureData = buyer2SignatureRef.current.toDataURL();
        updatePdfPreviewWithSignature(signatureData, "buyer2Primary");
      }
      
    } else if (activeTab === "buyer2-initials" && buyer2InitialsRef.current) {
      const isEmpty = buyer2InitialsRef.current.isEmpty();
      setBuyer2InitialsIsEmpty(isEmpty);
      
      // If not empty, update PDF preview with initials
      if (!isEmpty) {
        const initialsData = buyer2InitialsRef.current.toDataURL();
        updatePdfPreviewWithSignature(initialsData, "buyer2Initials");
      }
    }
  };
  
  // Function to update the PDF with the signature image in real-time
  const updatePdfPreviewWithSignature = async (
    signatureData: string, 
    type: "primary" | "initials" | "buyer2Primary" | "buyer2Initials"
  ) => {
    try {
      // Save current signature to state
      saveCurrentSignature();
      
      // Prepare data for server request
      const requestData: Record<string, any> = {
        previewOnly: true, // Flag to indicate this is just for preview
        details: {}
      };
      
      // Set the appropriate signature data based on type
      if (type === "primary") {
        requestData.signatureData = signatureData;
      } else if (type === "initials") {
        requestData.initialsData = signatureData;
      } else if (type === "buyer2Primary") {
        requestData.buyer2SignatureData = signatureData;
      } else if (type === "buyer2Initials") {
        requestData.buyer2InitialsData = signatureData;
      }
      
      // Add existing signatures from state
      if (type !== "primary" && savedSignatures.primary) {
        requestData.signatureData = savedSignatures.primary;
      }
      if (type !== "initials" && savedSignatures.initials) {
        requestData.initialsData = savedSignatures.initials;
      }
      if (type !== "buyer2Primary" && savedSignatures.buyer2Primary) {
        requestData.buyer2SignatureData = savedSignatures.buyer2Primary;
      }
      if (type !== "buyer2Initials" && savedSignatures.buyer2Initials) {
        requestData.buyer2InitialsData = savedSignatures.buyer2Initials;
      }
      
      // Send the request to get a preview PDF with signatures
      const response = await fetch("/api/global-brbc/pdf-signature", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestData),
      }).then(res => res.json());
      
      // If successful, update the PDF preview
      if (response && response.success && response.data && response.data.pdfUrl) {
        setPdfUrl(response.data.pdfUrl);
      }
    } catch (error) {
      console.error("Error updating PDF preview:", error);
      // Silently fail on preview errors - don't show error to user
    }
  };

  const handleSubmitSignature = async () => {
    // Manual check for primary buyer's signature using saved signature data
    if (!savedSignatures.primary && (signatureRef.current?.isEmpty() || !signatureRef.current)) {
      toast({
        title: "Primary Signature Required",
        description: "Please provide the primary buyer's signature before submitting.",
        variant: "destructive",
      });
      return;
    }
    
    // Manual check for initials using saved data
    if (!savedSignatures.initials && (initialsRef.current?.isEmpty() || !initialsRef.current)) {
      toast({
        title: "Initials Required",
        description: "Please provide the primary buyer's initials before submitting.",
        variant: "destructive",
      });
      return;
    }
    
    // Save any signature currently in the active canvas
    saveCurrentSignature();

    try {
      setIsSubmitting(true);
      
      // First, ensure we have the most updated signature data
      saveCurrentSignature();
      
      // Get all signature data - use saved signatures for submission
      // For the primary buyer's signature
      let signatureData: string;
      if (savedSignatures.primary) {
        signatureData = savedSignatures.primary as string;
      } else {
        throw new Error("Primary signature is required");
      }
      
      // For the primary buyer's initials
      let initialsData: string;
      if (savedSignatures.initials) {
        initialsData = savedSignatures.initials as string;
      } else {
        throw new Error("Initials are required");
      }
      
      // For the second buyer's signature (optional)
      const buyer2SignatureData = savedSignatures.buyer2Primary || 
        (buyer2SignatureRef.current && !buyer2SignatureRef.current.isEmpty() 
          ? buyer2SignatureRef.current.toDataURL() 
          : null);
      
      // For the second buyer's initials (optional)
      const buyer2InitialsData = savedSignatures.buyer2Initials || 
        (buyer2InitialsRef.current && !buyer2InitialsRef.current.isEmpty()
          ? buyer2InitialsRef.current.toDataURL()
          : null);
      
      // Submit signature to server with all signature types
      const response = await fetch("/api/global-brbc/pdf-signature", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          // Main signature for sign1 field
          signatureData,
          // Initials for initial1 field
          initialsData,
          // Optional second buyer signature and initials
          buyer2SignatureData,
          buyer2InitialsData,
          details: {}
        }),
      }).then(res => res.json());
      
      // Handle successful submission
      if (response && response.success) {
        setHasSigned(true);
        toast({
          title: "Agreement Signed",
          description: "You have successfully signed the buyer representation agreement.",
        });
        
        // Call onSigned callback if provided
        if (onSigned) {
          onSigned();
        }
      } else {
        const errorMessage = response && (response.error as string) ? response.error as string : "Failed to sign agreement";
        throw new Error(errorMessage);
      }
    } catch (error) {
      console.error("Error signing agreement:", error);
      toast({
        title: "Signing Failed",
        description: error instanceof Error ? error.message : "An unexpected error occurred while signing the agreement.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };
  
  const handleClose = () => {
    // If the user has signed, we can just close
    if (hasSigned) {
      onClose();
      return;
    }
    
    // If they're in signing mode but haven't submitted, ask for confirmation
    if (isSigning && !signatureIsEmpty) {
      if (window.confirm("You haven't submitted your signature. Are you sure you want to close?")) {
        onClose();
      }
    } else {
      // Otherwise just close
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-w-4xl h-[90vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="p-4 border-b">
          <DialogTitle className="text-xl font-semibold">
            <div className="flex items-center">
              <FileText className="mr-2 h-5 w-5 text-primary" />
              Buyer Representation Agreement
            </div>
          </DialogTitle>
          <DialogDescription>
            Please review and sign the agreement below to proceed with your property search.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-grow flex flex-col md:flex-row overflow-hidden">
          {/* PDF Viewer */}
          <div className={`flex-grow ${isSigning ? 'w-2/3' : 'w-full'} overflow-hidden relative`}>
            {isLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-gray-100 bg-opacity-70 z-10">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            )}
            <iframe
              src={pdfUrl}
              className="w-full h-full border-0"
              onLoad={handlePdfLoad}
              onError={handlePdfError}
            ></iframe>
          </div>

          {/* Signature Panel (only visible when signing) */}
          {isSigning && (
            <div className="w-full md:w-1/3 border-l border-gray-200 p-4 flex flex-col">
              <h3 className="font-semibold mb-2">Sign Agreement</h3>
              <p className="text-sm text-gray-600 mb-2">
                Please provide your signature and initials in the tabs below.
              </p>
              
              <Tabs 
                value={activeTab} 
                onValueChange={(newTab) => {
                  // Save current signature before switching tabs
                  saveCurrentSignature();
                  // Update active tab
                  setActiveTab(newTab);
                  // Restore signature for the new tab
                  restoreSignaturesOnTabLoad(newTab);
                }} 
                className="flex-grow flex flex-col">
                <TabsList className="w-full grid grid-cols-2 mb-4">
                  <TabsTrigger value="buyer1-signature" className="flex items-center">
                    <User className="mr-2 h-4 w-4" />
                    Signature
                  </TabsTrigger>
                  <TabsTrigger value="buyer1-initials" className="flex items-center">
                    <User className="mr-2 h-4 w-4" />
                    Initials
                  </TabsTrigger>
                </TabsList>
                
                <TabsContent value="buyer1-signature" className="flex-grow flex flex-col">
                  <p className="text-xs text-gray-500 mb-2">Your full signature for main signature fields</p>
                  <div className="border border-gray-300 rounded-md mb-4 flex-grow bg-white">
                    <SignatureCanvas
                      ref={signatureRef}
                      canvasProps={{
                        className: "w-full h-full signature-canvas",
                        // Add event listeners directly to the canvas props
                        onMouseUp: checkSignature,
                        onTouchEnd: checkSignature
                      }}
                      // Check signature on every stroke end (real-time update)
                      onEnd={checkSignature}
                    />
                  </div>
                </TabsContent>
                
                <TabsContent value="buyer1-initials" className="flex-grow flex flex-col">
                  <p className="text-xs text-gray-500 mb-2">Your initials for document pages</p>
                  <div className="border border-gray-300 rounded-md mb-4 flex-grow bg-white">
                    <SignatureCanvas
                      ref={initialsRef}
                      canvasProps={{
                        className: "w-full h-full signature-canvas",
                        // Add event listeners directly to the canvas props
                        onMouseUp: checkSignature,
                        onTouchEnd: checkSignature
                      }}
                      onEnd={checkSignature}
                    />
                  </div>
                </TabsContent>
                
                <TabsContent value="buyer2-signature" className="flex-grow flex flex-col">
                  <p className="text-xs text-gray-500 mb-2">Second buyer's full signature (optional)</p>
                  <div className="border border-gray-300 rounded-md mb-4 flex-grow bg-white">
                    <SignatureCanvas
                      ref={buyer2SignatureRef}
                      canvasProps={{
                        className: "w-full h-full signature-canvas",
                      }}
                      onEnd={checkSignature}
                    />
                  </div>
                </TabsContent>
                
                <TabsContent value="buyer2-initials" className="flex-grow flex flex-col">
                  <p className="text-xs text-gray-500 mb-2">Second buyer's initials (optional)</p>
                  <div className="border border-gray-300 rounded-md mb-4 flex-grow bg-white">
                    <SignatureCanvas
                      ref={buyer2InitialsRef}
                      canvasProps={{
                        className: "w-full h-full signature-canvas",
                      }}
                      onEnd={checkSignature}
                    />
                  </div>
                </TabsContent>
                
                <div className="mt-2 flex justify-between items-center">
                  <Button variant="outline" onClick={clearSignature} size="sm" className="w-24">
                    Clear
                  </Button>
                  
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => {
                      // Save current signature before moving to next tab
                      saveCurrentSignature();
                      
                      // Determine next tab
                      const nextTab = activeTab === "buyer1-signature" ? "buyer1-initials" : (
                        activeTab === "buyer1-initials" ? "buyer2-signature" : (
                          activeTab === "buyer2-signature" ? "buyer2-initials" : "buyer1-signature"
                        )
                      );
                      
                      // Set new tab and restore any saved signature
                      setActiveTab(nextTab);
                      restoreSignaturesOnTabLoad(nextTab);
                    }}
                    className="w-24"
                  >
                    Next
                  </Button>
                </div>
                
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full flex items-center justify-center"
                    onClick={() => {
                      // Save current signature
                      saveCurrentSignature();
                      
                      // Determine new tab
                      const newTab = activeTab.startsWith("buyer1") ? "buyer2-signature" : "buyer1-signature";
                      
                      // Set new tab and restore any saved signature
                      setActiveTab(newTab);
                      restoreSignaturesOnTabLoad(newTab);
                    }}
                  >
                    {activeTab.startsWith("buyer1") ? (
                      <>
                        <UserPlus className="mr-2 h-4 w-4" />
                        Add Second Buyer (Optional)
                      </>
                    ) : (
                      <>
                        <User className="mr-2 h-4 w-4" />
                        Back to Primary Buyer
                      </>
                    )}
                  </Button>
                </div>
              </Tabs>
            </div>
          )}
        </div>

        <DialogFooter className="p-4 border-t flex flex-col sm:flex-row justify-between items-center gap-2">
          {hasSigned ? (
            <div className="flex items-center text-green-600 font-medium">
              <Check className="mr-1.5 h-5 w-5" />
              Successfully signed
            </div>
          ) : (
            <div className="flex-1">
              {!isSigning ? (
                <Button 
                  className="mr-2" 
                  onClick={() => setIsSigning(true)}
                >
                  Sign Agreement
                </Button>
              ) : (
                <Button 
                  onClick={() => {
                    // Force a final check of all signatures before submission
                    if (signatureRef.current) {
                      setSignatureIsEmpty(signatureRef.current.isEmpty());
                    }
                    if (initialsRef.current) {
                      setInitialsIsEmpty(initialsRef.current.isEmpty());
                    }
                    
                    // Use a short timeout to let state update before submitting
                    setTimeout(() => {
                      handleSubmitSignature();
                    }, 50);
                  }} 
                  disabled={isSubmitting || (!savedSignatures.primary && signatureIsEmpty) || (!savedSignatures.initials && initialsIsEmpty)}
                  className="mr-2"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    'Submit Signatures'
                  )}
                </Button>
              )}
              
              <Button variant="outline" onClick={handleClose}>
                {hasSigned ? 'Close' : 'Cancel'}
              </Button>
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}