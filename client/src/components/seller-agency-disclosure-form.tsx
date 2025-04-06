import React, { useEffect, useRef, useState } from "react";
import SignatureCanvas from "react-signature-canvas";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Send, FileSignature, FileText, RefreshCw } from "lucide-react";
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
  const [currentDocumentUrl, setCurrentDocumentUrl] = useState<string | null>(null);
  const [fetchingDocument, setFetchingDocument] = useState<boolean>(false);
  const sigPad = useRef<SignatureCanvas | null>(null);
  const signatureDate = new Date().toLocaleDateString();
  
  // Format the document URL correctly if provided
  const formattedDocumentUrl = currentDocumentUrl || (documentUrl && 
    (documentUrl.startsWith('/uploads') || documentUrl.startsWith('http') 
      ? documentUrl 
      : `/uploads/${documentUrl}`));
  
  // Handle documentUrl prop directly when it changes
  useEffect(() => {
    console.log("Document URL prop changed:", documentUrl);
    if (documentUrl) {
      const formatted = documentUrl.startsWith('/uploads') || documentUrl.startsWith('http')
        ? documentUrl
        : `/uploads/${documentUrl}`;
      console.log("Setting document URL from prop:", formatted);
      setCurrentDocumentUrl(formatted);
      setIframeError(false);
      setIframeLoading(true);
    }
  }, [documentUrl]);
  
  // Fetch the latest agreement document on mount if no document URL provided
  useEffect(() => {
    if (!documentUrl) {
      console.log("No document URL prop, fetching from API...");
      fetchLatestDocumentUrl();
    }
  }, [agreementId, documentUrl]);
  
  const fetchLatestDocumentUrl = async () => {
    if (!agreementId) {
      console.log("No agreement ID provided, cannot fetch document");
      return;
    }
    
    setFetchingDocument(true);
    try {
      // First, try to get the agreement directly from the agreements list
      console.log("Trying to fetch agreements list first");
      const agreementsResponse = await apiRequest('GET', `/api/properties/${property.id}/agreements`);
      const agreementsResult = await agreementsResponse.json();
      
      if (agreementsResult.success && agreementsResult.data) {
        console.log("Agreements data:", agreementsResult.data);
        
        // Find our specific agreement
        const targetAgreement = agreementsResult.data.find((a: any) => a.id === agreementId);
        if (targetAgreement && targetAgreement.documentUrl) {
          console.log("Found agreement in list with document URL:", targetAgreement.documentUrl);
          
          // Format the URL with /uploads prefix if needed
          const formattedUrl = targetAgreement.documentUrl.startsWith('/uploads') || targetAgreement.documentUrl.startsWith('http')
            ? targetAgreement.documentUrl
            : `/uploads/${targetAgreement.documentUrl}`;
            
          console.log("Formatted document URL from agreements list:", formattedUrl);
          setCurrentDocumentUrl(formattedUrl);
          setIframeError(false);
          setIframeLoading(true);
          setFetchingDocument(false);
          return;
        } else {
          console.log("Agreement found but no document URL:", targetAgreement);
        }
      }
      
      // If we got here, we couldn't find the agreement in the list or it had no document URL
      // Try the specific API endpoint
      console.log(`Fetching document for agreement ID: ${agreementId}`);
      const response = await apiRequest('GET', `/api/agreements/${agreementId}/document`);
      const result = await response.json();
      
      console.log("Document API response:", result);
      
      if (result.success && result.data && result.data.documentUrl) {
        const fetchedUrl = result.data.documentUrl;
        console.log("Fetched document URL from API:", fetchedUrl);
        
        // Format the URL with /uploads prefix if needed
        const formattedUrl = fetchedUrl.startsWith('/uploads') || fetchedUrl.startsWith('http')
          ? fetchedUrl
          : `/uploads/${fetchedUrl}`;
          
        console.log("Formatted document URL:", formattedUrl);
        setCurrentDocumentUrl(formattedUrl);
        setIframeError(false);
        setIframeLoading(true);
      } else {
        console.log("Document not available in API response:", result);
        
        // One last attempt - try to find any agency disclosure agreement that might have a document
        console.log("Looking for any agency disclosure agreement with a document...");
        if (agreementsResult.success && agreementsResult.data) {
          const agencyAgreements = agreementsResult.data.filter((a: any) => 
            a.type === 'agency_disclosure' && a.documentUrl);
          
          if (agencyAgreements.length > 0) {
            const latestAgreement = agencyAgreements[agencyAgreements.length - 1];
            console.log("Found an alternative agreement with document:", latestAgreement);
            
            const formattedUrl = latestAgreement.documentUrl.startsWith('/uploads') || 
                                latestAgreement.documentUrl.startsWith('http')
              ? latestAgreement.documentUrl
              : `/uploads/${latestAgreement.documentUrl}`;
              
            console.log("Using alternative document URL:", formattedUrl);
            setCurrentDocumentUrl(formattedUrl);
            setIframeError(false);
            setIframeLoading(true);
            setFetchingDocument(false);
            return;
          }
        }
        
        setIframeError(true);
      }
    } catch (error) {
      console.error("Error fetching document URL:", error);
      setIframeError(true);
    } finally {
      setFetchingDocument(false);
    }
  };

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

  const handleViewPdf = async () => {
    if (formattedDocumentUrl) {
      window.open(formattedDocumentUrl, '_blank');
    } else {
      // Try to fetch the latest document using our specific document endpoint
      await fetchLatestDocumentUrl();
      
      // If we now have a URL, open it
      if (currentDocumentUrl) {
        window.open(currentDocumentUrl, '_blank');
      } else {
        toast({
          title: "Document Not Available",
          description: "The document is not available for preview at this time.",
          variant: "destructive",
        });
      }
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
          <div className="border rounded-md overflow-hidden relative" style={{ height: '300px' }}>
            {/* Add Refresh button at the top right */}
            {formattedDocumentUrl && (
              <Button
                variant="ghost"
                size="sm"
                className="absolute top-2 right-2 z-10 bg-white/80 hover:bg-white"
                onClick={fetchLatestDocumentUrl}
                disabled={fetchingDocument}
              >
                <RefreshCw className={`h-4 w-4 ${fetchingDocument ? 'animate-spin' : ''}`} />
              </Button>
            )}
            
            {formattedDocumentUrl ? (
              <>
                {(iframeLoading || fetchingDocument) && (
                  <div className="flex flex-col items-center justify-center h-full">
                    <Loader2 className="h-8 w-8 animate-spin text-primary mb-2" />
                    <p className="text-sm text-gray-500">
                      {fetchingDocument ? 'Fetching document...' : 'Loading document...'}
                    </p>
                  </div>
                )}
                
                {/* Only show the iframe when we're not in a loading state */}
                {!fetchingDocument && (
                  <iframe 
                    src={formattedDocumentUrl}
                    width="100%" 
                    height="100%" 
                    title="Agency Disclosure Form"
                    className={`border-0 ${iframeLoading ? 'opacity-0' : 'opacity-100'}`}
                    onLoad={handleIframeLoad}
                    onError={handleIframeError}
                  />
                )}
                
                {/* Show error UI if iframe fails to load */}
                {iframeError && !iframeLoading && !fetchingDocument && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-white">
                    <FileText className="h-12 w-12 mb-2 text-red-300" />
                    <p className="text-sm text-gray-600 mb-2">Failed to load document preview</p>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={fetchLatestDocumentUrl}
                      disabled={fetchingDocument}
                    >
                      <RefreshCw className={`mr-2 h-4 w-4 ${fetchingDocument ? 'animate-spin' : ''}`} />
                      Retry
                    </Button>
                  </div>
                )}
              </>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-gray-500">
                <FileText className="h-12 w-12 mb-2 text-gray-300" />
                <p className="mb-1">Document preview not available</p>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="mt-2"
                  onClick={fetchLatestDocumentUrl}
                  disabled={fetchingDocument}
                >
                  {fetchingDocument ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Loading...
                    </>
                  ) : (
                    <>
                      <FileSignature className="mr-2 h-4 w-4" />
                      Load Document
                    </>
                  )}
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