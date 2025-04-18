import React, { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, FileText, Check, AlertTriangle, RefreshCw } from "lucide-react";
import SignatureCanvas from 'react-signature-canvas';
import { useAuth } from "@/hooks/use-auth";
import { useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

interface BRBCPdfViewerProps {
  isOpen: boolean;
  onClose: () => void;
  onSigned?: () => void;
}

export function BRBCPdfViewer({ isOpen, onClose, onSigned }: BRBCPdfViewerProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(true);
  const [signature, setSignature] = useState<string>('');
  const [sigPad, setSigPad] = useState<SignatureCanvas | null>(null);
  const [isSigned, setIsSigned] = useState(false);
  const [showSignaturePanel, setShowSignaturePanel] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [iframeLoading, setIframeLoading] = useState(true);
  const [iframeError, setIframeError] = useState(false);

  // Load the prefilled BRBC PDF when the component mounts
  useEffect(() => {
    if (isOpen) {
      setPdfUrl(`/api/docs/brbc.pdf?fillable=true&prefill=buyer&inline=true&t=${Date.now()}`);
      setIframeLoading(true);
      setIframeError(false);
    }
  }, [isOpen]);

  const handleSignBtnClick = () => {
    setShowSignaturePanel(true);
  };

  const clearSignature = () => {
    if (sigPad) {
      sigPad.clear();
      setSignature('');
    }
  };

  const handleIframeLoad = () => {
    setIframeLoading(false);
    setLoading(false);
  };

  const handleIframeError = () => {
    setIframeLoading(false);
    setIframeError(true);
    setLoading(false);
  };

  const handleSaveSignature = async () => {
    if (!signature) {
      toast({
        title: "Signature Required",
        description: "Please sign the form before saving",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      // Save the PDF with the signature, creating a new agreement in the database
      const formData = new FormData();
      formData.append('signature', signature);
      
      const response = await apiRequest('POST', '/api/global-brbc/pdf-signature', {
        signatureData: signature,
        details: {
          buyerName: user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() : 'Buyer',
          signatureDate: new Date().toISOString().split('T')[0],
        }
      });
      
      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || "Failed to save signature");
      }
      
      // Show success message
      toast({
        title: "Agreement Signed",
        description: "Your BRBC agreement has been signed and saved successfully.",
      });
      
      // Set state to indicate the form is signed
      setIsSigned(true);
      
      // Invalidate queries to refresh agreement data
      queryClient.invalidateQueries({ queryKey: ['/api/buyer/agreements'] });
      
      // Call the onSigned callback if provided
      if (onSigned) {
        onSigned();
      }
      
      // Close the signature panel
      setShowSignaturePanel(false);
      
      // Refresh the PDF to show with signature
      setPdfUrl(`/api/agreements/${result.data.id}/view-pdf?t=${Date.now()}`);
      
    } catch (error: any) {
      console.error("Error saving signature:", error);
      toast({
        title: "Error",
        description: error.message || "An error occurred while saving the signature",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>Buyer Representation Agreement</DialogTitle>
        </DialogHeader>
        
        <div className="mt-4">
          <Alert className="mb-4 bg-amber-50 border-amber-200">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <AlertTitle className="text-amber-800">Important Notice</AlertTitle>
            <AlertDescription className="text-amber-700">
              By signing this agreement, you are entering into a legally binding representation 
              agreement. Please read the entire document carefully before signing.
            </AlertDescription>
          </Alert>
          
          <div className="border rounded-lg overflow-hidden bg-gray-50 min-h-[60vh]">
            {pdfUrl && !iframeError ? (
              <iframe 
                ref={iframeRef}
                src={pdfUrl}
                className="w-full h-[60vh]"
                onLoad={handleIframeLoad}
                onError={handleIframeError}
              />
            ) : iframeError ? (
              <div className="flex flex-col items-center justify-center w-full h-[60vh]">
                <AlertTriangle className="w-12 h-12 text-red-500 mb-4" />
                <p className="text-red-700 font-medium">Failed to load PDF document</p>
                <Button 
                  variant="outline" 
                  className="mt-4"
                  onClick={() => {
                    setIframeLoading(true);
                    setIframeError(false);
                    setPdfUrl(`/api/docs/brbc.pdf?fillable=true&prefill=buyer&inline=true&t=${Date.now()}`);
                  }}
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Try Again
                </Button>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center w-full h-[60vh]">
                <Loader2 className="w-8 h-8 animate-spin text-gray-500 mb-4" />
                <p className="text-gray-600 text-sm">Loading PDF document...</p>
              </div>
            )}
          </div>
          
          {showSignaturePanel && (
            <div className="mt-4 border border-gray-300 rounded-md p-4">
              <h4 className="text-sm font-medium mb-2">Your Signature</h4>
              <div className="border border-gray-200 rounded bg-white">
                <SignatureCanvas
                  ref={(ref) => setSigPad(ref)}
                  penColor="black"
                  canvasProps={{
                    className: "w-full h-40 border-0",
                  }}
                  onEnd={() => {
                    if (sigPad) {
                      setSignature(sigPad.toDataURL());
                    }
                  }}
                />
              </div>
              <div className="flex justify-end mt-2 space-x-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={clearSignature}
                >
                  Clear
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={handleSaveSignature}
                  disabled={!signature || loading}
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    "Save Signature"
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>
        
        <DialogFooter>
          <div className="flex justify-between w-full">
            <Button variant="outline" onClick={onClose} disabled={loading}>
              Close
            </Button>
            
            {!showSignaturePanel && !isSigned && (
              <Button 
                onClick={handleSignBtnClick} 
                disabled={loading || iframeLoading}
                className="bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70"
              >
                <FileText className="mr-2 h-4 w-4" />
                Sign Agreement
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}