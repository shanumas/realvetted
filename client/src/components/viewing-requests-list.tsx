import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { format, parseISO } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Loader2, MessageSquare, Calendar, Clock, AlertCircle } from "lucide-react";
import { getQueryFn, apiRequest, queryClient } from "@/lib/queryClient";
import { ViewingRequestWithParticipants } from "@shared/types";
import { useToast } from "@/hooks/use-toast";
import { ChatWindow } from "./chat/chat-window";

type ViewingRequestsListProps = {
  userId: number;
  role: string;
};

export function ViewingRequestsList({ userId, role }: ViewingRequestsListProps) {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("pending");
  const [selectedChat, setSelectedChat] = useState<{ propertyId: number; userId: number; userName: string } | null>(null);
  const [lastUpdateMessage, setLastUpdateMessage] = useState<string | null>(null);
  const [showUpdateBanner, setShowUpdateBanner] = useState(false);

  // Determine the API endpoint based on the user's role
  const endpoint = role === "agent" 
    ? "/api/viewing-requests/agent" 
    : role === "buyer" 
      ? "/api/viewing-requests/buyer" 
      : "/api/viewing-requests";

  // Fetch viewing requests
  const { data: viewingRequests, isLoading, refetch } = useQuery<ViewingRequestWithParticipants[]>({
    queryKey: [endpoint],
    queryFn: getQueryFn({ on401: "throw" }),
  });
  
  // Setup WebSocket listener for real-time updates
  useEffect(() => {
    const handleWebSocketMessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        
        // If it's a property_update or notification message that affects viewing requests
        if (data.type === 'property_update' || 
           (data.type === 'notification' && data.data && data.data.viewingRequestId)) {
          
          console.log("Received update for viewing requests:", data);
          
          // Show notification
          if (data.data.message) {
            setLastUpdateMessage(data.data.message);
            setShowUpdateBanner(true);
            
            // Auto-hide message after 5 seconds
            setTimeout(() => {
              setShowUpdateBanner(false);
            }, 5000);
          }
          
          // Refresh viewing requests data
          refetch();
        }
      } catch (e) {
        console.error("Error processing WebSocket message:", e);
      }
    };

    // Add event listener
    window.addEventListener('message', handleWebSocketMessage);
    
    // Clean up
    return () => {
      window.removeEventListener('message', handleWebSocketMessage);
    };
  }, [refetch]);

  // Filter requests based on active tab
  const filteredRequests = viewingRequests?.filter(request => {
    if (activeTab === "pending") return request.status === "pending";
    if (activeTab === "approved") return request.status === "accepted"; // Use 'accepted' status from backend
    if (activeTab === "rejected") return request.status === "rejected";
    if (activeTab === "completed") return request.status === "completed";
    return true; // Show all requests on "all" tab
  });

  // Update viewing request status mutation
  const updateRequestMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const response = await apiRequest("PATCH", `/api/viewing-requests/${id}`, { status });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Viewing request updated",
        description: "The viewing request status has been updated successfully.",
      });
      // Invalidate the viewing requests
      queryClient.invalidateQueries({ queryKey: [endpoint] });
      // Also invalidate the auth user query to ensure we're still logged in
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
    },
    onError: (error) => {
      toast({
        title: "Error updating viewing request",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
    },
  });

  const handleStatusChange = (id: number, status: string) => {
    updateRequestMutation.mutate({ id, status });
  };

  // Get counts for badges
  const pendingCount = viewingRequests?.filter(req => req.status === "pending").length || 0;
  const approvedCount = viewingRequests?.filter(req => req.status === "accepted").length || 0; // Use 'accepted' status from backend
  const rejectedCount = viewingRequests?.filter(req => req.status === "rejected").length || 0;
  const completedCount = viewingRequests?.filter(req => req.status === "completed").length || 0;

  // Determine who to chat with based on role
  const getChatParticipant = (request: ViewingRequestWithParticipants) => {
    if (role === "agent" && request.buyer) {
      return {
        userId: request.buyerId,
        name: `${request.buyer.firstName || ""} ${request.buyer.lastName || ""}`.trim() || "Buyer"
      };
    } else if (role === "buyer" && request.agent) {
      return {
        userId: request.agent.id,
        name: `${request.agent.firstName || ""} ${request.agent.lastName || ""}`.trim() || "Agent"
      };
    }
    return null;
  };

  return (
    <div className="space-y-4">
      {/* Notification Banner */}
      {showUpdateBanner && lastUpdateMessage && (
        <div className="bg-blue-50 border border-blue-200 text-blue-700 px-4 py-3 rounded-md flex items-center justify-between mb-2">
          <div className="flex items-center">
            <AlertCircle className="h-5 w-5 mr-2 text-blue-500" />
            <span>{lastUpdateMessage}</span>
          </div>
          <button 
            onClick={() => setShowUpdateBanner(false)} 
            className="text-blue-500 hover:text-blue-700 focus:outline-none"
          >
            <span className="sr-only">Dismiss</span>
            <span aria-hidden="true">&times;</span>
          </button>
        </div>
      )}
    
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="pending">
            Pending {pendingCount > 0 && <Badge variant="outline" className="ml-1">{pendingCount}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="approved">
            Approved {approvedCount > 0 && <Badge variant="outline" className="ml-1">{approvedCount}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="rejected">
            Rejected {rejectedCount > 0 && <Badge variant="outline" className="ml-1">{rejectedCount}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="completed">
            Completed {completedCount > 0 && <Badge variant="outline" className="ml-1">{completedCount}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="all">All</TabsTrigger>
        </TabsList>

        {["pending", "approved", "rejected", "completed", "all"].map(tab => (
          <TabsContent key={tab} value={tab}>
            {isLoading ? (
              <div className="flex justify-center p-8">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : !filteredRequests || filteredRequests.length === 0 ? (
              <div className="text-center p-8 text-gray-500">
                <p>No {tab} viewing requests found.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredRequests.map(request => {
                  const property = request.property;
                  if (!property) return null;

                  const chatParticipant = getChatParticipant(request);

                  return (
                    <Card key={request.id} className="border border-gray-200">
                      <CardHeader className="bg-gray-50 pb-2">
                        <div className="flex justify-between items-center">
                          <CardTitle className="text-lg">
                            Viewing Request #{request.id}
                          </CardTitle>
                          <Badge 
                            variant={
                              request.status === 'pending' ? 'outline' : 
                              request.status === 'accepted' ? 'success' :
                              request.status === 'rejected' ? 'destructive' : 'default'
                            }
                          >
                            {request.status === 'accepted' ? 'Approved' : request.status.charAt(0).toUpperCase() + request.status.slice(1)}
                          </Badge>
                        </div>
                      </CardHeader>
                      
                      <CardContent className="p-4">
                        <div className="mb-4">
                          <h3 className="font-semibold text-gray-700 mb-1">{property.address}</h3>
                          <p className="text-sm text-gray-500">
                            {property.city}, {property.state} {property.zip}
                          </p>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                          <div className="flex items-center">
                            <Calendar className="h-4 w-4 mr-2 text-gray-500" />
                            <span className="text-sm">
                              {format(parseISO(request.requestedDate.toString()), "MMMM d, yyyy")}
                            </span>
                          </div>
                          
                          <div className="flex items-center">
                            <Clock className="h-4 w-4 mr-2 text-gray-500" />
                            <span className="text-sm">
                              {format(parseISO(request.requestedDate.toString()), "h:mm a")}
                            </span>
                          </div>
                        </div>
                        
                        {request.notes && (
                          <div className="mb-4">
                            <h4 className="text-sm font-medium mb-1">Notes:</h4>
                            <p className="text-sm text-gray-700 bg-gray-50 p-2 rounded">
                              {request.notes}
                            </p>
                          </div>
                        )}
                        
                        <div className="mt-4 flex justify-end space-x-2">
                          {chatParticipant && (
                            <Button 
                              onClick={() => setSelectedChat({
                                propertyId: property.id,
                                userId: chatParticipant.userId,
                                userName: chatParticipant.name
                              })}
                              size="sm"
                              variant="outline"
                            >
                              <MessageSquare className="h-4 w-4 mr-1" /> Chat
                            </Button>
                          )}
                          
                          <Link href={`/properties/${property.id}`}>
                            <Button variant="outline" size="sm">
                              View Property
                            </Button>
                          </Link>
                          
                          {role === 'agent' && request.status === 'pending' && (
                            <>
                              <Button 
                                variant="success"
                                size="sm"
                                onClick={() => handleStatusChange(request.id, 'accepted')}
                                disabled={updateRequestMutation.isPending}
                              >
                                {updateRequestMutation.isPending ? (
                                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                                ) : null}
                                Approve
                              </Button>
                              
                              <Button 
                                variant="destructive"
                                size="sm"
                                onClick={() => handleStatusChange(request.id, 'rejected')}
                                disabled={updateRequestMutation.isPending}
                              >
                                Reject
                              </Button>
                            </>
                          )}
                          
                          {role === 'agent' && request.status === 'accepted' && (
                            <Button 
                              variant="default"
                              size="sm"
                              onClick={() => handleStatusChange(request.id, 'completed')}
                              disabled={updateRequestMutation.isPending}
                            >
                              {updateRequestMutation.isPending ? (
                                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                              ) : null}
                              Mark Completed
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>
      
      {/* Chat Dialog */}
      {selectedChat && (
        <Dialog open={!!selectedChat} onOpenChange={() => setSelectedChat(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Chat with {selectedChat.userName}</DialogTitle>
              <DialogDescription>
                Property ID: {selectedChat.propertyId}
              </DialogDescription>
            </DialogHeader>
            <div className="h-96">
              <ChatWindow
                propertyId={selectedChat.propertyId}
                receiverId={selectedChat.userId}
                receiverName={selectedChat.userName}
              />
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}