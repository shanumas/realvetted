import React, { useState, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Loader2, Check, FileText } from "lucide-react";
import SignatureCanvas from 'react-signature-canvas';

interface AgencyDisclosureFormProps {
  propertyId: number;
  propertyAddress: string;
  propertyCity: string;
  propertyState: string;
  propertyZip: string;
  buyerName: string;
  agentName: string;
  onComplete: () => void;
  onCancel: () => void;
}

export function AgencyDisclosureForm({
  propertyId,
  propertyAddress,
  propertyCity,
  propertyState,
  propertyZip,
  buyerName,
  agentName,
  onComplete,
  onCancel
}: AgencyDisclosureFormProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [disclosureAccepted, setDisclosureAccepted] = useState(false);
  const [showSignature, setShowSignature] = useState(false);
  const [signatureSaved, setSignatureSaved] = useState(false);
  
  const signatureRef = useRef<SignatureCanvas>(null);
  const { toast } = useToast();
  
  const clearSignature = () => {
    if (signatureRef.current) {
      signatureRef.current.clear();
      setSignatureSaved(false);
    }
  };
  
  const saveSignature = async () => {
    if (signatureRef.current?.isEmpty()) {
      toast({
        title: "Signature required",
        description: "Please sign the form before submitting.",
        variant: "destructive",
      });
      return;
    }
    
    setIsLoading(true);
    
    try {
      const signatureDataUrl = signatureRef.current?.toDataURL('image/png');
      
      const res = await apiRequest("POST", `/api/properties/${propertyId}/agreements`, {
        type: "agency_disclosure",
        signatureData: signatureDataUrl,
        details: {
          propertyAddress,
          propertyCity,
          propertyState,
          propertyZip,
          buyerName,
          agentName,
        }
      });
      
      const data = await res.json();
      
      if (!data.success) {
        throw new Error(data.error || "Failed to save signature");
      }
      
      setSignatureSaved(true);
      
      toast({
        title: "Disclosure form signed",
        description: "Your signature has been saved.",
        variant: "default",
      });
      
      queryClient.invalidateQueries({ queryKey: ['/api/agreements'] });
      
      // Trigger the onComplete callback which will submit the viewing request
      onComplete();
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };
  
  return (
    <div className="space-y-4">
      {!showSignature ? (
        <>
          <div className="max-h-[400px] overflow-y-auto border rounded-md p-4 bg-gray-50">
            <h3 className="font-bold text-lg text-center mb-4">DISCLOSURE REGARDING REAL ESTATE AGENCY RELATIONSHIPS</h3>
            <p className="text-sm mb-4">
              As required by the California Civil Code, before you enter into a contract regarding a property transaction,
              you must read and acknowledge receipt of this disclosure.
            </p>
            
            <h4 className="font-bold text-md mb-2">SELLER'S AGENT</h4>
            <p className="text-sm mb-4">
              A Seller's agent under a listing agreement with the Seller acts as the agent for the Seller only. A Seller's agent or a subagent of that agent has the following affirmative obligations:
            </p>
            <p className="text-sm mb-4 pl-4">
              <strong>To the Seller:</strong><br />
              • A fiduciary duty of utmost care, integrity, honesty, and loyalty in dealings with the Seller.<br />
              <strong>To the Buyer and the Seller:</strong><br />
              • Diligent exercise of reasonable skill and care in performance of the agent's duties.<br />
              • A duty of honest and fair dealing and good faith.<br />
              • A duty to disclose all facts known to the agent materially affecting the value or desirability of the property that are not known to, or within the diligent attention and observation of, the parties.
            </p>
            
            <h4 className="font-bold text-md mb-2">BUYER'S AGENT</h4>
            <p className="text-sm mb-4">
              A selling agent can, with a Buyer's consent, agree to act as agent for the Buyer only. In these situations, the agent is not the Seller's agent, even if by agreement the agent may receive compensation for services rendered, either in full or in part from the Seller. An agent acting only for a Buyer has the following affirmative obligations:
            </p>
            <p className="text-sm mb-4 pl-4">
              <strong>To the Buyer:</strong><br />
              • A fiduciary duty of utmost care, integrity, honesty, and loyalty in dealings with the Buyer.<br />
              <strong>To the Buyer and the Seller:</strong><br />
              • Diligent exercise of reasonable skill and care in performance of the agent's duties.<br />
              • A duty of honest and fair dealing and good faith.<br />
              • A duty to disclose all facts known to the agent materially affecting the value or desirability of the property that are not known to, or within the diligent attention and observation of, the parties.
            </p>
            
            <h4 className="font-bold text-md mb-2">AGENT REPRESENTING BOTH SELLER AND BUYER</h4>
            <p className="text-sm mb-4">
              A real estate agent, either acting directly or through one or more associate licensees, can legally be the agent of both the Seller and the Buyer in a transaction, but only with the knowledge and consent of both the Seller and the Buyer. In a dual agency situation, the agent has the following affirmative obligations to both the Seller and the Buyer:
            </p>
            <p className="text-sm mb-4 pl-4">
              • A fiduciary duty of utmost care, integrity, honesty and loyalty in the dealings with either the Seller or the Buyer.<br />
              • Other duties to the Seller and the Buyer as stated above in their respective sections.
            </p>
            <p className="text-sm mb-4">
              In representing both Seller and Buyer, the agent may not, without the express permission of the respective party, disclose to the other party that the Seller will accept a price less than the listing price or that the Buyer will pay a price greater than the price offered.
            </p>
            
            <p className="text-sm mb-4">
              The above duties of the agent in a real estate transaction do not relieve a Seller or Buyer from the responsibility to protect his or her own interests. You should carefully read all agreements to assure that they adequately express your understanding of the transaction. A real estate agent is a person qualified to advise about real estate. If legal or tax advice is desired, consult a competent professional.
            </p>
            
            <p className="text-sm mb-4">
              Throughout your real property transaction you may receive more than one disclosure form, depending upon the number of agents assisting in the transaction. The law requires each agent with whom you have more than a casual relationship to present you with this disclosure form. You should read its contents each time it is presented to you, considering the relationship between you and the real estate agent in your specific transaction.
            </p>
            
            <p className="text-sm mb-4">
              This disclosure form includes the provisions of Sections 2079.13 to 2079.24, inclusive, of the Civil Code set forth on the reverse hereof. Read it carefully.
            </p>
            
            <div className="border-t border-gray-300 pt-4 mb-4">
              <p className="text-sm font-bold">
                Property Address: {propertyAddress}, {propertyCity}, {propertyState} {propertyZip}
              </p>
            </div>
          </div>
          
          <div className="flex items-center space-x-2">
            <input 
              type="checkbox" 
              id="accept-disclosure" 
              checked={disclosureAccepted}
              onChange={() => setDisclosureAccepted(!disclosureAccepted)}
              className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
            />
            <label htmlFor="accept-disclosure" className="text-sm text-gray-700">
              I acknowledge receipt of a copy of this disclosure form.
            </label>
          </div>
          
          <div className="flex justify-end space-x-2">
            <Button variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button 
              onClick={() => setShowSignature(true)} 
              disabled={!disclosureAccepted}
            >
              Continue to Sign
            </Button>
          </div>
        </>
      ) : (
        <>
          <div className="text-center mb-4">
            <h3 className="font-medium text-lg">Sign Below</h3>
            <p className="text-sm text-gray-500">
              Use your mouse or touch screen to sign your name in the box below.
            </p>
          </div>
          
          <div className="border border-gray-300 rounded-md p-1 bg-white">
            <SignatureCanvas
              ref={signatureRef}
              penColor="black"
              canvasProps={{
                className: "signature-canvas w-full h-32 cursor-crosshair",
                style: { border: '1px solid #e5e7eb', borderRadius: '0.25rem' }
              }}
            />
          </div>
          
          <div className="flex justify-between">
            <Button 
              variant="outline" 
              onClick={clearSignature}
              type="button"
            >
              Clear
            </Button>
            
            <div className="flex space-x-2">
              <Button 
                variant="outline" 
                onClick={() => setShowSignature(false)}
                type="button"
              >
                Back
              </Button>
              
              <Button 
                onClick={saveSignature}
                disabled={isLoading || signatureSaved}
                type="button"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Submitting...
                  </>
                ) : signatureSaved ? (
                  <>
                    <Check className="mr-2 h-4 w-4" />
                    Signed
                  </>
                ) : (
                  <>
                    <FileText className="mr-2 h-4 w-4" />
                    Sign & Submit
                  </>
                )}
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}