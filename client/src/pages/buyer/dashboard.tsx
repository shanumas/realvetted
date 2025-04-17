import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { PropertyCard } from "@/components/property-card";
import { AddPropertyModal } from "@/components/add-property-modal";
import { SiteHeader } from "@/components/layout/site-header";
import { Property } from "@shared/schema";
import { getQueryFn, queryClient } from "@/lib/queryClient";
import { deleteProperty } from "@/lib/ai";
import { Loader2, PlusIcon, Trash2, CalendarRange, RefreshCw, Shield, FileText, File, Upload } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useVerificationStatus } from "@/hooks/use-verification-status";
import { ViewingRequestsList } from "@/components/viewing-requests-list";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { createVeriffSession, launchVeriff } from "@/lib/veriff";
import { PrequalificationUpload } from "@/components/prequalification-upload";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function BuyerDashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [propertyToDelete, setPropertyToDelete] = useState<number | null>(null);
  const [isVerifyingIdentity, setIsVerifyingIdentity] = useState(false);
  const [isVerificationStarted, setIsVerificationStarted] = useState(false);
  const [isPrequalificationModalOpen, setIsPrequalificationModalOpen] = useState(false);
  
  // Get stored verification session ID if it exists
  const storedSessionId = localStorage.getItem('veriffSessionId');
  
  // Use the verification status hook
  const { checking, isVerified, lastChecked } = useVerificationStatus(storedSessionId);
  
  // Check if there's a tab preference stored in localStorage
  const [activeTab, setActiveTab] = useState(() => {
    // Read from localStorage or default to properties
    const savedTab = localStorage.getItem('buyerDashboardActiveTab');
    // Clear the localStorage preference after reading it
    if (savedTab) {
      localStorage.removeItem('buyerDashboardActiveTab');
    }
    return savedTab || "properties";
  });
  
  // Setup WebSocket for real-time updates
  useEffect(() => {
    // Set up WebSocket listener for property updates and viewing request changes
    const onMessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'notification' || data.type === 'property_update') {
          // Refresh property data and viewing requests
          queryClient.invalidateQueries({ queryKey: ["/api/properties/by-buyer"] });
          queryClient.invalidateQueries({ queryKey: ["/api/viewing-requests/buyer"] });
        }
      } catch (e) {
        console.error("Error parsing WebSocket message:", e);
      }
    };

    // Connect event listener
    window.addEventListener('message', onMessage);
    
    // Clean up
    return () => {
      window.removeEventListener('message', onMessage);
    };
  }, []);

  const { data: properties, isLoading, refetch } = useQuery<Property[]>({
    queryKey: ["/api/properties/by-buyer"],
    queryFn: getQueryFn({ on401: "throw" }),
  });
  
  // Fetch all agreements signed by the buyer
  const { data: buyerAgreements, isLoading: isLoadingAgreements } = useQuery<any[]>({
    queryKey: ["/api/buyer/agreements"],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!user, // Only run this query if we have a user
  });

  const handleAddPropertySuccess = () => {
    setIsModalOpen(false);
    refetch();
  };
  
  const deleteMutation = useMutation({
    mutationFn: (propertyId: number) => {
      return deleteProperty(propertyId);
    },
    onSuccess: () => {
      toast({
        title: "Property deleted",
        description: "Property has been successfully deleted",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/properties/by-buyer"] });
      setPropertyToDelete(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
      setPropertyToDelete(null);
    },
  });
  
  // Start Veriff verification flow
  const startVerification = async () => {
    try {
      setIsVerifyingIdentity(true);
      
      // Create a Veriff verification session
      const sessionData = await createVeriffSession();
      
      // Store session ID in localStorage to allow background checking
      localStorage.setItem('veriffSessionId', sessionData.sessionId);
      
      // Launch Veriff verification
      launchVeriff(sessionData.url, handleVerificationComplete);
      
      // Update UI
      setIsVerificationStarted(true);
      
      toast({
        title: "Verification Started",
        description: "Please complete the identity verification process in the new window.",
      });
    } catch (error) {
      console.error("Verification error:", error);
      toast({
        title: "Verification failed",
        description: error instanceof Error ? error.message : "An unexpected error occurred",
        variant: "destructive",
      });
    } finally {
      setIsVerifyingIdentity(false);
    }
  };
  
  // Handle the completion of Veriff verification
  const handleVerificationComplete = async (status: 'completed' | 'canceled' | 'error') => {
    if (status === 'completed') {
      toast({
        title: "Verification Submitted",
        description: "Your identity verification has been submitted and is being processed.",
      });
      
      // Refresh user data
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
    } else if (status === 'canceled') {
      toast({
        title: "Verification Canceled",
        description: "You canceled the identity verification process. You can try again later.",
        variant: "destructive",
      });
      
      // Clear the session ID from localStorage as it's no longer valid
      localStorage.removeItem('veriffSessionId');
    } else {
      toast({
        title: "Verification Error",
        description: "There was an error during the verification process. Please try again.",
        variant: "destructive",
      });
    }
    
    setIsVerificationStarted(false);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <SiteHeader />
      
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        {/* Welcome Banner */}
        <div className="px-4 py-5 sm:px-6 bg-white shadow rounded-lg mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg leading-6 font-medium text-gray-900">
                Welcome, {user?.firstName || 'Buyer'}!
              </h3>
              <p className="mt-1 max-w-2xl text-sm text-gray-500">
                Start your property search by adding a new property address below.
              </p>
              
              {/* Verification Status Banner - Always shown */}
              <div className={`mt-3 p-2 ${user?.profileStatus === "verified" ? "bg-green-50 border border-green-200" : "bg-yellow-50 border border-yellow-200"} rounded-md`}>
                <div className="flex">
                  <div className="flex-shrink-0">
                    {checking ? (
                      <RefreshCw className="h-5 w-5 text-blue-400 animate-spin" />
                    ) : user?.profileStatus === "verified" ? (
                      <svg className="h-5 w-5 text-green-500" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                    ) : (
                      <svg className="h-5 w-5 text-yellow-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                    )}
                  </div>
                  <div className="ml-3 flex-grow">
                    <div className="flex justify-between items-start">
                      <h3 className={`text-sm font-medium ${user?.profileStatus === "verified" ? "text-green-800" : "text-yellow-800"}`}>
                        Verification Status: <span className="font-bold">{user?.profileStatus === "verified" ? "Verified" : "Pending"}</span>
                      </h3>
                      {storedSessionId && user?.profileStatus !== "verified" && (
                        <span className="text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                          {checking ? "Checking status..." : "Auto-checking enabled"}
                        </span>
                      )}
                    </div>
                    <div className="mt-1 text-xs text-gray-700">
                      {user?.profileStatus === "verified" ? (
                        <p>Your identity has been verified successfully. You have full access to all platform features.</p>
                      ) : (
                        <div className="space-y-2">
                          <p>
                            {storedSessionId 
                              ? "We're checking your verification status in the background. " 
                              : "Your identity verification is still pending. "}
                            Complete verification to unlock all features.
                          </p>
                          <div className="flex space-x-2">
                            <Button 
                              size="sm"
                              className="text-xs h-8"
                              onClick={startVerification}
                              disabled={isVerifyingIdentity || isVerificationStarted}
                            >
                              {isVerifyingIdentity ? (
                                <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                              ) : (
                                <Shield className="mr-2 h-3 w-3" />
                              )}
                              {isVerificationStarted 
                                ? "Verification in Progress..." 
                                : isVerifyingIdentity 
                                  ? "Starting..." 
                                  : "Verify Identity"}
                            </Button>
                            
                            <Button 
                              size="sm"
                              className="text-xs h-8"
                              onClick={() => setIsPrequalificationModalOpen(true)}
                              disabled={isVerificationStarted}
                              variant="outline"
                            >
                              <Upload className="mr-2 h-3 w-3" />
                              Upload Pre-qualification
                            </Button>
                          </div>
                          {isVerificationStarted && (
                            <div className="p-2 bg-blue-50 text-blue-700 rounded-md flex items-center text-xs mt-2">
                              <Loader2 className="h-3 w-3 animate-spin text-blue-500 mr-2" />
                              <span>Please complete the verification process in the opened window.</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <Button onClick={() => setIsModalOpen(true)}>
              <PlusIcon className="mr-2 h-4 w-4" />
              Add Property
            </Button>
          </div>
        </div>
        
        {/* Main Content Tabs */}
        <div className="bg-white shadow rounded-lg">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <div className="px-4 pt-4 border-b border-gray-200">
              <TabsList className="grid w-full max-w-md grid-cols-3">
                <TabsTrigger value="properties">
                  <PlusIcon className="h-4 w-4 mr-2" />
                  Properties
                </TabsTrigger>
                <TabsTrigger value="viewingRequests">
                  <CalendarRange className="h-4 w-4 mr-2" />
                  Viewing Requests
                </TabsTrigger>
                <TabsTrigger value="agreements">
                  <FileText className="h-4 w-4 mr-2" />
                  Agreements
                </TabsTrigger>
              </TabsList>
            </div>
            
            <TabsContent value="properties" className="p-0">
              <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
                <h3 className="text-lg leading-6 font-medium text-gray-900">My Properties</h3>
                <p className="mt-1 text-sm text-gray-500">Properties you've added to track</p>
              </div>
              
              {isLoading ? (
                <div className="p-8 flex justify-center">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : properties && properties.length > 0 ? (
                <div className="divide-y divide-gray-200">
                  {properties.map((property) => (
                    <PropertyCard
                      key={property.id}
                      property={property}
                      actionButton={
                        <div className="flex space-x-2">
                          <Link href={`/buyer/property/${property.id}`}>
                            <Button variant="outline" size="sm">
                              View Details
                            </Button>
                          </Link>
                          <Button 
                            variant="outline" 
                            size="sm"
                            className={`bg-red-50 text-red-600 hover:bg-red-100 ${property.agentId ? 'opacity-50 cursor-not-allowed' : ''}`}
                            onClick={() => property.agentId ? null : setPropertyToDelete(property.id)}
                            title={property.agentId ? "Cannot delete after agent has accepted" : "Delete property"}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      }
                    />
                  ))}
                </div>
              ) : (
                <div className="px-4 sm:px-6 py-10">
                  <p className="text-center text-gray-500">
                    You haven't added any properties yet. Add your first property to get started.
                  </p>
                </div>
              )}
            </TabsContent>
            
            <TabsContent value="viewingRequests" className="p-0">
              <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
                <h3 className="text-lg leading-6 font-medium text-gray-900">My Viewing Requests</h3>
                <p className="mt-1 text-sm text-gray-500">Track the status of your property viewing requests</p>
              </div>
              {user && (
                <div className="p-4">
                  <ViewingRequestsList userId={user.id} role="buyer" />
                </div>
              )}
            </TabsContent>
            
            <TabsContent value="agreements" className="p-0">
              <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
                <h3 className="text-lg leading-6 font-medium text-gray-900">My Signed Agreements</h3>
                <p className="mt-1 text-sm text-gray-500">Documents and agreements you've signed during your home buying journey</p>
              </div>
              
              <div className="p-4">
                {isLoadingAgreements ? (
                  <div className="flex justify-center my-8">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                ) : !buyerAgreements || buyerAgreements.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <File className="h-12 w-12 mx-auto mb-2 text-gray-300" />
                    <p>No signed agreements yet.</p>
                    <p className="text-sm mt-2">When you sign documents related to a property, they will appear here.</p>
                  </div>
                ) : (
                  <div className="divide-y">
                    {buyerAgreements.map((agreement: any) => (
                      <div
                        key={agreement.id}
                        className="py-4 flex items-center justify-between"
                      >
                        <div className="flex items-start space-x-3">
                          <div className="bg-blue-50 p-2 rounded-lg">
                            <FileText className="h-6 w-6 text-blue-500" />
                          </div>
                          <div>
                            <span className="font-medium">
                              {agreement.type === "agency_disclosure"
                                ? "Agency Disclosure Form"
                                : agreement.type === "representation_agreement"
                                ? "Buyer Representation Agreement"
                                : agreement.type === "standard"
                                ? "Buyer Representation Agreement"
                                : agreement.type === "global_brbc"
                                ? "Global Buyer Representation Agreement"
                                : "Agreement Document"}
                            </span>
                            <div className="text-xs text-gray-500 mt-1">
                              <div className="flex flex-col">
                                <span>
                                  {agreement.isGlobal 
                                    ? "Type: Global (All Properties)" 
                                    : `Property: ${agreement.property ? agreement.property.address : "Unknown"}`}
                                </span>
                                {agreement.isGlobal && (
                                  <span className="text-blue-600">
                                    Agent: {agreement.agentName || "Your Agent"}
                                  </span>
                                )}
                                <span>
                                  Signed: {new Date(agreement.date).toLocaleDateString()}
                                </span>
                                <span
                                  className={`mt-1 inline-flex items-center px-2 py-0.5 text-xs rounded-full ${
                                    agreement.status === "signed_by_buyer"
                                      ? "bg-green-100 text-green-800"
                                      : agreement.status === "signed_by_all"
                                      ? "bg-green-100 text-green-800"
                                      : "bg-blue-100 text-blue-800"
                                  }`}
                                >
                                  {agreement.status === "signed_by_buyer"
                                    ? "Signed by You"
                                    : agreement.status === "signed_by_all"
                                    ? "Fully Signed"
                                    : agreement.status}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            // Format the agreement document URL before viewing
                            const documentUrl = agreement.documentUrl ? 
                              (agreement.documentUrl.startsWith('/uploads') || agreement.documentUrl.startsWith('http') ? 
                                agreement.documentUrl : 
                                `/uploads/${agreement.documentUrl}`) : 
                              null;
                              
                            if (documentUrl) {
                              window.open(documentUrl, '_blank');
                            } else {
                              toast({
                                title: "Error",
                                description: "Document not available",
                                variant: "destructive",
                              });
                            }
                          }}
                        >
                          View Document
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </main>
      
      <AddPropertyModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={handleAddPropertySuccess}
      />
      
      {/* Confirmation Dialog for Property Deletion */}
      <AlertDialog open={propertyToDelete !== null}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Property</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this property? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPropertyToDelete(null)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (propertyToDelete) {
                  deleteMutation.mutate(propertyToDelete);
                }
              }}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleteMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      
      {/* Prequalification Document Upload Modal */}
      <PrequalificationUpload
        isOpen={isPrequalificationModalOpen}
        onClose={() => setIsPrequalificationModalOpen(false)}
        onVerified={() => {
          // Refresh user data to update verification status
          queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
        }}
      />
    </div>
  );
}
