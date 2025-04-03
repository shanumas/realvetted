import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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
  const [buyerSignature, setBuyerSignature] = useState<string>('');
  const [buyerSignatureDate, setBuyerSignatureDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [isLeasehold, setIsLeasehold] = useState<boolean>(false);
  const [sigPad, setSigPad] = useState<SignatureCanvas | null>(null);

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
    buyerName1: user?.firstName && user?.lastName ? `${user?.firstName} ${user?.lastName}` : user?.email || '',
    buyerSignature1: buyerSignature,
    buyerSignatureDate1: buyerSignatureDate,
    
    // Property information
    propertyAddress: property.address,
    propertyCity: property.city || '',
    propertyState: property.state || '',
    propertyZip: property.zip || '',
    
    // Agent information
    agentName: `${agent.firstName || ''} ${agent.lastName || ''}`.trim() || agent.email,
    agentBrokerageName: "Coldwell Banker Grass Roots Realty",
    agentLicenseNumber: "2244751",
    
    // Is this a leasehold exceeding one year?
    isLeasehold: isLeasehold,
  };

  const clearSignature = () => {
    if (sigPad) {
      sigPad.clear();
      setBuyerSignature('');
    }
  };

  const handleSignEnd = () => {
    if (sigPad) {
      const signatureData = sigPad.toDataURL();
      setBuyerSignature(signatureData);
    }
  };

  const handleSave = async () => {
    if (!buyerSignature) {
      toast({
        title: "Signature Required",
        description: "Please sign the form before saving",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      // Submit the form data to generate the PDF
      const response = await apiRequest(
        'POST', 
        `/api/properties/${property.id}/generate-agency-disclosure`, 
        {
          ...formData,
          viewingRequestId
        }
      );
      
      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || "Failed to generate and save the agency disclosure form");
      }
      
      toast({
        title: "Form Submitted",
        description: "Agency Disclosure Form has been successfully generated and saved.",
      });
      
      // Invalidate queries to refresh data
      if (viewingRequestId) {
        queryClient.invalidateQueries({ queryKey: ['/api/viewing-requests/agent'] });
      }
      queryClient.invalidateQueries({ queryKey: [`/api/properties/${property.id}`] });
      
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
      // Create a temporary form with the data
      const response = await apiRequest(
        'POST', 
        `/api/properties/${property.id}/preview-agency-disclosure`, 
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
      
      // Create a link and trigger download
      const a = document.createElement('a');
      a.href = url;
      a.download = `Agency_Disclosure_${property.address.replace(/\s+/g, '_')}.pdf`;
      document.body.appendChild(a);
      a.click();
      
      // Clean up
      window.URL.revokeObjectURL(url);
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

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Agency Disclosure Form
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="grid grid-cols-1 gap-4">
            <div className="flex items-center space-x-2">
              <Checkbox 
                id="isLeasehold" 
                checked={isLeasehold} 
                onCheckedChange={(checked) => {
                  setIsLeasehold(!!checked);
                }}
              />
              <Label htmlFor="isLeasehold" className="cursor-pointer">
                This is for a leasehold interest exceeding one year
              </Label>
            </div>
            
            <div>
              <Label htmlFor="buyerName">Your Full Name</Label>
              <Input
                id="buyerName"
                value={formData.buyerName1}
                readOnly
                className="bg-gray-50"
              />
            </div>

            <div>
              <Label htmlFor="propertyAddress">Property Address</Label>
              <Input
                id="propertyAddress"
                value={formData.propertyAddress}
                readOnly
                className="bg-gray-50"
              />
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label htmlFor="propertyCity">City</Label>
                <Input
                  id="propertyCity"
                  value={formData.propertyCity}
                  readOnly
                  className="bg-gray-50"
                />
              </div>
              <div>
                <Label htmlFor="propertyState">State</Label>
                <Input
                  id="propertyState"
                  value={formData.propertyState}
                  readOnly
                  className="bg-gray-50"
                />
              </div>
              <div>
                <Label htmlFor="propertyZip">ZIP</Label>
                <Input
                  id="propertyZip"
                  value={formData.propertyZip}
                  readOnly
                  className="bg-gray-50"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="agentInfo">Real Estate Agent</Label>
              <Input
                id="agentInfo"
                value={`${formData.agentName} - License #${formData.agentLicenseNumber}`}
                readOnly
                className="bg-gray-50"
              />
            </div>

            <div>
              <Label htmlFor="brokerage">Brokerage</Label>
              <Input
                id="brokerage"
                value={formData.agentBrokerageName}
                readOnly
                className="bg-gray-50"
              />
            </div>

            <div>
              <Label htmlFor="signatureDate">Date</Label>
              <Input
                id="signatureDate"
                type="date"
                value={buyerSignatureDate}
                onChange={(e) => setBuyerSignatureDate(e.target.value)}
              />
            </div>

            <div className="pt-4">
              <Label>Your Signature</Label>
              <div className="relative border border-gray-300 rounded-md mt-1">
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
            </div>

            <div className="pt-4">
              <p className="text-sm text-gray-600">
                By signing, you acknowledge that you have received and read the California Agency Disclosure Form, 
                which explains the different types of agency relationships in real estate transactions.
              </p>
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