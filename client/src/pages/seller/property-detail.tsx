import React, { useState } from "react";
import { useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import { PropertyWithParticipants } from "@shared/types";
import { SiteHeader } from "@/components/layout/site-header";
import { ChatWindow } from "@/components/chat/chat-window";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  Loader2, Home, Bed, Bath, Square, Tag, Calendar, Building, Phone, Mail, 
  Briefcase, Award, Link, FileText, ListTodo, ImageIcon, ChevronLeft, ChevronRight,
  Activity, FileSignature, File
} from "lucide-react";
import { PropertyActivityLog } from "@/components/property-activity-log";

export default function SellerPropertyDetail() {
  const [, params] = useRoute("/seller/property/:id");
  const propertyId = params?.id ? parseInt(params.id) : 0;
  const [activeTab, setActiveTab] = useState<string>("buyer");
  const [currentImageIndex, setCurrentImageIndex] = useState<number>(0);

  const { data: property, isLoading } = useQuery<PropertyWithParticipants>({
    queryKey: [`/api/properties/${propertyId}`],
    queryFn: getQueryFn({ on401: "throw" }),
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
                </div>
              </CardContent>
            </Card>
          </div>
          
          {/* Communication Section */}
          <div className="lg:col-span-1">
            <Card>
              <CardContent className="p-0">
                <Tabs 
                  value={activeTab} 
                  onValueChange={setActiveTab} 
                  className="w-full"
                >
                  <div className="border-b border-gray-200">
                    <TabsList className="w-full grid grid-cols-4">
                      <TabsTrigger value="buyer" className="data-[state=active]:border-b-2 data-[state=active]:border-primary">
                        Buyer Chat
                      </TabsTrigger>
                      <TabsTrigger value="agent" className="data-[state=active]:border-b-2 data-[state=active]:border-primary">
                        Agent Chat
                      </TabsTrigger>
                      <TabsTrigger value="documents" className="data-[state=active]:border-b-2 data-[state=active]:border-primary">
                        <span className="flex items-center">
                          <FileSignature className="mr-1 h-4 w-4" /> 
                          Documents
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
                  
                  <TabsContent value="buyer">
                    {property.createdBy ? (
                      <ChatWindow
                        propertyId={propertyId}
                        receiverId={property.createdBy}
                        receiverName={property.buyer?.firstName || "Buyer"}
                      />
                    ) : (
                      <div className="p-4 text-center text-gray-500">
                        <p>The buyer hasn't joined the platform yet.</p>
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
                      />
                    ) : (
                      <div className="p-4 text-center text-gray-500">
                        <p>No agent has been assigned yet.</p>
                        <p className="text-sm mt-1">Once an agent claims this property, you'll be able to chat with them here.</p>
                      </div>
                    )}
                  </TabsContent>
                  
                  <TabsContent value="documents">
                    <div className="p-4">
                      <div className="mb-4">
                        <h3 className="text-lg font-medium flex items-center text-gray-900">
                          <FileSignature className="mr-2 h-5 w-5 text-primary" />
                          Property Documents
                        </h3>
                        <p className="text-sm text-gray-500 mt-1">
                          Review and sign documents related to this property
                        </p>
                      </div>
                      
                      {/* Agreements List */}
                      {(() => {
                        const { data, isLoading: loadingAgreements } = useQuery({
                          queryKey: [`/api/properties/${propertyId}/agreements`],
                          queryFn: getQueryFn({ on401: "throw" }),
                        });
                        
                        // Debug output
                        console.log("Property ID:", propertyId);
                        console.log("Agreements data:", data);
                        
                        if (loadingAgreements) {
                          return (
                            <div className="flex items-center justify-center p-4">
                              <Loader2 className="h-5 w-5 animate-spin text-primary/70" />
                              <span className="ml-2 text-sm text-gray-500">Loading documents...</span>
                            </div>
                          );
                        }
                        
                        const agreements = data?.data || [];
                        
                        if (!agreements || agreements.length === 0) {
                          return (
                            <div className="text-center p-6 border border-dashed rounded-md">
                              <File className="mx-auto h-10 w-10 text-gray-400" />
                              <p className="mt-2 text-gray-500">No documents available yet</p>
                              <p className="text-sm mt-1 text-gray-400">Documents will appear here when the agent creates them</p>
                            </div>
                          );
                        }
                        
                        return (
                          <div className="divide-y">
                            {agreements.map((agreement: any) => (
                              <div key={agreement.id} className="py-3 flex justify-between items-center">
                                <div>
                                  <h5 className="font-medium">
                                    {agreement.type === "standard" ? "Buyer Representation Agreement" : "Agency Disclosure Form"}
                                  </h5>
                                  <div className="text-sm text-gray-500 mt-1">
                                    <span className="block">Created: {new Date(agreement.date).toLocaleDateString()}</span>
                                    <div className="flex items-center mt-1">
                                      <span 
                                        className={`inline-flex items-center px-2 py-0.5 text-xs rounded-full ${
                                          agreement.status === "draft" 
                                            ? "bg-gray-100 text-gray-800" 
                                            : agreement.status === "pending_buyer"
                                            ? "bg-blue-100 text-blue-800"
                                            : agreement.status === "signed_by_buyer" 
                                            ? "bg-green-100 text-green-800"
                                            : agreement.status === "pending_seller"
                                            ? "bg-orange-100 text-orange-800"
                                            : "bg-gray-100 text-gray-800"
                                        }`}
                                      >
                                        {agreement.status === "draft" 
                                          ? "Draft" 
                                          : agreement.status === "pending_buyer"
                                          ? "Awaiting Buyer"
                                          : agreement.status === "signed_by_buyer" 
                                          ? "Signed by Buyer" 
                                          : agreement.status === "pending_seller"
                                          ? "Awaiting Your Signature"
                                          : agreement.status}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                                
                                <Button 
                                  size="sm" 
                                  variant="outline"
                                  onClick={() => {
                                    // Open a preview of the agreement
                                    window.open(`/api/agreements/${agreement.id}/preview`, '_blank');
                                  }}
                                >
                                  View
                                </Button>
                              </div>
                            ))}
                          </div>
                        );
                      })()}
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
          </div>
        </div>
      </main>
    </div>
  );
}