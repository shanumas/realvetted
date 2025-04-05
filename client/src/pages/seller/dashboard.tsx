import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { SiteHeader } from "@/components/layout/site-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PropertyCard } from "@/components/property-card";
import { getQueryFn } from "@/lib/queryClient";
import { Property } from "@shared/schema";
import { Loader2, MessageSquare } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ChatWindow } from "@/components/chat/chat-window";
import { Link, useLocation } from "wouter";

export default function SellerDashboard() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [selectedPropertyForChat, setSelectedPropertyForChat] = useState<{ id: number; buyerId: number; buyerName: string } | null>(null);

  const { data: properties, isLoading } = useQuery<Property[]>({
    queryKey: ["/api/properties/by-seller"],
    queryFn: getQueryFn({ on401: "throw" }),
  });

  return (
    <div className="min-h-screen bg-gray-50">
      <SiteHeader />
      
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        {/* Welcome Banner */}
        <Card className="mb-6">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg leading-6 font-medium text-gray-900">
                  Welcome, {user?.firstName || 'Seller'}!
                </h3>
                <p className="mt-1 max-w-2xl text-sm text-gray-500">
                  View your properties and communicate with interested buyers.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        {/* Properties List */}
        <Card>
          <CardHeader>
            <CardTitle>My Properties</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center p-8">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : !properties || properties.length === 0 ? (
              <div className="text-center p-8 text-gray-500">
                <p>You don't have any properties listed yet.</p>
                <p className="text-sm mt-1">Your properties will appear here when a buyer adds your property and you are connected.</p>
              </div>
            ) : (
              <div className="space-y-4 divide-y">
                {properties.map((property) => (
                  <div key={property.id} className="pt-4 first:pt-0">
                    <PropertyCard
                      property={property}
                      actionButton={
                        <div className="flex flex-col sm:flex-row gap-2">
                          <Button
                            variant="default"
                            onClick={() => {
                              console.log(`Navigating to /seller/property-view/${property.id}`);
                              setLocation(`/seller/property-view/${property.id}`);
                            }}
                          >
                            View Details
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => setSelectedPropertyForChat({
                              id: property.id,
                              buyerId: property.createdBy,
                              buyerName: "Buyer" // This would come from the property data in a real app
                            })}
                          >
                            <MessageSquare className="h-4 w-4 mr-1" />
                            Chat with Buyer
                          </Button>
                        </div>
                      }
                    />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
      
      {/* Chat Dialog */}
      {selectedPropertyForChat && (
        <Dialog open={!!selectedPropertyForChat} onOpenChange={() => setSelectedPropertyForChat(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Chat with Buyer</DialogTitle>
              <DialogDescription>
                Property ID: {selectedPropertyForChat.id}
              </DialogDescription>
            </DialogHeader>
            <div className="h-96">
              <ChatWindow
                propertyId={selectedPropertyForChat.id}
                receiverId={selectedPropertyForChat.buyerId}
                receiverName={selectedPropertyForChat.buyerName}
              />
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
