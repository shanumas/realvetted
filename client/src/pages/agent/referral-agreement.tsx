import { useEffect, useState, useRef } from 'react';
import { useAuth } from '../../hooks/use-auth';
import SignatureCanvas from 'react-signature-canvas';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { Label } from '../../components/ui/label';
import { Input } from '../../components/ui/input';
import { useToast } from '../../hooks/use-toast';
import { useLocation } from 'wouter';
import { Spinner } from '../../components/ui/spinner';

interface Agreement {
  id: number;
  status: string;
  documentUrl: string;
  date: string;
}

export default function AgentReferralAgreement() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [agreement, setAgreement] = useState<Agreement | null>(null);
  
  // Form data
  const [agentName, setAgentName] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zip, setZip] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  
  // Signature pad reference
  const signatureRef = useRef<SignatureCanvas>(null);
  
  // Check if agreement already exists
  useEffect(() => {
    const checkAgreement = async () => {
      try {
        const response = await fetch('/api/agent/referral-agreement');
        const data = await response.json();
        
        if (data.success) {
          if (data.data) {
            // Agreement exists
            setAgreement(data.data);
          }
          
          // Set form data from user profile
          if (user) {
            setAgentName(`${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email);
            // Set the license number from the user profile if available
            if (user.licenseNumber) {
              setLicenseNumber(user.licenseNumber);
            } else {
              setLicenseNumber('');
            }
            setAddress(user.addressLine1 || '');
            setCity(user.city || '');
            setState(user.state || '');
            setZip(user.zip || '');
          }
          
          setLoading(false);
        } else {
          throw new Error(data.error || 'Failed to fetch agreement');
        }
      } catch (error) {
        console.error('Error checking referral agreement', error);
        toast({
          title: 'Error',
          description: 'Failed to check if you have an existing agreement. Please try again.',
          variant: 'destructive',
        });
        setLoading(false);
      }
    };
    
    checkAgreement();
  }, [user, toast]);
  
  // Submit the agreement
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!signatureRef.current) {
      toast({
        title: 'Signature Required',
        description: 'Please sign the agreement before submitting',
        variant: 'destructive',
      });
      return;
    }
    
    if (signatureRef.current.isEmpty()) {
      toast({
        title: 'Signature Required',
        description: 'Please sign the agreement before submitting',
        variant: 'destructive',
      });
      return;
    }
    
    setSaving(true);
    
    try {
      // Get signature as data URL
      const signatureData = signatureRef.current.toDataURL();
      
      const response = await fetch('/api/agent/referral-agreement', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          agentName,
          licenseNumber,
          address,
          city,
          state,
          zip,
          agentSignature: signatureData,
          date,
        }),
      });
      
      const data = await response.json();
      
      if (data.success) {
        setAgreement(data.data);
        toast({
          title: 'Agreement Signed',
          description: 'Your referral agreement has been signed and submitted successfully.',
        });
        
        // Redirect to dashboard
        setTimeout(() => {
          setLocation('/agent/dashboard');
        }, 2000);
      } else {
        throw new Error(data.error || 'Failed to submit agreement');
      }
    } catch (error) {
      console.error('Error submitting referral agreement', error);
      toast({
        title: 'Error',
        description: 'Failed to submit your agreement. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };
  
  // Clear signature
  const clearSignature = () => {
    if (signatureRef.current) {
      signatureRef.current.clear();
    }
  };
  
  if (loading) {
    return (
      <div className="container max-w-3xl mx-auto py-8 px-4">
        <div className="flex flex-col items-center justify-center min-h-[50vh]">
          <Spinner size="lg" className="text-primary" />
          <p className="mt-4 text-gray-600">Loading your agreement...</p>
        </div>
      </div>
    );
  }
  
  // If agreement already exists and is completed, show it
  if (agreement && agreement.status === 'completed') {
    return (
      <div className="container max-w-3xl mx-auto py-8 px-4">
        <Card className="p-6">
          <h1 className="text-2xl font-bold mb-6">Referral Agreement</h1>
          <p className="mb-4">
            You have already signed the Agent Referral Fee Agreement. You can view your agreement below.
          </p>
          <div className="mb-6">
            <a 
              href={agreement.documentUrl}
              target="_blank"
              rel="noreferrer"
              className="text-primary hover:underline"
            >
              View Signed Agreement
            </a>
          </div>
          <Button onClick={() => setLocation('/agent/dashboard')}>
            Go to Dashboard
          </Button>
        </Card>
      </div>
    );
  }
  
  // Otherwise show the form to sign
  return (
    <div className="container max-w-3xl mx-auto py-8 px-4">
      <Card className="p-6">
        <h1 className="text-2xl font-bold mb-6">Agent Referral Fee Agreement</h1>
        
        <div className="mb-6">
          <p className="mb-4">
            This agreement establishes that you, as a real estate agent, agree to pay a <strong>25% referral fee</strong> to <strong>Randy Brummett</strong> for any sales that occur through leads provided by this platform.
          </p>
          <p className="mb-4">
            By signing this agreement, you acknowledge and agree to the terms and conditions of our referral program.
          </p>
          <p className="mb-2">Key terms:</p>
          <ul className="list-disc pl-6 mb-4">
            <li>25% of your commission will be paid as a referral fee</li>
            <li>The fee applies only to completed transactions from platform-generated leads</li>
            <li>Payment is due within 5 business days of closing</li>
            <li>This agreement remains in effect for all future transactions from platform leads</li>
          </ul>
        </div>
        
        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div>
              <Label htmlFor="agentName">Agent Name</Label>
              <Input 
                id="agentName"
                value={agentName}
                onChange={(e) => setAgentName(e.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="licenseNumber">License Number</Label>
              <Input 
                id="licenseNumber"
                value={licenseNumber}
                onChange={(e) => setLicenseNumber(e.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="address">Address</Label>
              <Input 
                id="address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="city">City</Label>
              <Input 
                id="city"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="state">State</Label>
              <Input 
                id="state"
                value={state}
                onChange={(e) => setState(e.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="zip">ZIP Code</Label>
              <Input 
                id="zip"
                value={zip}
                onChange={(e) => setZip(e.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="date">Date</Label>
              <Input 
                id="date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </div>
          </div>
          
          <div className="mb-6">
            <Label htmlFor="signature">Signature</Label>
            <div className="border border-gray-300 rounded-md p-2 bg-white">
              <SignatureCanvas
                ref={signatureRef}
                canvasProps={{
                  width: 500,
                  height: 200,
                  className: 'signature-canvas w-full h-[200px]'
                }}
                backgroundColor="white"
              />
            </div>
            <Button 
              type="button" 
              variant="outline" 
              size="sm" 
              className="mt-2"
              onClick={clearSignature}
            >
              Clear
            </Button>
          </div>
          
          <div className="flex flex-col space-y-2 md:flex-row md:space-y-0 md:space-x-2">
            <Button type="submit" disabled={saving} className="flex-1">
              {saving ? (
                <>
                  <Spinner size="sm" className="mr-2" />
                  Submitting...
                </>
              ) : (
                'Sign & Submit Agreement'
              )}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}