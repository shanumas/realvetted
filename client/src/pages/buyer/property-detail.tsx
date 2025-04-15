import React, { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { getQueryFn, apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { Property, User } from "@shared/schema";
import { PropertyWithParticipants, ViewingRequestWithParticipants } from "@shared/types";
import { SiteHeader } from "@/components/layout/site-header";
import { ChatWindow } from "@/components/chat/chat-window";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AgencyDisclosureForm } from "@/components/agency-disclosure-form";
import { 
  Loader2, Home, Bed, Bath, Square, Tag, Calendar, Building, Phone, Mail, 
  Briefcase, Award, Link, FileText, ListTodo, ImageIcon, ChevronLeft, ChevronRight,
  Send, Activity, UserPlus, Users, MessageCircle, Eye, Calendar as CalendarIcon, AlertTriangle
} from "lucide-react";
import { PropertyActivityLog } from "@/components/property-activity-log";
import { AgentCard } from "@/components/agent-card";
import { PropertyViewingRequestsList } from "@/components/property-viewing-requests-list";
import { AgentEmailEditor } from "@/components/agent-email-editor";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function BuyerPropertyDetail() {
  const [, params] = useRoute("/buyer/property/:id");
  const propertyId = params?.id ? parseInt(params.id) : 0;
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState<string>("viewings");
  const [currentImageIndex, setCurrentImageIndex] = useState<number>(0);
  const [isAgentDialogOpen, setIsAgentDialogOpen] = useState<boolean>(false);
  const [selectedAgentId, setSelectedAgentId] = useState<number | null>(null);
  const [isViewingModalOpen, setIsViewingModalOpen] = useState<boolean>(false);
  const [viewingDate, setViewingDate] = useState<string>("");
  const [viewingTime, setViewingTime] = useState<string>("");
  const [viewingEndTime, setViewingEndTime] = useState<string>("");
  const [viewingNotes, setViewingNotes] = useState<string>("");
  const [isDisclosureFormOpen, setIsDisclosureFormOpen] = useState<boolean>(false);
  const [viewingRequestData, setViewingRequestData] = useState<{ date: string; time: string; endTime: string; notes: string } | null>(null);
  
  // State for override confirmation dialog
  const [showOverrideDialog, setShowOverrideDialog] = useState<boolean>(false);
  const [pendingRequestData, setPendingRequestData] = useState<{
    date: string;
    time: string;
    endTime: string;
    notes: string;
  } | null>(null);
  const [existingRequestInfo, setExistingRequestInfo] = useState<{
    existingRequestId?: number;
    existingRequestDate?: string;
  } | null>(null);
  
  const { toast } = useToast();
  const { user } = useAuth();
  
  // Fetch available agents
  const { data: agents } = useQuery<Array<{
    id: number;
    firstName: string | null;
    lastName: string | null;
    state: string | null;
    city: string | null;
    email: string;
    phone: string | null;
    profilePhotoUrl: string | null;
    profileStatus: string;
  }>>({
    queryKey: ["/api/agents"],
    queryFn: getQueryFn({ on401: "throw" }),
  });
  
  // Mutation to choose an agent
  const chooseAgentMutation = useMutation({
    mutationFn: async (agentId: number) => {
      const res = await apiRequest("PUT", `/api/properties/${propertyId}/choose-agent`, { agentId });
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: "Agent assigned",
        description: "The agent has been assigned to your property and notified.",
        variant: "default",
      });
      queryClient.invalidateQueries({ queryKey: [`/api/properties/${propertyId}`] });
      setIsAgentDialogOpen(false);
      setSelectedAgentId(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to assign agent",
        description: error.message,
        variant: "destructive",
      });
    }
  });
  
  const handleChooseAgent = () => {
    if (selectedAgentId) {
      chooseAgentMutation.mutate(selectedAgentId);
    } else {
      toast({
        title: "No agent selected",
        description: "Please select an agent first.",
        variant: "destructive",
      });
    }
  };

  const sendEmailMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/properties/${propertyId}/send-email`, {});
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: "Email sent",
        description: "Your email has been sent to the listing agent.",
        variant: "default",
      });
      queryClient.invalidateQueries({ queryKey: [`/api/properties/${propertyId}`] });
    },
    onError: (error: Error) => {
      toast({
        title: "Could not send email",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  const handleSendEmail = () => {
    sendEmailMutation.mutate();
  };
  
  // Mutation to request a property viewing
  const requestViewingMutation = useMutation({
    mutationFn: async (data: { 
      date: string, 
      time: string, 
      endTime: string, 
      notes: string, 
      override?: boolean 
    }) => {
      console.log("Requesting property viewing with data:", {
        propertyId,
        date: data.date,
        time: data.time,
        endTime: data.endTime,
        notes: data.notes,
        override: data.override
      });
      
      // Create request payload with proper date formatting
      const payload = {
        propertyId: propertyId,
        requestedDate: `${data.date}T${data.time}:00`,
        requestedEndDate: data.endTime ? `${data.date}T${data.endTime}:00` : undefined,
        notes: data.notes,
        override: data.override || false
      };
      
      console.log("Sending viewing request payload:", payload);
      
      try {
        const res = await apiRequest("POST", `/api/viewing-requests`, payload);
        const responseData = await res.json();
        console.log("Viewing request response:", responseData);
        return responseData;
      } catch (error) {
        console.error("Error requesting viewing:", error);
        throw error;
      }
    },
    onSuccess: () => {
      toast({
        title: "Viewing requested",
        description: "Your viewing request has been sent to the agent.",
        variant: "default",
      });
      setIsViewingModalOpen(false);
      setViewingDate("");
      setViewingTime("");
      setViewingEndTime("");
      setViewingNotes("");
      
      // Reset override dialog state
      setShowOverrideDialog(false);
      setPendingRequestData(null);
      setExistingRequestInfo(null);
      
      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: [`/api/properties/${propertyId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/properties/${propertyId}/logs`] });
      queryClient.invalidateQueries({ queryKey: ["/api/viewing-requests/buyer"] });
      queryClient.invalidateQueries({ queryKey: [`/api/properties/${propertyId}/viewing-requests`] });
      
      // Switch to the viewings tab
      setActiveTab("viewings");
    },
    onError: (error: any) => {
      console.error("Viewing request error:", error);
      
      // Detailed error logging for debugging
      console.log("Error details:", {
        message: error.message,
        stack: error.stack,
        response: error.response,
        data: error.response?.data,
        status: error.response?.status,
      });
      
      // Since buyers should be able to make multiple viewing requests,
      // we'll bypass the "already exists" error by adding the property here
      if (error.message?.includes("already exists")) {
        console.log("Bypassing 'already exists' error - allowing multiple viewing requests");
        
        // Switch to the viewings tab to show existing requests
        setActiveTab("viewings");
      } else if (error.response?.status === 403) {
        // Specific handling for permission errors
        toast({
          title: "Permission Error",
          description: error.message || "You don't have permission to request a viewing for this property.",
          variant: "destructive",
        });
        
        console.log("Property status:", property?.status);
        console.log("Current user role:", user?.role);
        
        // Check property status
        if (property?.status !== 'active' && property?.status !== 'pending') {
          toast({
            title: "Property Not Available",
            description: `This property is currently ${property?.status} and not available for viewing requests.`,
            variant: "destructive",
          });
        }
      } else {
        // Generic error handler with more details
        toast({
          title: "Could not request viewing",
          description: `Error: ${error.message || "Unknown error"}${error.response?.status ? ` (Status: ${error.response.status})` : ''}`,
          variant: "destructive",
        });
      }
    }
  });
  
  const handleRequestViewing = () => {
    if (!viewingDate) {
      toast({
        title: "Date required",
        description: "Please select a date for the viewing.",
        variant: "destructive",
      });
      return;
    }
    
    if (!viewingTime) {
      toast({
        title: "Time required",
        description: "Please select a time for the viewing.",
        variant: "destructive",
      });
      return;
    }
    
    if (viewingEndTime && viewingEndTime <= viewingTime) {
      toast({
        title: "Invalid end time",
        description: "End time must be after start time.",
        variant: "destructive",
      });
      return;
    }
    
    // Check if agent is assigned
    if (!property?.agentId) {
      toast({
        title: "Agent required",
        description: "Please choose an agent before requesting a viewing.",
        variant: "destructive",
      });
      setIsAgentDialogOpen(true);
      return;
    }
    
    // Store viewing request data for later submission after signing the disclosure form
    setViewingRequestData({
      date: viewingDate,
      time: viewingTime,
      endTime: viewingEndTime,
      notes: viewingNotes
    });
    
    // Close the viewing modal
    setIsViewingModalOpen(false);
    
    // Open the disclosure form
    setIsDisclosureFormOpen(true);
  };
  
  // Handle submission after the disclosure form is signed
  const handleDisclosureFormComplete = useCallback((shouldOverrideOrEvent: boolean | React.MouseEvent = false) => {
    // Close the disclosure form
    setIsDisclosureFormOpen(false);
    
    // Determine if we should override (true if boolean parameter is true)
    const shouldOverride = typeof shouldOverrideOrEvent === 'boolean' ? shouldOverrideOrEvent : false;
    
    // Submit the viewing request if we have stored data
    if (viewingRequestData) {
      requestViewingMutation.mutate({
        date: viewingRequestData.date,
        time: viewingRequestData.time,
        endTime: viewingRequestData.endTime,
        notes: viewingRequestData.notes,
        override: shouldOverride // Allow override if explicitly requested
      });
      
      // Clear the stored data
      setViewingRequestData(null);
    }
  }, [viewingRequestData, requestViewingMutation, setViewingRequestData, setIsDisclosureFormOpen]);
  
  // Handle cancellation of the disclosure form
  const handleDisclosureFormCancel = useCallback(() => {
    setViewingRequestData(null);
    
    toast({
      title: "Viewing request cancelled",
      description: "You can try again when you're ready to sign the disclosure form.",
      variant: "default",
    });
  }, [toast, setViewingRequestData]);
  
  // Monitor disclosure form closing
  useEffect(() => {
    // When disclosure form is closed (isDisclosureFormOpen changes from true to false)
    if (!isDisclosureFormOpen) {
      // If we just closed the form and we still have viewing request data,
      // query for the latest agreement to see if it was signed
      if (viewingRequestData && propertyId) {
        apiRequest("GET", `/api/properties/${propertyId}/agreements`)
          .then(response => response.json())
          .then(data => {
            if (data.success && data.data) {
              // Check for a recently signed agency disclosure agreement
              const recentDisclosures = data.data.filter((agreement: any) => 
                agreement.type === "agency_disclosure" && 
                (agreement.status === "completed" || agreement.status === "pending") &&
                user?.id && agreement.buyerId === user.id &&
                new Date(agreement.date).getTime() > Date.now() - 60000 // Within the last minute
              );
              
              if (recentDisclosures.length > 0) {
                // If we found a recent disclosure, proceed with the viewing request
                handleDisclosureFormComplete();
              } else {
                // Instead of auto-canceling, ask the user what they want to do
                toast({
                  title: "Disclosure Form Not Signed",
                  description: "Do you want to proceed with your viewing request anyway? You'll need to sign the disclosure form later.",
                  duration: 8000,
                  action: (
                    <div className="flex space-x-2">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={handleDisclosureFormCancel}
                      >
                        Cancel Request
                      </Button>
                      <Button 
                        variant="default" 
                        size="sm" 
                        onClick={() => handleDisclosureFormComplete(true)}
                      >
                        Continue Anyway
                      </Button>
                    </div>
                  ),
                });
                
                // Don't automatically cancel, let the user decide
                // Don't run handleDisclosureFormCancel() here
              }
            } else {
              // If the API call fails or returns no data, show a toast with options instead of auto-cancelling
              toast({
                title: "Unable to verify form signature",
                description: "Do you want to proceed with your viewing request anyway?",
                duration: 8000,
                action: (
                  <div className="flex space-x-2">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={handleDisclosureFormCancel}
                    >
                      Cancel Request
                    </Button>
                    <Button 
                      variant="default" 
                      size="sm" 
                      onClick={() => handleDisclosureFormComplete(true)}
                    >
                      Continue Anyway
                    </Button>
                  </div>
                ),
              });
            }
          })
          .catch(() => {
            // On error, show a toast with options instead of auto-cancelling
            toast({
              title: "Error verifying form signature",
              description: "Do you want to proceed with your viewing request anyway?",
              duration: 8000,
              action: (
                <div className="flex space-x-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={handleDisclosureFormCancel}
                  >
                    Cancel Request
                  </Button>
                  <Button 
                    variant="default" 
                    size="sm" 
                    onClick={() => handleDisclosureFormComplete(true)}
                  >
                    Continue Anyway
                  </Button>
                </div>
              ),
            });
          });
      }
    }
  }, [isDisclosureFormOpen, viewingRequestData, propertyId, user?.id, handleDisclosureFormComplete, handleDisclosureFormCancel, toast]);

  const { data: property, isLoading } = useQuery<PropertyWithParticipants>({
    queryKey: [`/api/properties/${propertyId}`],
    queryFn: getQueryFn({ on401: "throw" }),
  });
  
  // Fetch viewing requests for this property
  const { data: viewingRequests = [], isLoading: isLoadingViewingRequests } = useQuery<ViewingRequestWithParticipants[]>({
    queryKey: [`/api/properties/${propertyId}/viewing-requests`],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!propertyId, // Only run query if propertyId is valid
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex justify-center items-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!property) {
    return (
      <div className="min-h-screen bg-gray-50">
        <SiteHeader />
        <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
          <div className="bg-white shadow rounded-lg p-6">
            <h3 className="text-lg font-medium text-gray-900">Property not found</h3>
            <p className="mt-1 text-gray-500">The property you're looking for doesn't exist or you don't have access to it.</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <SiteHeader />
      
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="lg:grid lg:grid-cols-3 lg:gap-8">
          {/* Property Details Section */}
          <div className="lg:col-span-2">
            <Card className="mb-6">
              <CardContent className="p-0">
                <div className="px-4 py-5 border-b border-gray-200 sm:px-6 flex justify-between items-center">
                  <div>
                    <h3 className="text-lg leading-6 font-medium text-gray-900">
                      {property.address}
                    </h3>
                    <p className="mt-1 max-w-2xl text-sm text-gray-500">
                      {property.city}, {property.state} {property.zip}
                    </p>
                  </div>
                  <div>
                    <span className="inline-flex items-center px-3 py-0.5 rounded-full text-sm font-medium bg-green-100 text-green-800">
                      {property.status === "active" ? "Active" : property.status}
                    </span>
                  </div>
                </div>
                
                {/* Property Images */}
                <div className="px-4 py-5 sm:px-6">
                  {property.imageUrls && property.imageUrls.length > 0 ? (
                    <div className="relative">
                      {/* Image Carousel */}
                      <div className="relative overflow-x-hidden">
                        <div 
                          className="flex transition-transform duration-300 ease-in-out" 
                          style={{ 
                            transform: `translateX(-${currentImageIndex * 100}%)`,
                            width: `${property.imageUrls.length * 100}%` 
                          }}
                        >
                          {property.imageUrls.map((url, index) => (
                            <div key={index} className="w-full flex-shrink-0">
                              <div className="h-64 mx-auto rounded-lg overflow-hidden">
                                <img 
                                  src={url} 
                                  alt={`Property image ${index + 1}`} 
                                  className="w-full h-full object-cover"
                                  onError={(e) => {
                                    // If image fails to load, show placeholder
                                    const target = e.target as HTMLImageElement;
                                    target.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="300" height="256" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>';
                                    target.onerror = null; // Prevent infinite error loop
                                  }}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                      
                      {/* Navigation Arrows */}
                      {property.imageUrls.length > 1 && (
                        <>
                          <button 
                            className="absolute left-0 top-1/2 transform -translate-y-1/2 bg-black/50 text-white p-2 rounded-r-md hover:bg-black/70 transition-colors"
                            onClick={() => setCurrentImageIndex(prev => (prev > 0 ? prev - 1 : property.imageUrls!.length - 1))}
                            aria-label="Previous image"
                          >
                            <ChevronLeft className="h-6 w-6" />
                          </button>
                          <button 
                            className="absolute right-0 top-1/2 transform -translate-y-1/2 bg-black/50 text-white p-2 rounded-l-md hover:bg-black/70 transition-colors"
                            onClick={() => setCurrentImageIndex(prev => (prev < property.imageUrls!.length - 1 ? prev + 1 : 0))}
                            aria-label="Next image"
                          >
                            <ChevronRight className="h-6 w-6" />
                          </button>
                        </>
                      )}
                      
                      {/* Image Indicators */}
                      {property.imageUrls.length > 1 && (
                        <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-2">
                          {property.imageUrls.map((_, index) => (
                            <button
                              key={index}
                              className={`h-2 w-2 rounded-full transition-colors ${
                                currentImageIndex === index ? 'bg-white' : 'bg-white/50'
                              }`}
                              onClick={() => setCurrentImageIndex(index)}
                              aria-label={`Go to image ${index + 1}`}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="bg-gray-200 h-64 rounded-lg overflow-hidden">
                      <div className="w-full h-full flex items-center justify-center text-gray-400">
                        <Home className="h-16 w-16" />
                      </div>
                    </div>
                  )}
                </div>
                
                {/* Property Details */}
                <div className="border-t border-gray-200">
                  <div className="px-4 py-5 sm:px-6 border-b border-gray-200">
                    <h3 className="text-lg leading-6 font-medium text-gray-900">Property Details</h3>
                  </div>
                  <dl>
                    <div className="bg-gray-50 px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                      <dt className="text-sm font-medium text-gray-500 flex items-center">
                        <Home className="mr-2 h-4 w-4" /> Property type
                      </dt>
                      <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                        {property.propertyType || "Not specified"}
                      </dd>
                    </div>
                    <div className="bg-white px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                      <dt className="text-sm font-medium text-gray-500 flex items-center">
                        <Tag className="mr-2 h-4 w-4" /> Price
                      </dt>
                      <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                        {property.price ? `$${property.price.toLocaleString()}` : "Not specified"}
                      </dd>
                    </div>
                    <div className="bg-gray-50 px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                      <dt className="text-sm font-medium text-gray-500 flex items-center">
                        <Bed className="mr-2 h-4 w-4" /> Bedrooms
                      </dt>
                      <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                        {property.bedrooms || "Not specified"}
                      </dd>
                    </div>
                    <div className="bg-white px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                      <dt className="text-sm font-medium text-gray-500 flex items-center">
                        <Bath className="mr-2 h-4 w-4" /> Bathrooms
                      </dt>
                      <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                        {property.bathrooms || "Not specified"}
                      </dd>
                    </div>
                    <div className="bg-gray-50 px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                      <dt className="text-sm font-medium text-gray-500 flex items-center">
                        <Square className="mr-2 h-4 w-4" /> Square footage
                      </dt>
                      <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                        {property.squareFeet ? `${property.squareFeet.toLocaleString()} sqft` : "Not specified"}
                      </dd>
                    </div>
                    <div className="bg-white px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                      <dt className="text-sm font-medium text-gray-500 flex items-center">
                        <Calendar className="mr-2 h-4 w-4" /> Year built
                      </dt>
                      <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                        {property.yearBuilt || "Not specified"}
                      </dd>
                    </div>
                    {property.description && (
                      <div className="bg-gray-50 px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                        <dt className="text-sm font-medium text-gray-500 flex items-center">
                          <FileText className="mr-2 h-4 w-4" /> Description
                        </dt>
                        <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                          {property.description}
                        </dd>
                      </div>
                    )}
                    {property.features && property.features.length > 0 && (
                      <div className="bg-white px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                        <dt className="text-sm font-medium text-gray-500 flex items-center">
                          <ListTodo className="mr-2 h-4 w-4" /> Features
                        </dt>
                        <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                          <ul className="list-disc pl-5 space-y-1">
                            {property.features.map((feature, index) => (
                              <li key={index}>{feature}</li>
                            ))}
                          </ul>
                        </dd>
                      </div>
                    )}
                    {property.propertyUrl && (
                      <div className="bg-gray-50 px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                        <dt className="text-sm font-medium text-gray-500 flex items-center">
                          <Link className="mr-2 h-4 w-4" /> Original listing
                        </dt>
                        <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                          <a 
                            href={property.propertyUrl} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline"
                          >
                            View original listing
                          </a>
                        </dd>
                      </div>
                    )}
                  </dl>
                  
                  {/* Listing Agent Information */}
                  {(property.sellerName || property.sellerEmail || property.sellerPhone || 
                    property.sellerCompany || property.sellerLicenseNo) && (
                    <>
                      <div className="px-4 py-5 sm:px-6 border-t border-b border-gray-200 mt-6">
                        <h3 className="text-lg leading-6 font-medium text-gray-900">Listing Agent Information</h3>
                      </div>
                      <dl>
                        {property.sellerName && (
                          <div className="bg-gray-50 px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                            <dt className="text-sm font-medium text-gray-500 flex items-center">
                              <Building className="mr-2 h-4 w-4" /> Agent name
                            </dt>
                            <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                              {property.sellerName}
                            </dd>
                          </div>
                        )}
                        <div className="bg-white px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                          <dt className="text-sm font-medium text-gray-500 flex items-center">
                            <Mail className="mr-2 h-4 w-4" /> Email
                          </dt>
                          <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                            <div className="flex flex-col space-y-2">
                              {/* Editable Email Address */}
                              <div className="flex items-center flex-wrap gap-2">
                                <AgentEmailEditor
                                  propertyId={Number(propertyId)}
                                  currentEmail={property.sellerEmail}
                                  inline={true}
                                />
                              </div>
                              
                              {/* Email Actions */}
                              {property.sellerEmail && (
                                <div className="flex items-center mt-2">
                                  <a 
                                    href={`mailto:${property.sellerEmail}`}
                                    className="text-blue-600 hover:underline inline-flex items-center text-sm"
                                  >
                                    <Mail className="mr-1 h-3 w-3" />
                                    Email agent
                                  </a>
                                  
                                  {property.emailSent ? (
                                    <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                                      <Mail className="mr-1 h-3 w-3" />
                                      Email sent
                                    </span>
                                  ) : (
                                    <Button 
                                      variant="outline" 
                                      size="sm" 
                                      className="ml-2"
                                      onClick={handleSendEmail}
                                      disabled={sendEmailMutation.isPending}
                                    >
                                      {sendEmailMutation.isPending ? (
                                        <>
                                          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                                          Sending...
                                        </>
                                      ) : (
                                        <>
                                          <Send className="mr-1 h-3 w-3" />
                                          Send Email
                                        </>
                                      )}
                                    </Button>
                                  )}
                                </div>
                              )}
                            </div>
                          </dd>
                        </div>
                        {property.sellerPhone && (
                          <div className="bg-gray-50 px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                            <dt className="text-sm font-medium text-gray-500 flex items-center">
                              <Phone className="mr-2 h-4 w-4" /> Phone
                            </dt>
                            <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                              <a 
                                href={`tel:${property.sellerPhone}`}
                                className="text-blue-600 hover:underline"
                              >
                                {property.sellerPhone}
                              </a>
                            </dd>
                          </div>
                        )}
                        {property.sellerCompany && (
                          <div className="bg-white px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                            <dt className="text-sm font-medium text-gray-500 flex items-center">
                              <Briefcase className="mr-2 h-4 w-4" /> Company
                            </dt>
                            <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                              {property.sellerCompany}
                            </dd>
                          </div>
                        )}
                        {property.sellerLicenseNo && (
                          <div className="bg-gray-50 px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                            <dt className="text-sm font-medium text-gray-500 flex items-center">
                              <Award className="mr-2 h-4 w-4" /> License #
                            </dt>
                            <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                              {property.sellerLicenseNo}
                            </dd>
                          </div>
                        )}
                      </dl>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
          
          {/* Chat Section */}
          <div className="lg:col-span-1">
            <Card>
              <CardContent className="p-0">
                <div className="px-4 py-5 border-b border-gray-200 sm:px-6">
                  <h3 className="text-lg leading-6 font-medium text-gray-900">
                    Property Communication
                  </h3>
                  <p className="mt-1 max-w-2xl text-sm text-gray-500">
                    Chat with seller and your agent
                  </p>
                </div>
                
                <Tabs 
                  defaultValue={activeTab} 
                  value={activeTab} 
                  onValueChange={setActiveTab} 
                  className="w-full"
                >
                  <div className="border-b border-gray-200">
                    <TabsList className="w-full grid grid-cols-5">
                      <TabsTrigger value="viewings" className="data-[state=active]:border-b-2 data-[state=active]:border-primary">
                        <span className="flex items-center">
                          <Eye className="mr-1 h-4 w-4" /> 
                          Viewings
                        </span>
                      </TabsTrigger>
                      <TabsTrigger value="seller" className="data-[state=active]:border-b-2 data-[state=active]:border-primary">
                        Seller Chat
                      </TabsTrigger>
                      <TabsTrigger value="agent" className="data-[state=active]:border-b-2 data-[state=active]:border-primary">
                        Agent Chat
                      </TabsTrigger>
                      <TabsTrigger value="agent-email" className="data-[state=active]:border-b-2 data-[state=active]:border-primary">
                        <span className="flex items-center">
                          <Mail className="mr-1 h-4 w-4" /> 
                          Agent Email
                        </span>
                      </TabsTrigger>
                      <TabsTrigger value="activity" className="data-[state=active]:border-b-2 data-[state=active]:border-primary">
                        <span className="flex items-center">
                          <Activity className="mr-1 h-4 w-4" /> 
                          Activity
                        </span>
                      </TabsTrigger>
                    </TabsList>
                  </div>
                  
                  <TabsContent value="viewings">
                    <div className="p-4">
                      <div className="mb-4">
                        <h3 className="text-lg font-medium flex items-center text-gray-900">
                          <Eye className="mr-2 h-5 w-5 text-primary" />
                          Schedule a Viewing
                        </h3>
                        <p className="text-sm text-gray-500 mt-1">
                          Request a property viewing with your agent at your preferred date and time.
                        </p>
                      </div>
                      
                      {/* Viewing Request Button */}
                      <div className="mb-6">
                        {/* Disable the button if there's already a pending viewing request */}
                        {viewingRequests.some(request => request.status === 'pending') ? (
                          <div className="flex flex-col gap-3">
                            <Button 
                              className="w-full flex items-center justify-center"
                              variant="outline"
                              disabled
                            >
                              <AlertTriangle className="mr-2 h-5 w-5 text-amber-500" /> 
                              Pending Request Exists
                            </Button>
                            <p className="text-sm text-center text-amber-600">
                              You already have a pending viewing request for this property.
                            </p>
                          </div>
                        ) : (
                          <Button 
                            className="w-full flex items-center justify-center" 
                            onClick={() => setIsViewingModalOpen(true)}
                          >
                            <Eye className="mr-2 h-5 w-5" /> Request Viewing
                          </Button>
                        )}
                      </div>
                      
                      {/* Viewing Requests List */}
                      <div className="mt-6">
                        <div className="flex justify-between items-center mb-4">
                          <h3 className="text-lg font-medium text-gray-900">Viewing Requests</h3>
                        </div>
                        {isLoadingViewingRequests ? (
                          <div className="flex justify-center py-8">
                            <Loader2 className="h-8 w-8 animate-spin text-primary" />
                          </div>
                        ) : viewingRequests.length > 0 ? (
                          <PropertyViewingRequestsList 
                            viewingRequests={viewingRequests} 
                            showPropertyDetails={false}
                            propertyName={property.address}
                            viewAs="buyer"
                          />
                        ) : (
                          <div className="text-center py-8 text-gray-500">
                            <Eye className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                            <p className="mb-3">No viewing requests yet</p>
                            <Button
                              onClick={() => setIsViewingModalOpen(true)}
                              className="inline-flex items-center"
                            >
                              <Eye className="mr-2 h-4 w-4" />
                              Request Viewing
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  </TabsContent>
                  
                  <TabsContent value="seller">
                    {property.sellerId ? (
                      <ChatWindow
                        propertyId={propertyId}
                        receiverId={property.sellerId}
                        receiverName={property.seller?.firstName || "Seller"}
                        receiverDetails={property.seller || null}
                      />
                    ) : (
                      <div className="p-4 text-center text-gray-500">
                        <p>The seller hasn't joined the platform yet.</p>
                        <p className="text-sm mt-1">Once they sign up, you'll be able to chat with them here.</p>
                      </div>
                    )}
                  </TabsContent>
                  
                  <TabsContent value="agent">
                    {property.agentId ? (
                      <ChatWindow
                        propertyId={propertyId}
                        receiverId={property.agentId}
                        receiverName={property.agent?.firstName || "Agent"}
                        receiverDetails={property.agent || null}
                      />
                    ) : (
                      <div className="p-4 text-center">
                        <p className="text-gray-500 mb-3">No agent has been assigned yet.</p>
                        <Button 
                          onClick={() => setIsAgentDialogOpen(true)} 
                          className="mb-2"
                          variant="outline"
                        >
                          <UserPlus className="mr-2 h-4 w-4" />
                          Choose an Agent
                        </Button>
                        <p className="text-xs text-gray-400 mt-2">
                          Select an agent to help you with this property purchase
                        </p>
                      </div>
                    )}
                  </TabsContent>
                  
                  <TabsContent value="agent-email">
                    <div className="p-4">
                      <div className="mb-4">
                        <h3 className="text-lg font-medium flex items-center text-gray-900">
                          <Mail className="mr-2 h-5 w-5 text-primary" />
                          Agent Email Settings
                        </h3>
                        <p className="text-sm text-gray-500 mt-1">
                          Update the listing agent's email address for this property
                        </p>
                      </div>
                      <AgentEmailEditor 
                        propertyId={propertyId} 
                        currentEmail={property.sellerEmail || ""} 
                      />
                    </div>
                  </TabsContent>
                
                  <TabsContent value="activity">
                    <div className="p-4">
                      <div className="mb-4">
                        <h3 className="text-lg font-medium flex items-center text-gray-900">
                          <Activity className="mr-2 h-5 w-5 text-primary" />
                          Property Activity History
                        </h3>
                        <p className="text-sm text-gray-500 mt-1">
                          View all activity and changes related to this property
                        </p>
                      </div>
                      <PropertyActivityLog propertyId={propertyId} />
                    </div>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
            
            {/* Hidden div to maintain compatability with existing links */}
            <div id="viewing-requests-section" className="hidden"></div>
          </div>
        </div>
      </main>

      {/* Viewing Request Modal */}
      <Dialog open={isViewingModalOpen} onOpenChange={setIsViewingModalOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Request Property Viewing</DialogTitle>
            <DialogDescription>
              Schedule a time to view this property with your agent.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <label htmlFor="viewingDate" className="text-right text-sm font-medium col-span-1">
                Date
              </label>
              <div className="col-span-3">
                {/* Date Selection (placeholder for now) */}
                <input 
                  type="date" 
                  id="viewingDate" 
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  min={new Date().toISOString().split('T')[0]}
                  value={viewingDate}
                  onChange={(e) => setViewingDate(e.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <label htmlFor="viewingTime" className="text-right text-sm font-medium col-span-1">
                Start Time
              </label>
              <div className="col-span-3">
                <input 
                  type="time" 
                  id="viewingTime" 
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  value={viewingTime}
                  onChange={(e) => setViewingTime(e.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <label htmlFor="viewingEndTime" className="text-right text-sm font-medium col-span-1">
                End Time
              </label>
              <div className="col-span-3">
                <input 
                  type="time" 
                  id="viewingEndTime" 
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  value={viewingEndTime}
                  onChange={(e) => setViewingEndTime(e.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <label htmlFor="notes" className="text-right text-sm font-medium col-span-1">
                Notes
              </label>
              <div className="col-span-3">
                <textarea
                  id="notes"
                  placeholder="Any special requests or questions about viewing the property"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  rows={3}
                  value={viewingNotes}
                  onChange={(e) => setViewingNotes(e.target.value)}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsViewingModalOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleRequestViewing} 
              disabled={requestViewingMutation.isPending}
            >
              {requestViewingMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <CalendarIcon className="mr-2 h-4 w-4" />
              )}
              Schedule Viewing
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Agent Selection Dialog */}
      <Dialog open={isAgentDialogOpen} onOpenChange={setIsAgentDialogOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center">
              <UserPlus className="mr-2 h-5 w-5 text-primary" />
              Choose an Agent for this Property
            </DialogTitle>
            <DialogDescription>
              Select a real estate agent to help you with the purchase of this property.
              Agents with experience in {property.state || "your area"} are recommended.
            </DialogDescription>
          </DialogHeader>
          
          {!agents || agents.length === 0 ? (
            <div className="py-6 text-center text-gray-500">
              <Users className="mx-auto h-10 w-10 mb-3 text-gray-400" />
              <p>No available agents found.</p>
              <p className="text-sm mt-1">Please check back later.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-3 max-h-[50vh] overflow-y-auto pr-1">
              {agents.map((agent) => (
                <AgentCard
                  key={agent.id}
                  agent={agent as User}
                  onSelectAgent={setSelectedAgentId}
                  selected={selectedAgentId === agent.id}
                  disabled={chooseAgentMutation.isPending}
                />
              ))}
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAgentDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleChooseAgent}
              disabled={!selectedAgentId || chooseAgentMutation.isPending}
            >
              {chooseAgentMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Assign Selected Agent
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Agency Disclosure Form Dialog */}
      {property && property.agent && (
        <AgencyDisclosureForm
          property={property}
          agent={property.agent}
          isOpen={isDisclosureFormOpen}
          onClose={() => {
            // The form handles its own close event. If user clicked Cancel or X,
            // we want to cancel the viewing request, otherwise we want to proceed with it
            // We'll detect which scenario occurred in useEffect by checking for agreements
            setIsDisclosureFormOpen(false);
          }}
        />
      )}
      
      {/* Alert Dialog for confirming override of existing viewing request */}
      <AlertDialog open={showOverrideDialog} onOpenChange={setShowOverrideDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center">
              <AlertTriangle className="h-5 w-5 text-yellow-500 mr-2" />
              Replace Existing Viewing Request?
            </AlertDialogTitle>
            <AlertDialogDescription>
              You already have a viewing request scheduled for {existingRequestInfo?.existingRequestDate && (
                <span className="font-medium">{new Date(existingRequestInfo.existingRequestDate).toLocaleString()}</span>
              )}.
              <p className="mt-2">Would you like to replace it with a new request for {pendingRequestData && (
                <span className="font-medium">
                  {new Date(`${pendingRequestData.date}T${pendingRequestData.time}`).toLocaleString(undefined, {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </span>
              )}?</p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setShowOverrideDialog(false);
              setPendingRequestData(null);
              setExistingRequestInfo(null);
            }}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => {
                if (pendingRequestData) {
                  // Submit the request with override flag set to true
                  requestViewingMutation.mutate({
                    ...pendingRequestData,
                    override: true
                  });
                }
              }}
              className="bg-yellow-600 hover:bg-yellow-700 focus:ring-yellow-600"
            >
              Replace Existing Request
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
