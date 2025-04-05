import React, { useEffect, useRef, useState } from "react";
import SignatureCanvas from "react-signature-canvas";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Save, Send } from "lucide-react";
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
  const [viewingForm, setViewingForm] = useState<boolean>(false);
  const sigPad = useRef<SignatureCanvas | null>(null);
  const signatureDate = new Date().toLocaleDateString();

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
    if (documentUrl) {
      window.open(documentUrl, '_blank');
    } else {
      toast({
        title: "Document Not Available",
        description: "The document is not available for preview at this time.",
        variant: "destructive",
      });
      return;
    }
    setViewingForm(true);
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
        
        <div className="space-y-4">
          {!viewingForm && (
            <div className="bg-amber-50 p-3 rounded-md border border-amber-200">
              <p className="text-sm text-amber-800">
                Please review the form carefully before signing. Click the button below to view the form.
              </p>
              <Button 
                variant="outline" 
                size="sm" 
                className="mt-2 w-full"
                onClick={handleViewPdf}
              >
                View Form
              </Button>
            </div>
          )}
          
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
          
          <p className="text-sm text-gray-600 mt-4">
            By signing, you acknowledge that you have received and read the California Agency Disclosure Form, 
            which explains the different types of agency relationships in real estate transactions.
          </p>
        </div>
        
        <DialogFooter className="flex justify-between">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
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