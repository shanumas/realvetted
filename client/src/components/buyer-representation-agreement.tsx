import React, { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/use-auth";
import { useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Loader2, FileText, Check, RefreshCw } from "lucide-react";
import SignatureCanvas from 'react-signature-canvas';

interface BuyerRepresentationAgreementProps {
  isOpen: boolean;
  onClose: () => void;
  agentId: number;
  isGlobal?: boolean;
  propertyId?: number;
}

export function BuyerRepresentationAgreement({ 
  isOpen, 
  onClose,
  agentId,
  isGlobal = true,
  propertyId
}: BuyerRepresentationAgreementProps) {
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
  const [agent, setAgent] = useState<any>(null);
  const [agreementText, setAgreementText] = useState<string>('');

  // Load agent details
  useEffect(() => {
    if (agentId) {
      apiRequest('GET', `/api/users/${agentId}`)
        .then(res => res.json())
        .then(data => {
          if (data.success) {
            setAgent(data.data);
          }
        })
        .catch(err => {
          console.error("Error fetching agent details:", err);
        });
    }
  }, [agentId]);

  // Generate agreement text when agent details are available
  useEffect(() => {
    if (agent) {
      const buyerName = user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() : 'Buyer';
      const buyerAddress = user?.addressLine1
        ? `${user.addressLine1}${user.addressLine2 ? `, ${user.addressLine2}` : ""}, ${user.city || ""}, ${user.state || ""} ${user.zip || ""}`
        : "";
      const agentName = `${agent.firstName || ''} ${agent.lastName || ''}`.trim();
      const startDate = new Date();
      const endDate = new Date();
      endDate.setDate(startDate.getDate() + 90); // 90 days from now

      // Generate agreement text
      const text = `
GLOBAL BUYER REPRESENTATION AGREEMENT

This Buyer Representation Agreement ("Agreement") is entered into on ${startDate.toISOString().split("T")[0]} between:

BUYER: ${buyerName}
Address: ${buyerAddress}

And

BROKER/AGENT: ${agentName}
License #: ${agent.licenseNumber || ''}
Brokerage: ${agent.brokerageName || ''}

1. APPOINTMENT OF BROKER/AGENT:
Buyer appoints Agent as Buyer's exclusive real estate agent for the purpose of finding and acquiring real property within the agent's service area. This is a GLOBAL agreement that applies to all properties the buyer views with this agent.

2. TERM:
This Agreement shall commence on ${startDate.toISOString().split("T")[0]} and shall expire at 11:59 PM on ${endDate.toISOString().split("T")[0]} (90 days).

3. BROKER/AGENT'S OBLIGATIONS:
a) To use professional knowledge and skills to find properties that meet Buyer's needs.
b) To present all offers and counteroffers in a timely manner.
c) To disclose all known material facts about the property.
d) To maintain the confidentiality of Buyer's personal and financial information.
e) To represent Buyer's interests diligently and in good faith.

4. BUYER'S OBLIGATIONS:
a) To work exclusively with Agent for the purchase of properties during the term of this Agreement.
b) To provide accurate personal and financial information as needed.
c) To view properties only by appointment made by Agent.
d) To promptly inform Agent of all properties of interest, including those discovered independently.
e) To negotiate the purchase of properties discovered during the term of this Agreement only through Agent.

5. COMPENSATION:
Compensation for Agent's services is typically paid by the seller. If not, Buyer and Agent agree to discuss and determine compensation at that time.

6. TERMINATION:
This Agreement may be terminated:
a) By mutual written agreement of both parties.
b) When the purpose of this Agreement has been fulfilled.
c) At the expiration of the term.

7. FAIR HOUSING:
Agent and Buyer will comply with all federal, state, and local fair housing laws and regulations.

8. DISPUTE RESOLUTION:
Any disputes arising from this Agreement will be resolved through mediation or arbitration.

9. PROFESSIONAL ADVICE:
Agent recommends that Buyer consult appropriate professionals for matters concerning legal, tax, property condition, environmental, and other specialized advice.

10. ENTIRE AGREEMENT:
This document contains the entire agreement between the parties and supersedes any prior agreements or understandings.

By signing below, Buyer acknowledges understanding and accepting the terms of this Agreement.
      `;
      
      setAgreementText(text);
    }
  }, [agent, user]);

  const clearSignature = () => {
    if (sigPad) {
      sigPad.clear();
      setSignature('');
    }
  };

  const handleSave = async () => {
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
      // Submit the form data to create a global BRBC agreement
      const formDataToSubmit = {
        agentId,
        signatureData: signature,
        details: {
          agreementText,
          signatureDate,
          buyerName: user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() : 'Buyer',
          agentName: agent ? `${agent.firstName || ''} ${agent.lastName || ''}`.trim() : 'Agent',
        }
      };
      
      const apiEndpoint = isGlobal 
        ? '/api/global-brbc'
        : `/api/properties/${propertyId}/agreements`;
      
      const response = await apiRequest('POST', apiEndpoint, formDataToSubmit);
      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || "Failed to create the BRBC agreement");
      }
      
      toast({
        title: "Agreement Submitted",
        description: "Buyer Representation Agreement has been successfully signed and saved.",
      });
      
      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ['/api/buyer/agreements'] });
      
      // Close the dialog
      onClose();
    } catch (error) {
      console.error("Error saving BRBC agreement:", error);
      toast({
        title: "Error",
        description: error.message || "An error occurred while saving the agreement",
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
          <Tabs defaultValue="agreement">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="agreement">Agreement Text</TabsTrigger>
              <TabsTrigger value="signature">Sign Agreement</TabsTrigger>
            </TabsList>
            
            <TabsContent value="agreement" className="mt-4">
              <div className="bg-white p-6 rounded-lg border border-gray-200 text-sm max-h-[60vh] overflow-auto">
                <pre className="whitespace-pre-wrap font-sans">{agreementText}</pre>
              </div>
            </TabsContent>
            
            <TabsContent value="signature" className="mt-4">
              <div className="space-y-4">
                <div className="border border-gray-300 rounded-md p-4">
                  <h4 className="text-sm font-medium mb-2">Your Signature</h4>
                  <div className="border border-gray-200 rounded">
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
                  <div className="flex justify-end mt-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={clearSignature}
                    >
                      Clear
                    </Button>
                  </div>
                </div>
                
                <div className="border border-gray-300 rounded-md p-4">
                  <h4 className="text-sm font-medium mb-2">Date: {signatureDate}</h4>
                  
                  {signature && (
                    <div className="mt-4 p-2 border border-green-100 bg-green-50 rounded flex items-center">
                      <Check className="h-5 w-5 text-green-500 mr-2" />
                      <span className="text-green-700 text-sm">Signature captured</span>
                    </div>
                  )}
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>
        
        <DialogFooter>
          <div className="flex space-x-2">
            <Button variant="outline" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button 
              onClick={handleSave} 
              disabled={!signature || loading}
              className="bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <FileText className="mr-2 h-4 w-4" />
                  Save Agreement
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}