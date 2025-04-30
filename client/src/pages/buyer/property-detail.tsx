import React, { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { getQueryFn, apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { Property, User } from "@shared/schema";
import {
  PropertyWithParticipants,
  ViewingRequestWithParticipants,
} from "@shared/types";
import { initEmailJS, sendViewingRequestEmail } from "@/services/email-service";
import { BRBCPdfViewer } from "@/components/brbc-pdf-viewer";

// Define the Agreement interface for checking BRBC agreements
interface Agreement {
  id: number;
  propertyId: number | null;
  buyerId: number;
  agentId: number | null;
  type: string;
  status: string;
  date: string;
  documentUrl: string | null;
  isGlobal: boolean;
}
import { SiteHeader } from "@/components/layout/site-header";
import { ChatWindow } from "@/components/chat/chat-window";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
// Removed disclosure form imports
import {
  Loader2,
  Home,
  Bed,
  Bath,
  Square,
  Tag,
  Calendar,
  Building,
  Phone,
  Briefcase,
  Award,
  Link,
  FileText,
  ListTodo,
  ImageIcon,
  ChevronLeft,
  ChevronRight,
  Activity,
  UserPlus,
  Users,
  MessageCircle,
  Eye,
  Calendar as CalendarIcon,
  AlertTriangle,
  Mail,
} from "lucide-react";
import { PropertyActivityLog } from "@/components/property-activity-log";
import { AgentCard } from "@/components/agent-card";
import { PropertyViewingRequestsList } from "@/components/property-viewing-requests-list";
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

export default function BuyerPropertyDetail() {
  const [, params] = useRoute("/buyer/property/:id");
  const propertyId = params?.id ? parseInt(params.id) : 0;
  const [activeTab, setActiveTab] = useState<string>("viewings");
  const [isAgentDialogOpen, setIsAgentDialogOpen] = useState<boolean>(false);
  const [selectedAgentId, setSelectedAgentId] = useState<number | null>(null);
  const [isViewingModalOpen, setIsViewingModalOpen] = useState<boolean>(false);
  const [viewingDate, setViewingDate] = useState<string>("");
  const [viewingTime, setViewingTime] = useState<string>("");
  const [viewingEndTime, setViewingEndTime] = useState<string>("");
  const [viewingNotes, setViewingNotes] = useState<string>("");
  // State for disclosure form removed
  const [viewingRequestData, setViewingRequestData] = useState<{
    date: string;
    time: string;
    endTime: string;
    notes: string;
  } | null>(null);

  // State for override confirmation dialog
  const [showOverrideDialog, setShowOverrideDialog] = useState<boolean>(false);
  const [pendingRequestData, setPendingRequestData] = useState<{
    date: string;
    time: string;
    endTime: string;
    notes: string;
    listingAgentEmail?: string;
  } | null>(null);
  const [existingRequestInfo, setExistingRequestInfo] = useState<{
    existingRequestId?: number;
    existingRequestDate?: string;
  } | null>(null);
  const [isBRBCPdfViewerOpen, setIsBRBCPdfViewerOpen] =
    useState<boolean>(false);

  const { toast } = useToast();
  const { user } = useAuth();

  // Fetch available agents
  const { data: agents } = useQuery<
    Array<{
      id: number;
      firstName: string | null;
      lastName: string | null;
      state: string | null;
      city: string | null;
      email: string;
      phone: string | null;
      profilePhotoUrl: string | null;
      profileStatus: string;
    }>
  >({
    queryKey: ["/api/agents"],
    queryFn: getQueryFn({ on401: "throw" }),
  });

  // Mutation to choose an agent
  const chooseAgentMutation = useMutation({
    mutationFn: async (agentId: number) => {
      const res = await apiRequest(
        "PUT",
        `/api/properties/${propertyId}/choose-agent`,
        { agentId },
      );
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: "Agent assigned",
        description:
          "The agent has been assigned to your property and notified.",
        variant: "default",
      });
      queryClient.invalidateQueries({
        queryKey: [`/api/properties/${propertyId}`],
      });
      setIsAgentDialogOpen(false);
      setSelectedAgentId(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to assign agent",
        description: error.message,
        variant: "destructive",
      });
    },
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

  // Initialize EmailJS when component mounts
  useEffect(() => {
    initEmailJS();
  }, []);

  // Mutation to request a property viewing
  const requestViewingMutation = useMutation({
    mutationFn: async (data: {
      date: string;
      time: string;
      endTime: string;
      notes: string;
      override?: boolean;
      listingAgentEmail?: string;
    }) => {
      console.log("Requesting property viewing with data:", {
        propertyId,
        date: data.date,
        time: data.time,
        endTime: data.endTime,
        notes: data.notes,
        override: data.override,
      });

      // Create request payload with proper date formatting
      const payload = {
        propertyId: propertyId,
        requestedDate: `${data.date}T${data.time}:00`,
        requestedEndDate: data.endTime
          ? `${data.date}T${data.endTime}:00`
          : undefined,
        notes: data.notes,
        override: data.override || false,
        listingAgentEmail: data.listingAgentEmail, // Include agent email if available
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
    onSuccess: async (data) => {
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

      // Fetch the user's agreements and documents for email attachments
      const hasBrbcSigned = buyerAgreements?.some(
        (a) => a.type === "global_brbc",
      );

      // Send notification email
      if (user && property) {
        try {
          // Prepare email data
          const emailData = {
            to_email: "shanumas@gmail.com", // Fixed recipient as specified in the requirements
            from_name:
              `${user.firstName || ""} ${user.lastName || ""}`.trim() ||
              user.email,
            message: `A new tour request has been submitted for property at ${property.address}.
            Requested date: ${viewingDate} from ${viewingTime} to ${viewingEndTime || "unspecified"}
            Notes: ${viewingNotes || "No additional notes provided"}`,
            buyer_name:
              `${user.firstName || ""} ${user.lastName || ""}`.trim() ||
              "Buyer",
            buyer_email: user.email,
            buyer_phone: user.phone || undefined,
            property_address: property.address,
            brbc_signed: hasBrbcSigned,
            kyc_approved: user.profileStatus === "verified",
            prequalification_approved: !!user.prequalificationValidated,
            property_id: propertyId,
            // We would need to fetch and convert documents to base64 for proper attachment
            // For now, we'll just note their status in the email body
          };

          // Send the email
          const emailSent = await sendViewingRequestEmail(emailData);

          if (emailSent) {
            console.log("Tour request notification email sent successfully");
          } else {
            console.error("Failed to send tour request notification email");
          }
        } catch (emailError) {
          console.error("Error sending email notification:", emailError);
        }
      }

      // Invalidate queries to refresh data
      queryClient.invalidateQueries({
        queryKey: [`/api/properties/${propertyId}`],
      });
      queryClient.invalidateQueries({
        queryKey: [`/api/properties/${propertyId}/logs`],
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/viewing-requests/buyer"],
      });
      queryClient.invalidateQueries({
        queryKey: [`/api/properties/${propertyId}/viewing-requests`],
      });

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

      // BRBC agreement check removed

      // Since buyers should be able to make multiple viewing requests,
      // we'll bypass the "already exists" error by adding the property here
      if (error.message?.includes("already exists")) {
        console.log(
          "Bypassing 'already exists' error - allowing multiple viewing requests",
        );

        // Switch to the viewings tab to show existing requests
        setActiveTab("viewings");
      } else if (error.response?.status === 403) {
        // Specific handling for permission errors
        toast({
          title: "Permission Error",
          description:
            error.message ||
            "You don't have permission to request a viewing for this property.",
          variant: "destructive",
        });

        console.log("Property status:", property?.status);
        console.log("Current user role:", user?.role);

        // Check property status
        if (property?.status !== "active" && property?.status !== "pending") {
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
          description: `Error: ${error.message || "Unknown error"}${error.response?.status ? ` (Status: ${error.response.status})` : ""}`,
          variant: "destructive",
        });
      }
    },
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
    const requestData = {
      date: viewingDate,
      time: viewingTime,
      endTime: viewingEndTime,
      notes: viewingNotes,
      listingAgentEmail: property.listingAgentEmail,
    };

    console.log(" property.listingAgentEmail :", property.listingAgentEmail);

    setViewingRequestData(requestData);

    // Close the viewing modal
    setIsViewingModalOpen(false);

    // Disclosure form check removed
    // Submit viewing request directly instead
    // Create a properly typed object for the mutation
    const mutationData = {
      date: requestData.date,
      time: requestData.time,
      endTime: requestData.endTime,
      notes: requestData.notes,
      // Explicitly convert null to undefined
      listingAgentEmail:
        typeof requestData.listingAgentEmail === "string"
          ? requestData.listingAgentEmail
          : undefined,
      override: true,
    };
    requestViewingMutation.mutate(mutationData);
  };

  // Disclosure form related handlers removed

  const { data: property, isLoading } = useQuery<PropertyWithParticipants>({
    queryKey: [`/api/properties/${propertyId}`],
    queryFn: getQueryFn({ on401: "throw" }),
  });

  // Fetch buyer agreements (including BRBC)
  const { data: buyerAgreements = [] } = useQuery<Agreement[]>({
    queryKey: ["/api/buyer/agreements"],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!user?.id,
  });

  // Fetch viewing requests for this property
  const { data: viewingRequests = [], isLoading: isLoadingViewingRequests } =
    useQuery<ViewingRequestWithParticipants[]>({
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
            <h3 className="text-lg font-medium text-gray-900">
              Property not found
            </h3>
            <p className="mt-1 text-gray-500">
              The property you're looking for doesn't exist or you don't have
              access to it.
            </p>
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
                      {property.status === "active"
                        ? "Active"
                        : property.status}
                    </span>
                  </div>
                </div>

                {/* Property Details */}
                <div className="border-t border-gray-200">
                  <div className="px-4 py-5 sm:px-6 border-b border-gray-200">
                    <h3 className="text-lg leading-6 font-medium text-gray-900">
                      Property Details
                    </h3>
                  </div>
                  <dl>
                    <div className="bg-gray-50 px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                      <dt className="text-sm font-medium text-gray-500 flex items-center">
                        <Home className="mr-2 h-4 w-4" /> Address
                      </dt>
                      <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                        {property.address}
                      </dd>
                    </div>
                    <div className="bg-gray-50 px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                      <dt className="text-sm font-medium text-gray-500 flex items-center">
                        <Home className="mr-2 h-4 w-4" /> Beds
                      </dt>
                      <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                        {property.bedrooms}
                      </dd>
                    </div>
                    <div className="bg-gray-50 px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                      <dt className="text-sm font-medium text-gray-500 flex items-center">
                        <Home className="mr-2 h-4 w-4" /> Bath
                      </dt>
                      <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                        {property.bathrooms}
                      </dd>
                    </div>
                    <div className="bg-gray-50 px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                      <dt className="text-sm font-medium text-gray-500 flex items-center">
                        <Home className="mr-2 h-4 w-4" /> Price
                      </dt>
                      <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                        {property.price}
                      </dd>
                    </div>
                    {property.propertyUrl && (
                      <div className="bg-white px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
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

                  <div className="px-4 py-5 sm:px-6 border-t border-b border-gray-200 mt-6">
                    <h3 className="text-lg leading-6 font-medium text-gray-900">
                      Listing Agent Information
                    </h3>
                  </div>
                  <dl>
                    <div className="bg-gray-50 px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                      <dt className="text-sm font-medium text-gray-500 flex items-center">
                        <Building className="mr-2 h-4 w-4" /> Agent name
                      </dt>
                      <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                        {property.listingAgentName}
                      </dd>
                    </div>

                    {/* Display agent email */}

                    <div className="bg-white px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                      <dt className="text-sm font-medium text-gray-500 flex items-center">
                        <Mail className="mr-2 h-4 w-4" /> Email
                      </dt>
                      <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                        <a
                          href={`mailto:${property.listingAgentEmail || property.sellerEmail}`}
                          className="text-blue-600 hover:underline"
                        >
                          {property.listingAgentEmail}
                        </a>
                      </dd>
                    </div>

                    <div className="bg-gray-50 px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                      <dt className="text-sm font-medium text-gray-500 flex items-center">
                        <Phone className="mr-2 h-4 w-4" /> Phone
                      </dt>
                      <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                        <a
                          href={`tel:${property.listingAgentPhone || property.sellerPhone}`}
                          className="text-blue-600 hover:underline"
                        >
                          {property.listingAgentPhone}
                        </a>
                      </dd>
                    </div>

                    <div className="bg-white px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                      <dt className="text-sm font-medium text-gray-500 flex items-center">
                        <Briefcase className="mr-2 h-4 w-4" /> Company
                      </dt>
                      <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                        {property.listingAgentCompany}
                      </dd>
                    </div>

                    <div className="bg-gray-50 px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                      <dt className="text-sm font-medium text-gray-500 flex items-center">
                        <Award className="mr-2 h-4 w-4" /> License #
                      </dt>
                      <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                        {property.listingAgentLicenseNo}
                      </dd>
                    </div>
                  </dl>
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
                    <TabsList className="w-full grid grid-cols-3">
                      <TabsTrigger
                        value="viewings"
                        className="data-[state=active]:border-b-2 data-[state=active]:border-primary"
                      >
                        <span className="flex items-center">
                          <Eye className="mr-1 h-4 w-4" />
                          Viewings
                        </span>
                      </TabsTrigger>

                      <TabsTrigger
                        value="agent"
                        className="data-[state=active]:border-b-2 data-[state=active]:border-primary"
                      >
                        Buyer's Agent Chat
                      </TabsTrigger>

                      <TabsTrigger
                        value="activity"
                        className="data-[state=active]:border-b-2 data-[state=active]:border-primary"
                      >
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
                          Schedule a tour
                        </h3>
                        <p className="text-sm text-gray-500 mt-1">
                          Request a property tour with your agent at your
                          preferred date and time.
                        </p>
                      </div>

                      {/* Viewing Request Button */}
                      <div className="mb-6">
                        {/* Always allow creating viewing requests, but show a note if there's a pending one */}
                        {viewingRequests.some(
                          (request) => request.status === "pending",
                        ) ? (
                          <div className="flex flex-col gap-3">
                            <Button
                              className="w-full flex items-center justify-center"
                              onClick={() => setIsViewingModalOpen(true)}
                              disabled={
                                !buyerAgreements?.some(
                                  (a) => a.type === "global_brbc",
                                )
                              }
                            >
                              <Eye className="mr-2 h-5 w-5" /> Request Another
                              Tour
                            </Button>
                            {!buyerAgreements?.some(
                              (a) => a.type === "global_brbc",
                            ) && (
                              <p className="text-sm text-center text-amber-600 mt-2">
                                <AlertTriangle className="inline-block mr-1 h-4 w-4 text-amber-500" />
                                Please sign the Buyer Representation Agreement
                                to request viewings.
                              </p>
                            )}
                            <p className="text-sm text-center text-amber-600">
                              <AlertTriangle className="inline-block mr-1 h-4 w-4 text-amber-500" />
                              Note: You already have a pending viewing request
                              for this property.
                            </p>
                          </div>
                        ) : (
                          <div className="flex flex-col gap-3">
                            <Button
                              className="w-full flex items-center justify-center"
                              onClick={() => setIsViewingModalOpen(true)}
                              disabled={
                                !buyerAgreements?.some(
                                  (a) => a.type === "global_brbc",
                                )
                              }
                            >
                              <Eye className="mr-2 h-5 w-5" /> Request Tour
                            </Button>
                            {!buyerAgreements?.some(
                              (a) => a.type === "global_brbc",
                            ) && (
                              <div className="text-sm text-center text-amber-600 mt-2">
                                <p className="mb-1">
                                  <AlertTriangle className="inline-block mr-1 h-4 w-4 text-amber-500" />
                                  Please sign the Buyer Representation Agreement
                                  to request viewings.
                                </p>
                                <Button
                                  variant="link"
                                  size="sm"
                                  className="text-amber-700 p-0 h-auto font-medium underline"
                                  onClick={() => setIsBRBCPdfViewerOpen(true)}
                                >
                                  Sign Representation Agreement
                                </Button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Tour Requests List */}
                      <div className="mt-6">
                        <div className="flex justify-between items-center mb-4">
                          <h3 className="text-lg font-medium text-gray-900">
                            Tour Requests
                          </h3>
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
                            propertyId={propertyId}
                            viewAs="buyer"
                          />
                        ) : (
                          <div className="text-center py-8 text-gray-500">
                            <Eye className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                            <p className="mb-3">No tour requests yet</p>
                          </div>
                        )}
                      </div>
                    </div>
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
                        <p className="text-gray-500 mb-3">
                          No agent has been assigned yet.
                        </p>
                        <Button
                          onClick={() => setIsAgentDialogOpen(true)}
                          className="mb-2"
                          variant="outline"
                        >
                          <UserPlus className="mr-2 h-4 w-4" />
                          Choose an Agent
                        </Button>
                        <p className="text-xs text-gray-400 mt-2">
                          Select an agent to help you with this property
                          purchase
                        </p>
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="activity">
                    <div className="p-4">
                      <div className="mb-4">
                        <h3 className="text-lg font-medium flex items-center text-gray-900">
                          <Activity className="mr-2 h-5 w-5 text-primary" />
                          Property Activity
                        </h3>
                        <p className="text-sm text-gray-500 mt-1">
                          Track all interactions and updates related to this
                          property.
                        </p>
                      </div>
                      <div className="mt-4">
                        <PropertyActivityLog propertyId={propertyId} />
                      </div>
                    </div>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>

            {/* Hidden div to maintain compatability with existing links */}
            <div
              id="viewing-requests-section"
              className="absolute -top-20"
              aria-hidden="true"
            ></div>
          </div>
        </div>
      </main>

      {/* Tour Request Modal */}
      <Dialog open={isViewingModalOpen} onOpenChange={setIsViewingModalOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Request Property Tour</DialogTitle>
            <DialogDescription>
              Schedule a time to tour this property with your agent.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <label
                htmlFor="viewingDate"
                className="text-right text-sm font-medium col-span-1"
              >
                Date
              </label>
              <div className="col-span-3">
                {/* Date Selection (placeholder for now) */}
                <input
                  type="date"
                  id="viewingDate"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  min={new Date().toISOString().split("T")[0]}
                  value={viewingDate}
                  onChange={(e) => setViewingDate(e.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <label
                htmlFor="viewingTime"
                className="text-right text-sm font-medium col-span-1"
              >
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
              <label
                htmlFor="viewingEndTime"
                className="text-right text-sm font-medium col-span-1"
              >
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
              <label
                htmlFor="notes"
                className="text-right text-sm font-medium col-span-1"
              >
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
            <Button
              variant="outline"
              onClick={() => setIsViewingModalOpen(false)}
            >
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
              Schedule Tour
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
              Select a real estate agent to help you with the purchase of this
              property. Agents with experience in{" "}
              {property.state || "your area"} are recommended.
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
            <Button
              variant="outline"
              onClick={() => setIsAgentDialogOpen(false)}
            >
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

      {/* Agency Disclosure Form Dialog - Removed */}

      {/* Alert Dialog for confirming override of existing viewing request */}
      <AlertDialog
        open={showOverrideDialog}
        onOpenChange={setShowOverrideDialog}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center">
              <AlertTriangle className="h-5 w-5 text-yellow-500 mr-2" />
              Replace Existing Tour Request?
            </AlertDialogTitle>
            <AlertDialogDescription>
              You already have a viewing request scheduled for{" "}
              {existingRequestInfo?.existingRequestDate && (
                <span className="font-medium">
                  {new Date(
                    existingRequestInfo.existingRequestDate,
                  ).toLocaleString()}
                </span>
              )}
              .
              <p className="mt-2">
                Would you like to replace it with a new request for{" "}
                {pendingRequestData && (
                  <span className="font-medium">
                    {new Date(
                      `${pendingRequestData.date}T${pendingRequestData.time}`,
                    ).toLocaleString(undefined, {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </span>
                )}
                ?
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setShowOverrideDialog(false);
                setPendingRequestData(null);
                setExistingRequestInfo(null);
              }}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingRequestData) {
                  // Create a properly typed object for the mutation
                  const mutationData = {
                    date: pendingRequestData.date,
                    time: pendingRequestData.time,
                    endTime: pendingRequestData.endTime,
                    notes: pendingRequestData.notes,
                    // Explicitly convert null to undefined
                    listingAgentEmail:
                      typeof pendingRequestData.listingAgentEmail === "string"
                        ? pendingRequestData.listingAgentEmail
                        : undefined,
                    override: true,
                  };
                  requestViewingMutation.mutate(mutationData);
                }
              }}
              className="bg-yellow-600 hover:bg-yellow-700 focus:ring-yellow-600"
            >
              Replace Existing Request
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* BRBC PDF Viewer */}
      <BRBCPdfViewer
        isOpen={isBRBCPdfViewerOpen}
        onClose={() => setIsBRBCPdfViewerOpen(false)}
        onSigned={() => {
          // Refresh agreements after signing
          queryClient.invalidateQueries({
            queryKey: ["/api/buyer/agreements"],
          });
          toast({
            title: "Agreement Signed",
            description: "Your buyer representation agreement has been signed.",
          });
        }}
      />
    </div>
  );
}
