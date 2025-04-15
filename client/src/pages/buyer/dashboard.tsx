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
import { Loader2, PlusIcon, Trash2, CalendarRange } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ViewingRequestsList } from "@/components/viewing-requests-list";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
              
              {/* Verification Status Banner */}
              {user?.profileStatus !== "verified" && (
                <div className="mt-3 p-2 bg-yellow-50 border border-yellow-200 rounded-md">
                  <div className="flex">
                    <div className="flex-shrink-0">
                      <svg className="h-5 w-5 text-yellow-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div className="ml-3">
                      <h3 className="text-sm font-medium text-yellow-800">Verification Pending</h3>
                      <div className="mt-1 text-xs text-yellow-700">
                        <p>Your identity verification is still pending. <Link href="/buyer/kyc" className="font-medium underline">Complete verification</Link> to unlock all features.</p>
                      </div>
                    </div>
                  </div>
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
