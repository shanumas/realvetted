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
import { Loader2, FileText, Check } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
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
  const signatureRef = useRef<SignatureCanvas>(null);
  const [signatureIsEmpty, setSignatureIsEmpty] = useState(true);

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

  const clearSignature = () => {
    if (signatureRef.current) {
      signatureRef.current.clear();
      setSignatureIsEmpty(true);
    }
  };

  const checkSignature = () => {
    if (signatureRef.current) {
      setSignatureIsEmpty(signatureRef.current.isEmpty());
    }
  };

  const handleSubmitSignature = async () => {
    if (!signatureRef.current || signatureRef.current.isEmpty()) {
      toast({
        title: "Signature Required",
        description: "Please sign the agreement before submitting.",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsSubmitting(true);
      
      // Get the signature as base64 data
      const signatureData = signatureRef.current.toDataURL();
      
      // Submit signature to server - using the correct endpoint
      const response = await apiRequest("/api/global-brbc/pdf-signature", "POST", {
        signatureData,
        details: {}
      });
      
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
              <p className="text-sm text-gray-600 mb-4">
                Please sign in the box below using your mouse or touch screen.
              </p>

              <div className="border border-gray-300 rounded-md mb-4 flex-grow bg-white">
                <SignatureCanvas
                  ref={signatureRef}
                  canvasProps={{
                    className: "w-full h-full signature-canvas",
                  }}
                  onEnd={checkSignature}
                />
              </div>

              <div className="flex space-x-2 mb-4">
                <Button variant="outline" onClick={clearSignature} size="sm">
                  Clear
                </Button>
              </div>
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
                  disabled={isSubmitting || signatureIsEmpty}
                  className="mr-2"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    'Submit Signature'
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