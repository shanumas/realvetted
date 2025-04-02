import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRoute } from "wouter";
import { getQueryFn } from "@/lib/queryClient";
import { Property } from "@shared/schema";
import { PropertyWithParticipants } from "@shared/types";
import { SiteHeader } from "@/components/layout/site-header";
import { ChatWindow } from "@/components/chat/chat-window";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Home, Bed, Bath, Square, Tag, Calendar } from "lucide-react";

export default function PropertyDetail() {
  const [, params] = useRoute("/buyer/property/:id");
  const propertyId = params?.id ? parseInt(params.id) : 0;
  const [activeTab, setActiveTab] = useState<string>("seller");

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
                
                {/* Property Images (placeholder) */}
                <div className="px-4 py-5 sm:px-6">
                  <div className="bg-gray-200 h-64 rounded-lg overflow-hidden">
                    <div className="w-full h-full flex items-center justify-center text-gray-400">
                      <Home className="h-16 w-16" />
                    </div>
                  </div>
                </div>
                
                {/* Property Details */}
                <div className="border-t border-gray-200">
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
                    <TabsList className="w-full grid grid-cols-2">
                      <TabsTrigger value="seller" className="data-[state=active]:border-b-2 data-[state=active]:border-primary">
                        Seller Chat
                      </TabsTrigger>
                      <TabsTrigger value="agent" className="data-[state=active]:border-b-2 data-[state=active]:border-primary">
                        Agent Chat
                      </TabsTrigger>
                    </TabsList>
                  </div>
                  
                  <TabsContent value="seller">
                    {property.sellerId ? (
                      <ChatWindow
                        propertyId={propertyId}
                        receiverId={property.sellerId}
                        receiverName={property.seller?.firstName || "Seller"}
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
                      />
                    ) : (
                      <div className="p-4 text-center text-gray-500">
                        <p>No agent has been assigned yet.</p>
                        <p className="text-sm mt-1">Once an agent claims this property, you'll be able to chat with them here.</p>
                      </div>
                    )}
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
