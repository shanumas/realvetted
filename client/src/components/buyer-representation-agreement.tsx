import { useState, useRef, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Save, FileText, Send, FileDown, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { Property, User, Agreement } from "@shared/schema";
import websocketClient from "@/lib/websocket";
import { apiRequest } from "@/lib/queryClient";
import { useQuery, useQueryClient } from "@tanstack/react-query";

interface SignatureCanvasProps {
  onChange: (dataUrl: string) => void;
  label: string;
}

function SignatureCanvas({ onChange, label }: SignatureCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [ctx, setCtx] = useState<CanvasRenderingContext2D | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const context = canvas.getContext('2d');
    if (context) {
      context.lineWidth = 2;
      context.strokeStyle = 'black';
      setCtx(context);
    }
  }, []);

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!ctx) return;
    
    setIsDrawing(true);
    ctx.beginPath();
    
    // Get position
    let posX, posY;
    if ('touches' in e) {
      // Touch event
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      posX = e.touches[0].clientX - rect.left;
      posY = e.touches[0].clientY - rect.top;
    } else {
      // Mouse event
      posX = e.nativeEvent.offsetX;
      posY = e.nativeEvent.offsetY;
    }
    
    ctx.moveTo(posX, posY);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !ctx || !canvasRef.current) return;
    
    // Get position
    let posX, posY;
    if ('touches' in e) {
      // Touch event
      const rect = canvasRef.current.getBoundingClientRect();
      posX = e.touches[0].clientX - rect.left;
      posY = e.touches[0].clientY - rect.top;
    } else {
      // Mouse event
      posX = e.nativeEvent.offsetX;
      posY = e.nativeEvent.offsetY;
    }
    
    ctx.lineTo(posX, posY);
    ctx.stroke();
  };

  const endDrawing = () => {
    if (!isDrawing || !canvasRef.current) return;
    
    setIsDrawing(false);
    // Convert canvas to data URL and send to parent
    const dataUrl = canvasRef.current.toDataURL('image/png');
    onChange(dataUrl);
  };

  const clearCanvas = () => {
    if (!ctx || !canvasRef.current) return;
    ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    onChange('');
  };

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="relative border rounded-md p-1 bg-white">
        <canvas
          ref={canvasRef}
          width={400}
          height={150}
          className="border border-gray-300 rounded-md cursor-crosshair touch-none"
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={endDrawing}
          onMouseLeave={endDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={endDrawing}
        />
        <Button 
          type="button" 
          variant="outline" 
          size="sm" 
          className="absolute top-3 right-3"
          onClick={clearCanvas}
        >
          Clear
        </Button>
      </div>
    </div>
  );
}

interface BuyerRepresentationAgreementProps {
  property: Property;
  agent: User;
  isOpen: boolean;
  onClose: () => void;
  draftId?: number; // Optional ID of existing draft agreement to edit
  autoGenerate?: boolean; // Whether to automatically generate an agreement (used for viewing requests)
  viewingRequestId?: number; // ID of the viewing request (if this agreement is for a viewing request)
}

export function BuyerRepresentationAgreement({ 
  property, 
  agent, 
  isOpen, 
  onClose,
  draftId,
  autoGenerate = false,
  viewingRequestId
}: BuyerRepresentationAgreementProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [agentSignature, setAgentSignature] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingDraft, setLoadingDraft] = useState(false);
  const [autoGenerating, setAutoGenerating] = useState(false);
  const [step, setStep] = useState<'edit' | 'preview' | 'signed'>('edit');
  const [agreement, setAgreement] = useState({
    date: new Date().toISOString().split('T')[0],
    buyerName: user?.firstName && user?.lastName ? `${user?.firstName} ${user?.lastName}` : user?.email || '',
    buyerAddress: user?.addressLine1 ? 
      `${user?.addressLine1}${user?.addressLine2 ? `, ${user?.addressLine2}` : ''}, ${user?.city || ''}, ${user?.state || ''} ${user?.zip || ''}` : 
      '',
    agentName: `${agent.firstName || ''} ${agent.lastName || ''}`.trim() || agent.email,
    agentLicense: '',
    agentBrokerage: '',
    propertyAddress: property.address,
    propertyCity: property.city || '',
    propertyState: property.state || '',
    propertyZip: property.zip || '',
    term: '90',
    startDate: new Date().toISOString().split('T')[0],
    endDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    commission: '3',
    additionalTerms: '',
  });
  
  // Fetch existing agreements for this property
  const { data: existingAgreements, isLoading: loadingAgreements } = useQuery<Agreement[]>({
    queryKey: [`/api/properties/${property.id}/agreements`],
    enabled: isOpen,
  });
  
  const existingDraft = draftId && existingAgreements 
    ? existingAgreements.find(a => a.id === draftId) 
    : existingAgreements?.find(a => a.status === "draft");
  
  // Auto-generate a draft agreement if none exists
  const autoGenerateDraft = async () => {
    if (existingDraft || autoGenerating) return;
    
    setAutoGenerating(true);
    try {
      // Include the viewing request ID if available
      const requestData = viewingRequestId ? { viewingRequestId } : {};
      
      const response = await apiRequest(
        'POST', 
        `/api/properties/${property.id}/generate-agreement-draft`, 
        requestData
      );
      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || "Failed to generate agreement draft");
      }
      
      // Refresh agreements list
      queryClient.invalidateQueries({ queryKey: [`/api/properties/${property.id}/agreements`] });
      
      toast({
        title: "Draft Generated",
        description: "A draft agreement has been automatically generated for you to review and edit.",
      });
    } catch (error) {
      console.error("Error generating draft agreement:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to generate agreement draft.",
        variant: "destructive",
      });
    } finally {
      setAutoGenerating(false);
    }
  };
  
  // Load an existing draft agreement
  const loadDraftAgreement = async () => {
    if (!existingDraft || loadingDraft) return;
    
    setLoadingDraft(true);
    try {
      // Parse the agreement text to extract fields
      const agreementText = existingDraft.agreementText || "";
      
      // Extract key details using regex patterns
      const dateMatch = agreementText.match(/entered into on (\d{4}-\d{2}-\d{2})/);
      const buyerNameMatch = agreementText.match(/BUYER: ([^\n]+)/);
      const buyerAddressMatch = agreementText.match(/Address: ([^\n]+)/);
      const agentNameMatch = agreementText.match(/BROKER\/AGENT: ([^\n]+)/);
      const agentLicenseMatch = agreementText.match(/License #: ([^\n]*)/);
      const agentBrokerageMatch = agreementText.match(/Brokerage: ([^\n]*)/);
      const propertyAddressMatch = agreementText.match(/Property Address: ([^\n]+)/);
      const propertyCityMatch = agreementText.match(/City: ([^\n]+)/);
      const propertyStateMatch = agreementText.match(/State: ([^\n]+)/);
      const propertyZipMatch = agreementText.match(/Zip: ([^\n]+)/);
      const termMatch = agreementText.match(/shall expire at 11:59 PM on .* \((\d+) days\)/);
      const startDateMatch = agreementText.match(/shall commence on (\d{4}-\d{2}-\d{2})/);
      const endDateMatch = agreementText.match(/shall expire at 11:59 PM on (\d{4}-\d{2}-\d{2})/);
      const commissionMatch = agreementText.match(/commission of (\d+(?:\.\d+)?)%/);
      
      // Extract additional terms section
      const additionalTermsMatch = agreementText.match(/6\. ADDITIONAL TERMS:\s*([^\n]+(?:\n[^\n]+)*?)(?:\n\s*7\. SIGNATURES:|$)/s);
      
      // Update agreement state with extracted values
      setAgreement(prev => ({
        ...prev,
        date: dateMatch?.[1] || prev.date,
        buyerName: buyerNameMatch?.[1]?.trim() || prev.buyerName,
        buyerAddress: buyerAddressMatch?.[1]?.trim() || prev.buyerAddress,
        agentName: agentNameMatch?.[1]?.trim() || prev.agentName,
        agentLicense: agentLicenseMatch?.[1]?.trim() || prev.agentLicense,
        agentBrokerage: agentBrokerageMatch?.[1]?.trim() || prev.agentBrokerage,
        propertyAddress: propertyAddressMatch?.[1]?.trim() || prev.propertyAddress,
        propertyCity: propertyCityMatch?.[1]?.trim() || prev.propertyCity,
        propertyState: propertyStateMatch?.[1]?.trim() || prev.propertyState,
        propertyZip: propertyZipMatch?.[1]?.trim() || prev.propertyZip,
        term: termMatch?.[1] || prev.term,
        startDate: startDateMatch?.[1] || prev.startDate,
        endDate: endDateMatch?.[1] || prev.endDate,
        commission: commissionMatch?.[1] || prev.commission,
        additionalTerms: additionalTermsMatch ? additionalTermsMatch[1].trim() : prev.additionalTerms,
      }));
    } catch (error) {
      console.error("Error parsing draft agreement:", error);
      toast({
        title: "Warning",
        description: "Could not parse all fields from the draft agreement. Some fields may need to be filled manually.",
        variant: "destructive",
      });
    } finally {
      setLoadingDraft(false);
    }
  };
  
  // Check for existing agreements and load draft when component mounts
  useEffect(() => {
    if (isOpen && !loadingAgreements) {
      if (existingDraft) {
        loadDraftAgreement();
      } else if (autoGenerate || viewingRequestId) {
        // If automatically generating for a viewing request
        autoGenerateDraft();
      }
    }
  }, [isOpen, loadingAgreements, existingDraft, autoGenerate, viewingRequestId]);

  // Generate a preview of the document
  const generateAgreementText = () => {
    return `
BUYER REPRESENTATION AGREEMENT

This Buyer Representation Agreement ("Agreement") is entered into on ${agreement.date} between:

BUYER: ${agreement.buyerName}
Address: ${agreement.buyerAddress}

And

BROKER/AGENT: ${agreement.agentName}
License #: ${agreement.agentLicense}
Brokerage: ${agreement.agentBrokerage}

1. APPOINTMENT OF BROKER/AGENT:
Buyer appoints Agent as Buyer's exclusive real estate agent for the purpose of finding and acquiring real property as follows:
Property Address: ${agreement.propertyAddress}
City: ${agreement.propertyCity}
State: ${agreement.propertyState}
Zip: ${agreement.propertyZip}

2. TERM:
This Agreement shall commence on ${agreement.startDate} and shall expire at 11:59 PM on ${agreement.endDate} (${agreement.term} days).

3. BROKER/AGENT'S OBLIGATIONS:
a) To use professional knowledge and skills to find the property described above.
b) To present all offers and counteroffers in a timely manner.
c) To disclose all known material facts about the property.
d) To maintain the confidentiality of Buyer's personal and financial information.
e) To represent Buyer's interests diligently and in good faith.

4. BUYER'S OBLIGATIONS:
a) To work exclusively with Agent during the term of this Agreement.
b) To promptly review all property information provided by Agent.
c) To be available to examine properties, and to communicate with Agent regarding property searches.
d) To provide accurate personal and financial information as needed for property acquisition.
e) To inform other agents that Buyer is represented exclusively by Agent.

5. COMPENSATION:
If Buyer acquires any property during the term of this Agreement, Buyer agrees that Agent shall receive a commission of ${agreement.commission}% of the purchase price, which is typically paid by the seller. If the seller does not pay the full commission, Buyer will be responsible for paying Agent the difference.

6. ADDITIONAL TERMS:
${agreement.additionalTerms}

7. SIGNATURES:
By signing below, the parties agree to the terms of this Agreement.

Buyer: ________________________
Date: ${agreement.date}

Agent: ________________________
Date: ${agreement.date}
    `;
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setAgreement(prev => ({ ...prev, [name]: value }));
  };

  const handleSave = async () => {
    if (!agentSignature) {
      toast({
        title: "Signature Required",
        description: "Please sign the agreement before saving",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      // Create or update agreement
      const agreementText = generateAgreementText();
      
      if (existingDraft) {
        // Update the existing draft with the agent's signature and content changes
        const updateData = {
          agreementText: agreementText,
          agentSignature: agentSignature,
          status: "pending_buyer" // Update from draft to pending buyer signature
        };
        
        // Update the agreement
        const response = await apiRequest('PATCH', `/api/agreements/${existingDraft.id}`, updateData);
        const result = await response.json();
        
        if (!result.success) {
          throw new Error(result.error || "Failed to update agreement");
        }
        
        const savedAgreement = result.data;
        
        // Refresh agreements list
        queryClient.invalidateQueries({ queryKey: [`/api/properties/${property.id}/agreements`] });
        
        // Send the agreement to the buyer through chat
        if (property.createdBy && websocketClient.isConnected()) {
          websocketClient.sendChatMessage({
            propertyId: property.id,
            senderId: agent.id,
            senderName: agreement.agentName,
            receiverId: property.createdBy,
            content: `📝 I've signed the Buyer Representation Agreement for ${property.address}. Please review and sign it. [Agreement ID: ${savedAgreement.id}]`
          });
  
          toast({
            title: "Agreement Updated and Sent",
            description: "Buyer Representation Agreement has been updated and sent to the buyer",
          });
        }
      } else {
        // Create a new agreement with agent signature
        const agreementData = {
          buyerId: property.createdBy,
          agreementText: agreementText,
          agentSignature: agentSignature,
          // Include the viewing request ID if available
          ...(viewingRequestId ? { viewingRequestId } : {})
        };
  
        // Save to database
        const response = await apiRequest('POST', `/api/properties/${property.id}/agreements`, agreementData);
        const result = await response.json();
        
        if (!result.success) {
          throw new Error(result.error || "Failed to create agreement");
        }
        
        const savedAgreement = result.data;
  
        // Send the agreement to the buyer through chat
        if (property.createdBy && websocketClient.isConnected()) {
          websocketClient.sendChatMessage({
            propertyId: property.id,
            senderId: agent.id,
            senderName: agreement.agentName,
            receiverId: property.createdBy,
            content: `📝 I've created a Buyer Representation Agreement for ${property.address}. Please review and sign it. [Agreement ID: ${savedAgreement.id}]`
          });
  
          toast({
            title: "Agreement Sent",
            description: "Buyer Representation Agreement has been sent to the buyer",
          });
        }
      }

      setStep('signed');
    } catch (error) {
      console.error("Error saving agreement:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to save the agreement. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handlePreview = () => {
    setStep('preview');
  };

  const handleEdit = () => {
    setStep('edit');
  };

  const handleClose = () => {
    setStep('edit');
    setAgentSignature('');
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {step === 'edit' && "Create Buyer Representation Agreement"}
            {step === 'preview' && "Preview Agreement"}
            {step === 'signed' && "Agreement Signed"}
          </DialogTitle>
        </DialogHeader>

        {step === 'edit' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="date">Agreement Date</Label>
                <Input
                  id="date"
                  name="date"
                  type="date"
                  value={agreement.date}
                  onChange={handleInputChange}
                />
              </div>
              <div>
                <Label htmlFor="buyerName">Buyer Name</Label>
                <Input
                  id="buyerName"
                  name="buyerName"
                  value={agreement.buyerName}
                  onChange={handleInputChange}
                />
              </div>
              <div>
                <Label htmlFor="buyerAddress">Buyer Address</Label>
                <Input
                  id="buyerAddress"
                  name="buyerAddress"
                  value={agreement.buyerAddress}
                  onChange={handleInputChange}
                />
              </div>
              <div>
                <Label htmlFor="agentName">Agent Name</Label>
                <Input
                  id="agentName"
                  name="agentName"
                  value={agreement.agentName}
                  onChange={handleInputChange}
                  readOnly
                />
              </div>
              <div>
                <Label htmlFor="agentLicense">Agent License #</Label>
                <Input
                  id="agentLicense"
                  name="agentLicense"
                  value={agreement.agentLicense}
                  onChange={handleInputChange}
                />
              </div>
              <div>
                <Label htmlFor="agentBrokerage">Agent Brokerage</Label>
                <Input
                  id="agentBrokerage"
                  name="agentBrokerage"
                  value={agreement.agentBrokerage}
                  onChange={handleInputChange}
                />
              </div>
              <div>
                <Label htmlFor="propertyAddress">Property Address</Label>
                <Input
                  id="propertyAddress"
                  name="propertyAddress"
                  value={agreement.propertyAddress}
                  onChange={handleInputChange}
                  readOnly
                />
              </div>
              <div>
                <Label htmlFor="propertyCity">Property City</Label>
                <Input
                  id="propertyCity"
                  name="propertyCity"
                  value={agreement.propertyCity}
                  onChange={handleInputChange}
                />
              </div>
              <div>
                <Label htmlFor="propertyState">Property State</Label>
                <Input
                  id="propertyState"
                  name="propertyState"
                  value={agreement.propertyState}
                  onChange={handleInputChange}
                />
              </div>
              <div>
                <Label htmlFor="propertyZip">Property Zip</Label>
                <Input
                  id="propertyZip"
                  name="propertyZip"
                  value={agreement.propertyZip}
                  onChange={handleInputChange}
                />
              </div>
              <div>
                <Label htmlFor="term">Agreement Term (days)</Label>
                <Input
                  id="term"
                  name="term"
                  type="number"
                  value={agreement.term}
                  onChange={handleInputChange}
                />
              </div>
              <div>
                <Label htmlFor="commission">Commission (%)</Label>
                <Input
                  id="commission"
                  name="commission"
                  type="number"
                  step="0.1"
                  value={agreement.commission}
                  onChange={handleInputChange}
                />
              </div>
              <div>
                <Label htmlFor="startDate">Start Date</Label>
                <Input
                  id="startDate"
                  name="startDate"
                  type="date"
                  value={agreement.startDate}
                  onChange={handleInputChange}
                />
              </div>
              <div>
                <Label htmlFor="endDate">End Date</Label>
                <Input
                  id="endDate"
                  name="endDate"
                  type="date"
                  value={agreement.endDate}
                  onChange={handleInputChange}
                />
              </div>
            </div>
            
            <div>
              <Label htmlFor="additionalTerms">Additional Terms</Label>
              <Textarea
                id="additionalTerms"
                name="additionalTerms"
                value={agreement.additionalTerms}
                onChange={handleInputChange}
                rows={4}
              />
            </div>

            <SignatureCanvas 
              onChange={setAgentSignature} 
              label="Agent Signature"
            />

            <div className="flex justify-end space-x-2 pt-4">
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button variant="outline" onClick={handlePreview}>
                <FileText className="mr-2 h-4 w-4" />
                Preview
              </Button>
              <Button 
                onClick={handleSave}
                disabled={loading || !agentSignature}
              >
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Save & Send
              </Button>
            </div>
          </div>
        )}

        {step === 'preview' && (
          <div className="space-y-4">
            <pre className="whitespace-pre-wrap font-mono text-sm p-4 border rounded-md bg-gray-50 max-h-[50vh] overflow-y-auto">
              {generateAgreementText()}
            </pre>
            
            <div className="border-t pt-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium mb-2">Agent Signature:</p>
                  {agentSignature ? (
                    <img 
                      src={agentSignature} 
                      alt="Agent signature" 
                      className="border rounded-md bg-white p-2 max-h-[100px]" 
                    />
                  ) : (
                    <div className="text-sm text-gray-500 border rounded-md bg-gray-50 p-4 flex items-center justify-center h-[100px]">
                      No signature yet
                    </div>
                  )}
                </div>
                <div>
                  <p className="text-sm font-medium mb-2">Buyer Signature:</p>
                  <div className="text-sm text-gray-500 border rounded-md bg-gray-50 p-4 flex items-center justify-center h-[100px]">
                    Pending buyer signature
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end space-x-2 pt-4">
              <Button variant="outline" onClick={handleEdit}>
                Back to Edit
              </Button>
              <Button 
                onClick={handleSave}
                disabled={loading || !agentSignature}
              >
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                Sign & Send
              </Button>
            </div>
          </div>
        )}

        {step === 'signed' && (
          <div className="space-y-4 text-center">
            <div className="py-8">
              <div className="mx-auto bg-green-100 rounded-full w-16 h-16 flex items-center justify-center mb-4">
                <Save className="h-8 w-8 text-green-600" />
              </div>
              <h3 className="text-lg font-semibold">Agreement Sent Successfully</h3>
              <p className="text-gray-500 mt-2">
                The Buyer Representation Agreement has been sent to the buyer through the chat.
                They will be able to review and sign it.
              </p>
            </div>
            
            <DialogFooter>
              <Button onClick={handleClose}>Close</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}