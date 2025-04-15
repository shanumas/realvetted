import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { PropertyCard } from "@/components/property-card";
import { AddPropertyModal } from "@/components/add-property-modal";
import { SiteHeader } from "@/components/layout/site-header";
import { Property } from "@shared/schema";
import { getQueryFn, queryClient } from "@/lib/queryClient";
import { deleteProperty } from "@/lib/ai";
import { Loader2, PlusIcon, Trash2, CalendarRange, CheckCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ViewingRequestsList } from "@/components/viewing-requests-list";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { forceVerification } from "@/lib/verification";
import websocketClient from "@/lib/websocket";
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
  const [, navigate] = useLocation();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [propertyToDelete, setPropertyToDelete] = useState<number | null>(null);
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
  
  // Add status for tracking verification checks
  const [isCheckingVerification, setIsCheckingVerification] = useState(false);
  
  // Continue checking verification status if in pending state
  useEffect(() => {
    let pollingInterval: NodeJS.Timeout | null = null;
    
    // Log all user verification details for troubleshooting
    if (user) {
      console.log(`User verification details - Status: ${user.profileStatus}, Session ID: ${user.verificationSessionId || 'none'}`);
    }
    
    // First, do an immediate check if we have a pending status with session ID
    const checkVerificationStatus = async () => {
      if (user?.verificationSessionId && user.profileStatus === 'pending') {
        console.log(`Checking verification status for session: ${user.verificationSessionId}`);
        try {
          // Call the force verification endpoint to check with Veriff
          // Handle null case explicitly for TypeScript
          const sessionId = user.verificationSessionId || undefined;
          const result = await forceVerification(sessionId);
          console.log('Verification check result:', result);
          
          // Refresh user data
          queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
        } catch (error) {
          console.error("Error checking verification status:", error);
        }
      }
    };
    
    // Run an immediate check
    checkVerificationStatus();
    
    // Also set up polling if needed
    if (user && 
        user.profileStatus === 'pending' && 
        user.verificationSessionId && 
        !isCheckingVerification) {
      
      console.log(`Dashboard: Starting verification polling for session: ${user.verificationSessionId}`);
      setIsCheckingVerification(true);
      
      // Poll every 10 seconds to be more responsive
      pollingInterval = setInterval(checkVerificationStatus, 10000);
    }
    
    // Clean up interval on component unmount
    return () => {
      if (pollingInterval) {
        clearInterval(pollingInterval);
        setIsCheckingVerification(false);
      }
    };
  }, [user, isCheckingVerification]);

  // Setup WebSocket for real-time updates
  useEffect(() => {
    // Set up WebSocket notification handler
    const handleNotification = (data: any) => {
      console.log("Dashboard processing notification:", data);
      
      // Handle verification status updates from authentication messages
      if (data.message === "Authentication successful") {
        console.log("Authentication successful notification received, updating verification status");
        
        // Force verification check
        if (user?.verificationSessionId) {
          forceVerification(user.verificationSessionId)
            .then(() => {
              // Refresh user data to update status in UI
              queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
              
              toast({
                title: "Verification Completed",
                description: "Your identity has been verified successfully!",
                variant: "default"
              });
            })
            .catch(error => {
              console.error("Error updating verification after auth:", error);
            });
        }
      }
      
      // Refresh property data and viewing requests for other notifications
      queryClient.invalidateQueries({ queryKey: ["/api/properties/by-buyer"] });
      queryClient.invalidateQueries({ queryKey: ["/api/viewing-requests/buyer"] });
    };
    
    // Connect WebSocket notification handler
    const unsubscribe = websocketClient.onNotification(handleNotification);
    
    // Clean up
    return () => {
      unsubscribe();
    };
  }, [user]);

  const { data: properties, isLoading, refetch } = useQuery<Property[]>({
    queryKey: ["/api/properties/by-buyer"],
    queryFn: getQueryFn({ on401: "throw" }),
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

  return (
    <div className="min-h-screen bg-gray-50">
      <SiteHeader />
      
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        {/* Welcome Banner with Verification Status */}
        <div className="px-4 py-5 sm:px-6 bg-white shadow rounded-lg mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg leading-6 font-medium text-gray-900">
                Welcome, {user?.firstName || 'Buyer'}!
              </h3>
              <p className="mt-1 max-w-2xl text-sm text-gray-500">
                Start your property search by adding a new property address below.
              </p>
              
              {/* Verification Status Badge and Verification Button */}
              {user && (
                <div className="mt-2 flex items-center space-x-3">
                  {user.profileStatus === 'verified' ? (
                    <div className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                      <svg className="mr-1.5 h-2 w-2 text-green-400" fill="currentColor" viewBox="0 0 8 8">
                        <circle cx="4" cy="4" r="3" />
                      </svg>
                      Identity Verified
                    </div>
                  ) : user.profileStatus === 'pending' ? (
                    <>
                      <div className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                        <svg className="mr-1.5 h-2 w-2 text-yellow-400" fill="currentColor" viewBox="0 0 8 8">
                          <circle cx="4" cy="4" r="3" />
                        </svg>
                        Verification Pending
                      </div>
                      <div className="flex space-x-2">
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={() => navigate("/buyer/kyc?retry=true")}
                          className="text-xs py-0.5"
                        >
                          Verify Now
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={async () => {
                            try {
                              toast({
                                title: "Checking verification status",
                                description: "Forcing verification check now..."
                              });
                              if (user.verificationSessionId) {
                                const result = await forceVerification(user.verificationSessionId);
                                console.log("Manual verification check result:", result);
                                queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
                                toast({
                                  title: "Status check complete",
                                  description: `Status from Veriff: ${result.veriffStatus || 'Unknown'}`
                                });
                              }
                            } catch (error) {
                              console.error("Error manually checking status:", error);
                              toast({
                                title: "Status check failed",
                                description: "Could not check verification status",
                                variant: "destructive"
                              });
                            }
                          }}
                          className="text-xs py-0.5 bg-blue-50 hover:bg-blue-100"
                        >
                          Check Status
                        </Button>
                      </div>
                    </>
                  ) : user.profileStatus === 'rejected' ? (
                    <>
                      <div className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                        <svg className="mr-1.5 h-2 w-2 text-red-400" fill="currentColor" viewBox="0 0 8 8">
                          <circle cx="4" cy="4" r="3" />
                        </svg>
                        Verification Failed
                      </div>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => navigate("/buyer/kyc")}
                        className="text-xs py-0.5"
                      >
                        Retry Verification
                      </Button>
                    </>
                  ) : (
                    <>
                      <div className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                        <svg className="mr-1.5 h-2 w-2 text-gray-400" fill="currentColor" viewBox="0 0 8 8">
                          <circle cx="4" cy="4" r="3" />
                        </svg>
                        Verification Required
                      </div>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => navigate("/buyer/kyc")}
                        className="text-xs py-0.5"
                      >
                        Verify Identity
                      </Button>
                    </>
                  )}
                </div>
              )}
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
              <TabsList className="grid w-full max-w-md grid-cols-2">
                <TabsTrigger value="properties">
                  <PlusIcon className="h-4 w-4 mr-2" />
                  Properties
                </TabsTrigger>
                <TabsTrigger value="viewingRequests">
                  <CalendarRange className="h-4 w-4 mr-2" />
                  Viewing Requests
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
    </div>
  );
}
