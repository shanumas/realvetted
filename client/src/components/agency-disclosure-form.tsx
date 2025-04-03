import React, { useRef, useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Property, User } from '@shared/schema';
import { AlertDialog, AlertDialogAction, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { websocketClient } from '@/lib/websocketClient';

interface SignatureCanvasProps {
  onChange: (dataUrl: string) => void;
  label: string;
}

function SignatureCanvas({ onChange, label }: SignatureCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'black';
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
  }, []);

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (ctx) {
      const rect = canvas.getBoundingClientRect();
      ctx.beginPath();
      ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
      setIsDrawing(true);
      setHasDrawn(true);
    }
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (ctx) {
      const rect = canvas.getBoundingClientRect();
      ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
      ctx.stroke();
    }
  };

  const stopDrawing = () => {
    if (isDrawing) {
      setIsDrawing(false);
      
      const canvas = canvasRef.current;
      if (canvas) {
        // Convert canvas to data URL and call onChange
        const dataUrl = canvas.toDataURL('image/png');
        onChange(dataUrl);
      }
    }
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      setHasDrawn(false);
      onChange('');
    }
  };

  return (
    <div className="mb-4">
      <Label className="block mb-2">{label}</Label>
      <div className="border border-gray-300 bg-white">
        <canvas
          ref={canvasRef}
          width={300}
          height={100}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          className="cursor-crosshair"
        />
      </div>
      <Button 
        type="button" 
        variant="outline" 
        size="sm" 
        onClick={clearCanvas}
        className="mt-1"
      >
        Clear Signature
      </Button>
    </div>
  );
}

interface AgencyDisclosureFormProps {
  property: Property;
  agent: User;
  isOpen: boolean;
  onClose: () => void;
}

export function AgencyDisclosureForm({ 
  property, 
  agent, 
  isOpen, 
  onClose
}: AgencyDisclosureFormProps) {
  const [buyerSignature, setBuyerSignature] = useState('');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [pdfUrl, setPdfUrl] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!buyerSignature) {
      setError('Please sign the form to continue');
      return;
    }
    
    setLoading(true);
    setProgress(20);
    
    try {
      const response = await fetch(`/api/properties/${property.id}/agency-disclosure`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          buyerSignature: buyerSignature,
        }),
      });
      
      setProgress(60);
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to submit form');
      }
      
      const data = await response.json();
      setProgress(90);
      
      // Set the PDF URL for downloading
      if (data.data && data.data.fileUrl) {
        setPdfUrl(data.data.fileUrl);
      }
      
      // Set success state
      setProgress(100);
      setSuccess(true);
      
    } catch (err) {
      console.error('Error submitting agency disclosure form:', err);
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading) {
      setBuyerSignature('');
      setError('');
      setPdfUrl('');
      setSuccess(false);
      onClose();
    }
  };

  const handleSuccessClose = () => {
    setSuccess(false);
    handleClose();
  };

  return (
    <>
      <Dialog open={isOpen && !success} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>California Real Estate Agency Disclosure Form</DialogTitle>
          </DialogHeader>
          
          <div className="mb-4 text-sm">
            <p className="font-medium mb-2">Property Address: {property.address}</p>
            <p className="text-muted-foreground">
              {property.city}, {property.state} {property.zip}
            </p>
            
            <Separator className="my-4" />
            
            <div className="mb-4">
              <h3 className="font-semibold mb-2">DISCLOSURE REGARDING REAL ESTATE AGENCY RELATIONSHIP</h3>
              <p className="text-xs mb-2">As required by the Civil Code</p>
              
              <p className="mb-2">
                When you enter into a discussion with a real estate agent regarding a real estate transaction, you should from the outset understand what type of agency relationship or representation you wish to have with the agent in the transaction.
              </p>
              
              <h4 className="font-medium mt-4 mb-2">SELLER'S AGENT</h4>
              <p className="mb-2">
                A Seller's agent under a listing agreement with the Seller acts as the agent for the Seller only. A Seller's agent or a subagent of that agent has the following affirmative obligations:
              </p>
              <p className="mb-2">
                <strong>To the Seller:</strong> A fiduciary duty of utmost care, integrity, honesty, and loyalty in dealings with the Seller.
              </p>
              <p className="mb-2">
                <strong>To the Buyer and the Seller:</strong>
              </p>
              <ol className="list-decimal ml-6 mb-4">
                <li className="mb-1">Diligent exercise of reasonable skill and care in performance of the agent's duties.</li>
                <li className="mb-1">A duty of honest and fair dealing and good faith.</li>
                <li className="mb-1">A duty to disclose all facts known to the agent materially affecting the value or desirability of the property that are not known to, or within the diligent attention and observation of, the parties.</li>
              </ol>
              
              <h4 className="font-medium mt-4 mb-2">BUYER'S AGENT</h4>
              <p className="mb-2">
                A selling agent can, with a Buyer's consent, agree to act as agent for the Buyer only. In these situations, the agent is not the Seller's agent, even if by agreement the agent may receive compensation for services rendered, either in full or in part from the Seller. An agent acting only for a Buyer has the following affirmative obligations:
              </p>
              <p className="mb-2">
                <strong>To the Buyer:</strong> A fiduciary duty of utmost care, integrity, honesty, and loyalty in dealings with the Buyer.
              </p>
              <p className="mb-2">
                <strong>To the Buyer and the Seller:</strong>
              </p>
              <ol className="list-decimal ml-6 mb-4">
                <li className="mb-1">Diligent exercise of reasonable skill and care in performance of the agent's duties.</li>
                <li className="mb-1">A duty of honest and fair dealing and good faith.</li>
                <li className="mb-1">A duty to disclose all facts known to the agent materially affecting the value or desirability of the property that are not known to, or within the diligent attention and observation of, the parties.</li>
              </ol>
              
              <h4 className="font-medium mt-4 mb-2">AGENT REPRESENTING BOTH SELLER AND BUYER</h4>
              <p className="mb-2">
                A real estate agent, either acting directly or through one or more associate licensees, can legally be the agent of both the Seller and the Buyer in a transaction, but only with the knowledge and consent of both the Seller and the Buyer.
              </p>
              <p className="mb-2">
                In a dual agency situation, the agent has the following affirmative obligations to both the Seller and the Buyer:
              </p>
              <ol className="list-decimal ml-6 mb-4">
                <li className="mb-1">A fiduciary duty of utmost care, integrity, honesty and loyalty in the dealings with either the Seller or the Buyer.</li>
                <li className="mb-1">Other duties to the Seller and the Buyer as stated above in their respective sections.</li>
              </ol>
            </div>
            
            <Separator className="my-4" />
            
            <div className="mb-4 space-y-4">
              <div>
                <h3 className="font-semibold mb-2">CONFIRMATION OF AGENCY RELATIONSHIP</h3>
                <p>By signing below, you acknowledge receipt of this disclosure form:</p>
              </div>
              
              <div>
                <p className="font-medium">Agent: {agent.firstName} {agent.lastName}</p>
                <p className="text-sm">License Number: {"2244751"}</p>
                <p className="text-sm">Representing: Buyer</p>
              </div>
              
              {error && (
                <div className="bg-red-50 border border-red-200 p-3 rounded text-red-600 text-sm">
                  {error}
                </div>
              )}
              
              <form onSubmit={handleSubmit}>
                <SignatureCanvas 
                  onChange={setBuyerSignature} 
                  label="Buyer Signature" 
                />
                
                {loading && (
                  <div className="mb-4">
                    <Label className="block mb-2">Processing your form</Label>
                    <Progress value={progress} className="h-2 mb-2" />
                    <p className="text-xs text-muted-foreground">Please wait while we process your signature</p>
                  </div>
                )}
                
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={handleClose} disabled={loading}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={loading || !buyerSignature}>
                    {loading ? 'Processing...' : 'Sign & Submit'}
                  </Button>
                </DialogFooter>
              </form>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      
      <AlertDialog open={success}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Form Submitted Successfully</AlertDialogTitle>
            <AlertDialogDescription>
              Your signed disclosure form has been submitted successfully. The agent and seller will be notified.
              {pdfUrl && (
                <div className="mt-4">
                  <a 
                    href={pdfUrl} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline font-medium"
                  >
                    View or Download Signed Form
                  </a>
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={handleSuccessClose}>Close</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}