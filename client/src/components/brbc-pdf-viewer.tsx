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
      signatureRef.current.clear();
      setSignatureIsEmpty(true);
    } else if (activeTab === "buyer1-initials" && initialsRef.current) {
      initialsRef.current.clear();
      setInitialsIsEmpty(true);
    } else if (activeTab === "buyer2-signature" && buyer2SignatureRef.current) {
      buyer2SignatureRef.current.clear();
      setBuyer2SignatureIsEmpty(true);
    } else if (activeTab === "buyer2-initials" && buyer2InitialsRef.current) {
      buyer2InitialsRef.current.clear();
      setBuyer2InitialsIsEmpty(true);
    }
  };

  // Check if the signature canvas is empty based on active tab
  const checkSignature = () => {
    if (activeTab === "buyer1-signature" && signatureRef.current) {
      setSignatureIsEmpty(signatureRef.current.isEmpty());
    } else if (activeTab === "buyer1-initials" && initialsRef.current) {
      setInitialsIsEmpty(initialsRef.current.isEmpty());
    } else if (activeTab === "buyer2-signature" && buyer2SignatureRef.current) {
      setBuyer2SignatureIsEmpty(buyer2SignatureRef.current.isEmpty());
    } else if (activeTab === "buyer2-initials" && buyer2InitialsRef.current) {
      setBuyer2InitialsIsEmpty(buyer2InitialsRef.current.isEmpty());
    }
  };

  const handleSubmitSignature = async () => {
    // Require at least the primary buyer's signature
    if (!signatureRef.current || signatureRef.current.isEmpty()) {
      toast({
        title: "Primary Signature Required",
        description: "Please provide the primary buyer's signature before submitting.",
        variant: "destructive",
      });
      return;
    }
    
    // Also require initials from the primary buyer
    if (!initialsRef.current || initialsRef.current.isEmpty()) {
      toast({
        title: "Initials Required",
        description: "Please provide the primary buyer's initials before submitting.",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsSubmitting(true);
      
      // Get all signature data
      const signatureData = signatureRef.current.toDataURL();
      const initialsData = initialsRef.current.toDataURL();
      
      // Get optional buyer2 signatures if provided
      const buyer2SignatureData = buyer2SignatureRef.current && !buyer2SignatureRef.current.isEmpty() 
        ? buyer2SignatureRef.current.toDataURL() 
        : null;
        
      const buyer2InitialsData = buyer2InitialsRef.current && !buyer2InitialsRef.current.isEmpty()
        ? buyer2InitialsRef.current.toDataURL()
        : null;
      
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
              
              <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-grow flex flex-col">
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
                      }}
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
                    onClick={() => setActiveTab(activeTab === "buyer1-signature" ? "buyer1-initials" : (
                      activeTab === "buyer1-initials" ? "buyer2-signature" : (
                        activeTab === "buyer2-signature" ? "buyer2-initials" : "buyer1-signature"
                      )
                    ))}
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
                    onClick={() => setActiveTab(
                      activeTab.startsWith("buyer1") ? "buyer2-signature" : "buyer1-signature"
                    )}
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
                  onClick={handleSubmitSignature} 
                  disabled={isSubmitting || signatureIsEmpty || initialsIsEmpty}
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