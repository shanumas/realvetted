import React, { useEffect, useRef, useState } from "react";
import SignatureCanvas from "react-signature-canvas";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Send, FileSignature, FileText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { User, Property } from "@shared/schema";

interface SellerAgencyDisclosureFormProps {
  isOpen: boolean;
  onClose: () => void;
  property: Property;
  agreementId: number;
  documentUrl?: string;
}

export function SellerAgencyDisclosureForm({ 
  isOpen, 
  onClose, 
  property,
  agreementId,
  documentUrl
}: SellerAgencyDisclosureFormProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [signature, setSignature] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [iframeLoading, setIframeLoading] = useState<boolean>(true);
  const [iframeError, setIframeError] = useState<boolean>(false);
  const sigPad = useRef<SignatureCanvas | null>(null);
  const signatureDate = new Date().toLocaleDateString();
  
  // Format the document URL correctly 
  const formattedDocumentUrl = documentUrl && 
    (documentUrl.startsWith('/uploads') || documentUrl.startsWith('http') 
      ? documentUrl 
      : `/uploads/${documentUrl}`);

  const clearSignature = () => {
    if (sigPad.current) {
      sigPad.current.clear();
      setSignature('');
    }
  };

  const handleSignEnd = () => {
    if (sigPad.current) {
      const signatureData = sigPad.current.toDataURL();
      setSignature(signatureData);
    }
  };

  const handleSubmit = async () => {
    if (!signature) {
      toast({
        title: "Signature Required",
        description: "Please sign the form before submitting.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      // Form data to submit for the seller signature
      const formData = {
        sellerSignature: signature,
        sellerSignatureDate: signatureDate,
        // Add the seller name
        sellerName1: "",  // This will be added from the server based on seller info
      };
      
      const response = await apiRequest(
        'POST', 
        `/api/properties/${property.id}/agency-disclosure`, 
        formData
      );
      
      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || "Failed to sign the agency disclosure form");
      }
      
      toast({
        title: "Form Signed",
        description: "You have successfully signed the Agency Disclosure Form.",
      });
      
      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: [`/api/properties/${property.id}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/properties/${property.id}/agreements`] });
      
      onClose();
    } catch (error) {
      console.error("Error signing agency disclosure form:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to sign the form. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleViewPdf = () => {
    if (formattedDocumentUrl) {
      window.open(formattedDocumentUrl, '_blank');
    } else {
      // Attempt to fetch the latest agreement if no document URL was provided
      apiRequest('GET', `/api/properties/${property.id}/agreements`)
        .then(async (response) => {
          const data = await response.json();
          if (data.success && data.data && data.data.length > 0) {
            const agencyDisclosures = data.data.filter((a: any) => a.type === 'agency_disclosure');
            if (agencyDisclosures.length > 0) {
              // Get the most recent agreement
              const latestAgreement = agencyDisclosures[agencyDisclosures.length - 1];
              if (latestAgreement.documentUrl) {
                const docUrl = latestAgreement.documentUrl.startsWith('/uploads') || 
                                  latestAgreement.documentUrl.startsWith('http') ? 
                                  latestAgreement.documentUrl : 
                                  `/uploads/${latestAgreement.documentUrl}`;
                window.open(docUrl, '_blank');
                return;
              }
            }
          }
          toast({
            title: "Document Not Available",
            description: "The document is not available for preview at this time.",
            variant: "destructive",
          });
        })
        .catch(error => {
          console.error("Error fetching agreements:", error);
          toast({
            title: "Error",
            description: "Failed to load the document. Please try again later.",
            variant: "destructive",
          });
        });
    }
  };

  const handleIframeLoad = () => {
    setIframeLoading(false);
  };

  const handleIframeError = () => {
    setIframeLoading(false);
    setIframeError(true);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Sign Agency Disclosure Form</DialogTitle>
          <DialogDescription>
            Please review and sign the disclosure form for {property.address}
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="border rounded-md overflow-hidden" style={{ height: '300px' }}>
            {formattedDocumentUrl ? (
              <>
                {iframeLoading && (
                  <div className="flex items-center justify-center h-full">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                )}
                <iframe 
                  src={formattedDocumentUrl}
                  width="100%" 
                  height="100%" 
                  title="Agency Disclosure Form"
                  className={`border-0 ${iframeLoading ? 'opacity-0' : 'opacity-100'}`}
                  onLoad={handleIframeLoad}
                  onError={handleIframeError}
                />
              </>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-gray-500">
                <FileText className="h-12 w-12 mb-2 text-gray-300" />
                <p>Document preview not available</p>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="mt-2"
                  onClick={handleViewPdf}
                >
                  <FileSignature className="mr-2 h-4 w-4" />
                  Load Document
                </Button>
              </div>
            )}
          </div>
          
          <div className="space-y-2">
            <label className="text-sm font-medium">Your Signature:</label>
            <div className="border rounded-md p-2 h-40 relative">
              <SignatureCanvas
                ref={sigPad}
                canvasProps={{
                  width: 500,
                  height: 150,
                  className: 'w-full h-full'
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
          </div>
          
          <p className="text-sm text-gray-600">
            By signing, you acknowledge that you have received and read the California Agency Disclosure Form, 
            which explains the different types of agency relationships in real estate transactions.
          </p>
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            variant="outline"
            onClick={handleViewPdf}
            className="ml-2"
          >
            <FileSignature className="mr-2 h-4 w-4" />
            View Full Form
          </Button>
          <Button 
            onClick={handleSubmit}
            disabled={loading || !signature}
          >
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
            Sign & Submit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}