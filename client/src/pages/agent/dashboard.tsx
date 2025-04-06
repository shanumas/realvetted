import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { SiteHeader } from "@/components/layout/site-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PropertyCard } from "@/components/property-card";
import { getQueryFn, apiRequest, queryClient } from "@/lib/queryClient";
import { Property } from "@shared/schema";
import { LeadWithProperty, ViewingRequestWithParticipants } from "@shared/types";
import { ChatWindow } from "@/components/chat/chat-window";
import { Loader2, MessageSquare, Mail, AlertCircle, Clock, Calendar } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { ViewingRequestsList } from "@/components/viewing-requests-list";
import { Badge } from "@/components/ui/badge";
import { format, parseISO } from "date-fns";

// Schema for seller email form
const sellerEmailSchema = z.object({
  email: z.string().email("Please enter a valid email address")
});

type SellerEmailFormValues = z.infer<typeof sellerEmailSchema>;

export default function AgentDashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("clients");
  const [selectedPropertyForChat, setSelectedPropertyForChat] = useState<{ id: number; buyerId: number; buyerName: string } | null>(null);
  const [sellerEmailDialogOpen, setSellerEmailDialogOpen] = useState(false);
  const [selectedPropertyId, setSelectedPropertyId] = useState<number | null>(null);
  const [checkingAgreement, setCheckingAgreement] = useState(true);
  
  // Check if agent has signed the referral agreement
  useEffect(() => {
    if (user && user.role === 'agent' && user.profileStatus === 'verified') {
      const checkReferralAgreement = async () => {
        try {
          const response = await fetch('/api/agent/referral-agreement');
          const data = await response.json();
          
          if (data.success) {
            // If agreement doesn't exist or is not completed, redirect to sign it
            if (!data.data || data.data.status !== 'completed') {
              window.location.href = '/agent/referral-agreement';
              return;
            }
          }
          setCheckingAgreement(false);
        } catch (error) {
          console.error('Error checking referral agreement:', error);
          setCheckingAgreement(false);
        }
      };
      
      checkReferralAgreement();
    } else {
      setCheckingAgreement(false);
    }
  }, [user]);

  // Form for adding seller email
  const sellerEmailForm = useForm<SellerEmailFormValues>({
    resolver: zodResolver(sellerEmailSchema),
    defaultValues: {
      email: "",
    },
  });

  // Fetch assigned properties (clients)
  const { data: assignedProperties, isLoading: isLoadingClients } = useQuery<Property[]>({
    queryKey: ["/api/properties/by-agent"],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: activeTab === "clients",
  });

  // Fetch available leads
  const { data: availableLeads, isLoading: isLoadingLeads, refetch: refetchLeads } = useQuery<LeadWithProperty[]>({
    queryKey: ["/api/leads/available"],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: activeTab === "leads",
  });
  
  // Fetch viewing requests
  const { data: viewingRequests, isLoading: isLoadingViewingRequests } = useQuery<ViewingRequestWithParticipants[]>({
    queryKey: ["/api/viewing-requests/agent"],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: activeTab === "viewing-requests",
  });
  
  // Setup WebSocket for real-time updates
  useEffect(() => {
    // Set up WebSocket listener for property updates and viewing request changes
    const onMessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'notification' || data.type === 'property_update') {
          // Refresh all relevant data
          queryClient.invalidateQueries({ queryKey: ["/api/properties/by-agent"] });
          queryClient.invalidateQueries({ queryKey: ["/api/viewing-requests/agent"] });
          queryClient.invalidateQueries({ queryKey: ["/api/leads/available"] });
          console.log("Agent dashboard - received update, refreshing data:", data);
        }
      } catch (e) {
        console.error("Error parsing WebSocket message in agent dashboard:", e);
      }
    };

    // Connect event listener
    window.addEventListener('message', onMessage);
    
    // Clean up
    return () => {
      window.removeEventListener('message', onMessage);
    };
  }, []);

  // Stats
  const clientCount = assignedProperties?.length || 0;
  const leadCount = availableLeads?.length || 0;
  const viewingRequestCount = viewingRequests?.length || 0;
  const closedDealsCount = 0; // This would come from another API call in a real app

  // Claim lead mutation
  const claimLeadMutation = useMutation({
    mutationFn: async (leadId: number) => {
      const response = await apiRequest("POST", `/api/leads/${leadId}/claim`, {});
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Lead claimed successfully",
        description: "You've been assigned to this property. You can now communicate with the buyer.",
      });
      refetchLeads();
      queryClient.invalidateQueries({ queryKey: ["/api/properties/by-agent"] });
    },
    onError: (error) => {
      toast({
        title: "Failed to claim lead",
        description: error instanceof Error ? error.message : "Something went wrong",
        variant: "destructive",
      });
    },
  });

  // Add seller email mutation
  const addSellerEmailMutation = useMutation({
    mutationFn: async ({ propertyId, email }: { propertyId: number; email: string }) => {
      const response = await apiRequest("POST", `/api/properties/${propertyId}/seller-email`, { email });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Seller email added",
        description: "The seller has been notified and will be able to access the platform.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/properties/by-agent"] });
      setSellerEmailDialogOpen(false);
      sellerEmailForm.reset();
    },
    onError: (error) => {
      toast({
        title: "Failed to add seller email",
        description: error instanceof Error ? error.message : "Something went wrong",
        variant: "destructive",
      });
    },
  });

  const openSellerEmailDialog = (propertyId: number) => {
    setSelectedPropertyId(propertyId);
    setSellerEmailDialogOpen(true);
  };

  const submitSellerEmail = (values: SellerEmailFormValues) => {
    if (selectedPropertyId) {
      addSellerEmailMutation.mutate({
        propertyId: selectedPropertyId,
        email: values.email,
      });
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <SiteHeader />
      
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        {/* Agent Stats */}
        <div className="mb-6">
          <dl className="grid grid-cols-1 gap-5 sm:grid-cols-3">
            <Card>
              <CardContent className="p-6">
                <dt className="text-sm font-medium text-gray-500 truncate">Active Clients</dt>
                <dd className="mt-1 text-3xl font-semibold text-gray-900">{clientCount}</dd>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6">
                <dt className="text-sm font-medium text-gray-500 truncate">Available Leads</dt>
                <dd className="mt-1 text-3xl font-semibold text-primary">{leadCount}</dd>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6">
                <dt className="text-sm font-medium text-gray-500 truncate">Closed Deals</dt>
                <dd className="mt-1 text-3xl font-semibold text-gray-900">{closedDealsCount}</dd>
              </CardContent>
            </Card>
          </dl>
        </div>
        
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-4">
            <TabsTrigger value="clients">My Clients</TabsTrigger>
            <TabsTrigger value="viewing-requests">
              Viewing Requests {viewingRequestCount > 0 && <Badge className="ml-1">{viewingRequestCount}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="leads">Available Leads</TabsTrigger>
          </TabsList>
          
          <TabsContent value="clients">
            <Card>
              <CardHeader>
                <CardTitle>Active Clients</CardTitle>
              </CardHeader>
              <CardContent>
                {isLoadingClients ? (
                  <div className="flex justify-center p-8">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                ) : !assignedProperties || assignedProperties.length === 0 ? (
                  <div className="text-center p-8 text-gray-500">
                    <p>You don't have any active clients yet.</p>
                    <p className="text-sm mt-1">Switch to the Available Leads tab to find new clients.</p>
                  </div>
                ) : (
                  <div className="space-y-4 divide-y">
                    {assignedProperties.map((property) => (
                      <div key={property.id} className="pt-4 first:pt-0">
                        <PropertyCard
                          property={property}
                          actionButton={
                            <div className="flex space-x-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setSelectedPropertyForChat({
                                  id: property.id,
                                  buyerId: property.createdBy,
                                  buyerName: "Buyer" // This would come from the property data in a real app
                                })}
                              >
                                <MessageSquare className="h-4 w-4 mr-1" /> Chat
                              </Button>
                              {!property.sellerEmail && (
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  onClick={() => openSellerEmailDialog(property.id)}
                                >
                                  <AlertCircle className="h-4 w-4 mr-1" /> Add Seller Email
                                </Button>
                              )}
                            </div>
                          }
                        />
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="leads">
            <Card>
              <CardHeader>
                <CardTitle>Available Leads</CardTitle>
              </CardHeader>
              <CardContent>
                {isLoadingLeads ? (
                  <div className="flex justify-center p-8">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                ) : !availableLeads || availableLeads.length === 0 ? (
                  <div className="text-center p-8 text-gray-500">
                    <p>There are currently no available leads.</p>
                    <p className="text-sm mt-1">Check back later for new opportunities.</p>
                  </div>
                ) : (
                  <div className="space-y-4 divide-y">
                    {availableLeads.map((item) => (
                      <div key={item.lead.id} className="pt-4 first:pt-0">
                        <PropertyCard
                          property={item.property}
                          actionButton={
                            <Button 
                              onClick={() => claimLeadMutation.mutate(item.lead.id)}
                              disabled={claimLeadMutation.isPending}
                            >
                              {claimLeadMutation.isPending ? (
                                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                              ) : null}
                              Claim Lead
                            </Button>
                          }
                        />
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="viewing-requests">
            <Card>
              <CardHeader>
                <CardTitle>Property Viewing Requests</CardTitle>
              </CardHeader>
              <CardContent>
                {user && <ViewingRequestsList userId={user.id} role="agent" />}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
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
      
      {/* Add Seller Email Dialog */}
      <Dialog open={sellerEmailDialogOpen} onOpenChange={setSellerEmailDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Seller Email</DialogTitle>
            <DialogDescription>
              Enter the seller's email address to invite them to the platform.
            </DialogDescription>
          </DialogHeader>
          <Form {...sellerEmailForm}>
            <form onSubmit={sellerEmailForm.handleSubmit(submitSellerEmail)}>
              <FormField
                control={sellerEmailForm.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Seller's Email</FormLabel>
                    <FormControl>
                      <Input placeholder="seller@example.com" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter className="mt-4">
                <Button
                  type="submit"
                  disabled={addSellerEmailMutation.isPending}
                >
                  {addSellerEmailMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  ) : null}
                  Send Invitation
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
