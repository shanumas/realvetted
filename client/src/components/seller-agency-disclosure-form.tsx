import { useState, useRef } from "react";
import SignatureCanvas from "react-signature-canvas";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle 
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Check, Download, Loader2, RefreshCw } from "lucide-react";
import { Property, User, Agreement } from "@shared/schema";

interface SellerAgencyDisclosureFormProps {
  isOpen: boolean;
  onClose: () => void;
  property: Property;
  agreement: Agreement;
}

export function SellerAgencyDisclosureForm({
  isOpen,
  onClose,
  property,
  agreement
}: SellerAgencyDisclosureFormProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [sellerSignature, setSellerSignature] = useState<string>('');
  const [sigPad, setSigPad] = useState<SignatureCanvas | null>(null);

  const handleClear = () => {
    if (sigPad) {
      sigPad.clear();
      setSellerSignature('');
    }
  };

  const handleDownload = async () => {
    try {
      // Open the preview in a new tab
      window.open(`/api/agreements/${agreement.id}/preview`, '_blank');
    } catch (error) {
      console.error("Error downloading preview:", error);
      toast({
        title: "Error",
        description: "Failed to generate preview. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleSave = async () => {
    if (!sigPad || sigPad.isEmpty()) {
      toast({
        title: "Signature Required",
        description: "Please sign the form before submitting.",
        variant: "destructive",
      });
      return;
    }

    const signatureData = sigPad.toDataURL();
    setSellerSignature(signatureData);

    setLoading(true);
    try {
      // Submit the seller's signature
      const response = await apiRequest(
        'POST', 
        `/api/properties/${property.id}/sign-agency-disclosure`, 
        {
          agreementId: agreement.id,
          sellerSignature: signatureData
        }
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
        description: error instanceof Error ? error.message : "Failed to save your signature. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Sign Agency Disclosure Form</DialogTitle>
          <DialogDescription>
            Please review and sign the Agency Disclosure Form for {property.address}.
            {agreement.status === "signed_by_agent" && (
              <span className="block mt-2 text-blue-600">
                The agent has already signed this form. Your signature will complete the process.
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-6">
          <div className="space-y-4">
            <div className="rounded-md border p-4">
              <h3 className="font-medium mb-2">Property Information</h3>
              <p className="text-sm">{property.address}, {property.city}, {property.state} {property.zip}</p>
            </div>

            <div className="rounded-md border p-4">
              <h3 className="font-medium mb-2">Agency Disclosure Form</h3>
              <p className="text-sm mb-2">
                This form discloses the agency relationships in this transaction. By signing, you acknowledge that you 
                understand the role of the agent in this transaction.
              </p>
              <Button variant="outline" type="button" onClick={handleDownload} className="mt-2">
                <Download className="w-4 h-4 mr-2" />
                View Complete Form
              </Button>
            </div>

            <div>
              <h3 className="font-medium mb-2">Your Signature</h3>
              <div className="border rounded-md p-2 bg-white">
                <SignatureCanvas
                  ref={(ref) => setSigPad(ref)}
                  canvasProps={{
                    className: "w-full h-32 border rounded-md",
                  }}
                />
              </div>
              <div className="mt-2 flex justify-end">
                <Button variant="outline" size="sm" onClick={handleClear}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Clear
                </Button>
              </div>
              <div className="pt-4">
                <p className="text-sm text-gray-600">
                  By signing, you acknowledge that you have received and read the California Agency Disclosure Form.
                  This signature confirms your understanding of the agency relationships for this transaction.
                </p>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="flex justify-between space-x-2">
          <div className="flex space-x-2">
            <Button variant="outline" type="button" onClick={handleDownload}>
              <Download className="w-4 h-4 mr-2" />
              Preview PDF
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