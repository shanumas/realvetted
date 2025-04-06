import React, { useState } from "react";
import { useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { PropertyWithParticipants } from "@shared/types";
import { SiteHeader } from "@/components/layout/site-header";
import { ChatWindow } from "@/components/chat/chat-window";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
  Mail,
  Briefcase,
  Award,
  Link,
  FileText,
  ListTodo,
  ImageIcon,
  ChevronLeft,
  ChevronRight,
  Activity,
  FileSignature,
  File,
  MessageSquare,
} from "lucide-react";
import { PropertyActivityLog } from "@/components/property-activity-log";
import { SellerAgencyDisclosureForm } from "@/components/seller-agency-disclosure-form";
import { PropertyViewingRequestsList } from "@/components/property-viewing-requests-list";

export default function SellerPropertyView() {
  const [, params] = useRoute("/seller/property-view/:id");
  const propertyId = params?.id ? parseInt(params.id) : 0;
  const [activeTab, setActiveTab] = useState<string>("overview");
  const [currentImageIndex, setCurrentImageIndex] = useState<number>(0);
  const [isSigningFormOpen, setIsSigningFormOpen] = useState<boolean>(false);
  const [selectedAgreement, setSelectedAgreement] = useState<any>(null);
  const { toast } = useToast();

  const { data: property, isLoading } = useQuery<PropertyWithParticipants>({
    queryKey: [`/api/properties/${propertyId}`],
    queryFn: getQueryFn({ on401: "throw" }),
  });

  const { data: agreementsResponse, isLoading: isLoadingAgreements } = useQuery<{success: boolean, data: any[]}>({
    queryKey: [`/api/properties/${propertyId}/agreements`],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!propertyId,
  });
  
  // Extract the agreements array from the response
  const agreements = agreementsResponse?.success && agreementsResponse?.data ? agreementsResponse.data : [];

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

  const buyerId = property.buyer?.id;
  const agentId = property.agent?.id;

  return (
    <div className="min-h-screen bg-gray-50">
      <SiteHeader />

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        {/* Header with Status Tag */}
        <div className="mb-6 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{property.address}</h1>
            <p className="text-gray-600">{property.city}, {property.state} {property.zip}</p>
          </div>
          <div>
            <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
              property.status === "active" ? "bg-green-100 text-green-800" :
              property.status === "pending" ? "bg-yellow-100 text-yellow-800" :
              property.status === "sold" ? "bg-blue-100 text-blue-800" :
              "bg-gray-100 text-gray-800"
            }`}>
              {property.status?.charAt(0).toUpperCase() + property.status?.slice(1) || "Unknown"}
            </span>
          </div>
        </div>

        <div className="lg:grid lg:grid-cols-3 lg:gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="w-full grid grid-cols-4">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="documents">
                  <FileSignature className="mr-1 h-4 w-4" />
                  Documents
                </TabsTrigger>
                <TabsTrigger value="viewings">
                  <Calendar className="mr-1 h-4 w-4" />
                  Viewings
                </TabsTrigger>
                <TabsTrigger value="activity">
                  <Activity className="mr-1 h-4 w-4" />
                  Activity
                </TabsTrigger>
              </TabsList>

              {/* Property Overview Tab */}
              <TabsContent value="overview">
                <Card>
                  <CardContent className="p-0">
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
                                width: `${property.imageUrls.length * 100}%`,
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
                                onClick={() =>
                                  setCurrentImageIndex((prev) =>
                                    prev > 0
                                      ? prev - 1
                                      : property.imageUrls!.length - 1,
                                  )
                                }
                                aria-label="Previous image"
                              >
                                <ChevronLeft className="h-6 w-6" />
                              </button>
                              <button
                                className="absolute right-0 top-1/2 transform -translate-y-1/2 bg-black/50 text-white p-2 rounded-l-md hover:bg-black/70 transition-colors"
                                onClick={() =>
                                  setCurrentImageIndex((prev) =>
                                    prev < property.imageUrls!.length - 1
                                      ? prev + 1
                                      : 0,
                                  )
                                }
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
                                    currentImageIndex === index
                                      ? "bg-white"
                                      : "bg-white/50"
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
                        <h3 className="text-lg leading-6 font-medium text-gray-900">
                          Property Details
                        </h3>
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
                            {property.price
                              ? `$${property.price.toLocaleString()}`
                              : "Not specified"}
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
                            {property.squareFeet
                              ? `${property.squareFeet.toLocaleString()} sqft`
                              : "Not specified"}
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
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Documents Tab */}
              <TabsContent value="documents">
                <Card>
                  <CardContent className="p-4">
                    <div className="mb-4">
                      <h3 className="text-lg font-medium flex items-center text-gray-900">
                        <FileSignature className="mr-2 h-5 w-5 text-primary" />
                        Property Documents
                      </h3>
                      <p className="text-sm text-gray-500 mt-1">
                        View and sign property-related documents
                      </p>
                    </div>

                    {isLoadingAgreements ? (
                      <div className="flex justify-center my-8">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                      </div>
                    ) : !agreements || agreements.length === 0 ? (
                      <div className="text-center py-8 text-gray-500">
                        <File className="h-12 w-12 mx-auto mb-2 text-gray-300" />
                        <p>No documents available yet.</p>
                      </div>
                    ) : (
                      <div className="divide-y">
                        {agreements.map((agreement) => (
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
                                    : "Document"}
                                </span>
                                <div className="flex items-center mt-1">
                                  <span
                                    className={`inline-flex items-center px-2 py-0.5 text-xs rounded-full ${
                                      agreement.status === "draft"
                                        ? "bg-gray-100 text-gray-800"
                                        : agreement.status ===
                                          "pending_buyer"
                                          ? "bg-blue-100 text-blue-800"
                                          : agreement.status ===
                                              "signed_by_buyer"
                                            ? "bg-green-100 text-green-800"
                                            : agreement.status ===
                                                "pending_seller"
                                              ? "bg-orange-100 text-orange-800"
                                              : "bg-gray-100 text-gray-800"
                                    }`}
                                  >
                                    {agreement.status === "draft"
                                      ? "Draft"
                                      : agreement.status === "pending_buyer"
                                        ? "Awaiting Buyer"
                                        : agreement.status ===
                                          "signed_by_buyer"
                                          ? "Signed by Buyer"
                                          : agreement.status ===
                                              "pending_seller"
                                            ? "Awaiting Your Signature"
                                            : agreement.status}
                                  </span>
                                </div>
                              </div>
                            </div>

                            <Button
                              size="sm"
                              variant={
                                agreement.status === "signed_by_buyer"
                                  ? "default"
                                  : "outline"
                              }
                              onClick={() => {
                                if (
                                  agreement.status === "signed_by_buyer" &&
                                  agreement.type === "agency_disclosure"
                                ) {
                                  // Open the signing dialog for seller
                                  // Format the agreement document URL before storing
                                  // Add debug logging for agreement document URL
                                  console.log("Original agreement:", agreement);
                                  console.log("Document URL before formatting:", agreement.documentUrl);
                                  
                                  // Try to get the latest document for this agreement from the API
                                  const getLatestDocument = async () => {
                                    try {
                                      const response = await fetch(`/api/agreements/${agreement.id}/document`);
                                      if (response.ok) {
                                        const data = await response.json();
                                        if (data.success && data.data && data.data.documentUrl) {
                                          console.log("Found document URL from API:", data.data.documentUrl);
                                          return data.data.documentUrl;
                                        }
                                      }
                                    } catch (error) {
                                      console.error("Error fetching document:", error);
                                    }
                                    return agreement.documentUrl;
                                  };
                                  
                                  // Use the existing document URL for now
                                  const formattedUrl = agreement.documentUrl ? 
                                    (agreement.documentUrl.startsWith('/uploads') || agreement.documentUrl.startsWith('http') ? 
                                      agreement.documentUrl : 
                                      `/uploads/${agreement.documentUrl}`) : 
                                    null;
                                    
                                  console.log("Formatted document URL:", formattedUrl);
                                  
                                  const formattedAgreement = {
                                    ...agreement,
                                    documentUrl: formattedUrl
                                  };
                                  
                                  // Try to get the latest document in the background
                                  getLatestDocument().then(latestUrl => {
                                    if (latestUrl && (!formattedUrl || latestUrl !== agreement.documentUrl)) {
                                      const finalUrl = latestUrl.startsWith('/uploads') || latestUrl.startsWith('http') 
                                        ? latestUrl 
                                        : `/uploads/${latestUrl}`;
                                      console.log("Updated document URL from API:", finalUrl);
                                      setSelectedAgreement({
                                        ...agreement,
                                        documentUrl: finalUrl
                                      });
                                    }
                                  });
                                  
                                  setSelectedAgreement(formattedAgreement);
                                  setIsSigningFormOpen(true);
                                } else {
                                  // Just view the agreement document if available
                                  if (agreement.documentUrl) {
                                    // Make sure the URL is properly formed with the /uploads prefix if needed
                                    const documentUrl = agreement.documentUrl.startsWith('/uploads') || 
                                                        agreement.documentUrl.startsWith('http') ? 
                                                        agreement.documentUrl : 
                                                        `/uploads/${agreement.documentUrl}`;
                                    console.log("Opening document URL:", documentUrl);
                                    window.open(documentUrl, "_blank");
                                  } else {
                                    toast({
                                      title: "Document Not Available",
                                      description: "The document is not available for preview at this time.",
                                      variant: "destructive",
                                    });
                                  }
                                }
                              }}
                            >
                              {agreement.status === "signed_by_buyer" &&
                              agreement.type === "agency_disclosure"
                                ? "Sign"
                                : "View"}
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Viewings Tab */}
              <TabsContent value="viewings">
                <Card>
                  <CardContent className="p-4">
                    <div className="mb-4">
                      <h3 className="text-lg font-medium flex items-center text-gray-900">
                        <Calendar className="mr-2 h-5 w-5 text-primary" />
                        Property Viewing Requests
                      </h3>
                      <p className="text-sm text-gray-500 mt-1">
                        Manage and respond to viewing requests from potential buyers
                      </p>
                    </div>
                    
                    <PropertyViewingRequestsList 
                      propertyId={propertyId}
                      viewAs="seller"
                    />
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Activity Tab */}
              <TabsContent value="activity">
                <Card>
                  <CardContent className="p-4">
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
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>

          {/* Sidebar */}
          <div className="lg:col-span-1 mt-8 lg:mt-0">
            {/* Buyer Info Card */}
            {property.buyer && (
              <Card className="mb-4">
                <CardContent className="p-4">
                  <h3 className="text-lg font-medium text-gray-900 mb-4">Buyer Information</h3>
                  <div className="space-y-3">
                    <div className="flex items-center">
                      <div className="bg-blue-50 p-2 rounded-full mr-3">
                        <Person className="h-5 w-5 text-blue-500" />
                      </div>
                      <div>
                        <div className="text-sm font-medium">
                          {property.buyer.firstName} {property.buyer.lastName}
                        </div>
                        <div className="text-xs text-gray-500">Buyer</div>
                      </div>
                    </div>
                    <div className="flex items-center text-sm">
                      <Mail className="h-4 w-4 text-gray-400 mr-2" />
                      <span>{property.buyer.email}</span>
                    </div>
                    {property.buyer.phone && (
                      <div className="flex items-center text-sm">
                        <Phone className="h-4 w-4 text-gray-400 mr-2" />
                        <span>{property.buyer.phone}</span>
                      </div>
                    )}
                    <Button 
                      className="w-full" 
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        // Open chat with buyer
                        setActiveTab("buyer");
                      }}
                    >
                      <MessageSquare className="mr-1 h-4 w-4" />
                      Chat with Buyer
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Agent Info Card */}
            {property.agent && (
              <Card className="mb-4">
                <CardContent className="p-4">
                  <h3 className="text-lg font-medium text-gray-900 mb-4">Agent Information</h3>
                  <div className="space-y-3">
                    <div className="flex items-center">
                      <div className="bg-green-50 p-2 rounded-full mr-3">
                        <Briefcase className="h-5 w-5 text-green-500" />
                      </div>
                      <div>
                        <div className="text-sm font-medium">
                          {property.agent.firstName} {property.agent.lastName}
                        </div>
                        <div className="text-xs text-gray-500">Real Estate Agent</div>
                      </div>
                    </div>
                    <div className="flex items-center text-sm">
                      <Mail className="h-4 w-4 text-gray-400 mr-2" />
                      <span>{property.agent.email}</span>
                    </div>
                    {property.agent.phone && (
                      <div className="flex items-center text-sm">
                        <Phone className="h-4 w-4 text-gray-400 mr-2" />
                        <span>{property.agent.phone}</span>
                      </div>
                    )}
                    <Button 
                      className="w-full" 
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        // Open chat with agent
                        setActiveTab("agent");
                      }}
                    >
                      <MessageSquare className="mr-1 h-4 w-4" />
                      Chat with Agent
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Chat windows */}
            <Card>
              <CardContent className="p-0">
                <Tabs defaultValue="buyer" className="w-full">
                  <TabsList className="w-full grid grid-cols-2">
                    <TabsTrigger value="buyer">Buyer Chat</TabsTrigger>
                    <TabsTrigger value="agent">Agent Chat</TabsTrigger>
                  </TabsList>
                  <TabsContent value="buyer" className="p-0">
                    <div className="h-[500px]">
                      {buyerId ? (
                        <ChatWindow
                          propertyId={propertyId}
                          receiverId={buyerId}
                          receiverName={`${property.buyer?.firstName || 'Buyer'} ${property.buyer?.lastName || ''}`}
                        />
                      ) : (
                        <div className="flex items-center justify-center h-full text-gray-500 p-4 text-center">
                          <div>
                            <MessageSquare className="h-12 w-12 mx-auto mb-2 text-gray-300" />
                            <p>No buyer is associated with this property yet.</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </TabsContent>
                  <TabsContent value="agent" className="p-0">
                    <div className="h-[500px]">
                      {agentId ? (
                        <ChatWindow
                          propertyId={propertyId}
                          receiverId={agentId}
                          receiverName={`${property.agent?.firstName || 'Agent'} ${property.agent?.lastName || ''}`}
                        />
                      ) : (
                        <div className="flex items-center justify-center h-full text-gray-500 p-4 text-center">
                          <div>
                            <MessageSquare className="h-12 w-12 mx-auto mb-2 text-gray-300" />
                            <p>No agent is assigned to this property yet.</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>

      {/* Seller Agency Disclosure Form Modal */}
      {property && selectedAgreement && (
        <SellerAgencyDisclosureForm
          isOpen={isSigningFormOpen}
          onClose={() => setIsSigningFormOpen(false)}
          property={property}
          agreementId={selectedAgreement.id}
          documentUrl={selectedAgreement.documentUrl}
        />
      )}
    </div>
  );
}

// Helper component for the Person icon since it's not in lucide-react
const Person = ({ className }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
    <circle cx="12" cy="7" r="4"></circle>
  </svg>
);