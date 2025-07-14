import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { format, parseISO } from "date-fns";
import { formatCaliforniaTime } from "@/lib/date-utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Loader2, MessageSquare, Calendar, Clock, AlertCircle, FileSignature, X } from "lucide-react";
import { getQueryFn, apiRequest, queryClient } from "@/lib/queryClient";
import { ViewingRequestWithParticipants } from "@shared/types";
import { useToast } from "@/hooks/use-toast";
import { ChatWindow } from "./chat/chat-window";
import { AgencyDisclosureForm } from "./agency-disclosure-form";

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
  const [showAgreementModal, setShowAgreementModal] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<ViewingRequestWithParticipants | null>(null);
  
  // Make userId available in component scope
  const currentUserId = userId;

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
          
          // Specifically handle viewing request status updates
          if (data.type === 'property_update' && 
              data.data.action === 'viewing_request_updated' && 
              data.data.viewingRequestId) {
            console.log("Invalidating viewing requests queries due to status update:", data.data.status);
            
            // Invalidate the viewing requests endpoint
            queryClient.invalidateQueries({ queryKey: [endpoint] });
            
            // If we have a property ID, invalidate property-specific viewing requests too
            if (data.data.propertyId) {
              queryClient.invalidateQueries({ 
                queryKey: [`/api/properties/${data.data.propertyId}/viewing-requests`] 
              });
            }
          } else {
            // For other types of updates, just do a general refetch
            refetch();
          }
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
  }, [refetch, endpoint]);

  // Filter requests based on active tab
  const filteredRequests = viewingRequests?.filter(request => {
    if (activeTab === "pending") return request.status === "pending";
    if (activeTab === "approved") return request.status === "accepted"; // Use 'accepted' status from backend
    if (activeTab === "rejected") return request.status === "rejected" || request.status === "cancelled"; // Handle both spellings
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
  
  // Cancel viewing request mutation
  const cancelRequestMutation = useMutation({
    mutationFn: async (id: number) => {
      try {
        console.log(`Attempting to cancel viewing request with ID: ${id}`);
        const response = await apiRequest("DELETE", `/api/viewing-requests/${id}`);
        console.log("Cancel request response status:", response.status);
        return await response.json();
      } catch (error) {
        console.error("Error in cancel request mutation:", error);
        throw error;
      }
    },
    onSuccess: (data) => {
      console.log("Successfully cancelled viewing request:", data);
      toast({
        title: "Viewing request cancelled",
        description: "Your viewing request has been cancelled successfully.",
      });
      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: [endpoint] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      // Also invalidate property-specific viewing requests
      if (viewingRequests && viewingRequests.length > 0) {
        const propertyIds = new Set(viewingRequests.map(r => r.propertyId));
        propertyIds.forEach(propId => {
          queryClient.invalidateQueries({ queryKey: [`/api/properties/${propId}/viewing-requests`] });
        });
      }
    },
    onError: (error) => {
      console.error("Error in cancel request:", error);
      toast({
        title: "Error cancelling viewing request",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
    },
  });

  // Seller agent approval mutation
  const sellerAgentApprovalMutation = useMutation({
    mutationFn: async ({ id, approvalStatus }: { id: number; approvalStatus: string }) => {
      const response = await apiRequest("PATCH", `/api/viewing-requests/${id}/seller-agent-approval`, { approvalStatus });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Approval updated",
        description: "Seller agent approval has been updated successfully.",
      });
      queryClient.invalidateQueries({ queryKey: [endpoint] });
    },
    onError: (error) => {
      toast({
        title: "Error updating approval",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
    },
  });

  // Buyer agent approval mutation
  const buyerAgentApprovalMutation = useMutation({
    mutationFn: async ({ id, approvalStatus }: { id: number; approvalStatus: string }) => {
      const response = await apiRequest("PATCH", `/api/viewing-requests/${id}/buyer-agent-approval`, { approvalStatus });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Approval updated",
        description: "Buyer agent approval has been updated successfully.",
      });
      queryClient.invalidateQueries({ queryKey: [endpoint] });
    },
    onError: (error) => {
      toast({
        title: "Error updating approval",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
    },
  });

  const handleStatusChange = (id: number, status: string) => {
    updateRequestMutation.mutate({ id, status });
  };
  
  const handleCancelRequest = (id: number) => {
    if (confirm("Are you sure you want to cancel this viewing request?")) {
      try {
        console.log(`Cancelling viewing request with ID: ${id}`);
        cancelRequestMutation.mutate(id);
      } catch (error) {
        console.error("Error in handleCancelRequest:", error);
        toast({
          title: "Error cancelling request",
          description: "There was a problem cancelling your viewing request. Please try again.",
          variant: "destructive",
        });
      }
    }
  };

  // Get counts for badges
  const pendingCount = viewingRequests?.filter(req => req.status === "pending").length || 0;
  const approvedCount = viewingRequests?.filter(req => req.status === "accepted").length || 0; // Use 'accepted' status from backend
  const rejectedCount = viewingRequests?.filter(req => req.status === "rejected" || req.status === "cancelled").length || 0;
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
                          <div className="flex gap-2">
                            {/* Seller's Agent Approval Badge */}
                            <Badge 
                              variant={
                                request.sellerAgentApprovalStatus === 'approved' ? 'success' :
                                request.sellerAgentApprovalStatus === 'rejected' ? 'destructive' : 'outline'
                              }
                              className="text-xs"
                            >
                              Seller Agent: {request.sellerAgentApprovalStatus === 'approved' ? 'Approved' : 
                                            request.sellerAgentApprovalStatus === 'rejected' ? 'Rejected' : 'Pending'}
                              {request.sellerAgentApprovalSource && (
                                <span className="ml-1 text-xs opacity-75">
                                  ({request.sellerAgentApprovalSource === 'public_viewing_page' ? 'Public Link' : 'Dashboard'})
                                </span>
                              )}
                            </Badge>
                            
                            {/* Buyer's Agent Approval Badge */}
                            <Badge 
                              variant={
                                request.buyerAgentApprovalStatus === 'approved' ? 'success' :
                                request.buyerAgentApprovalStatus === 'rejected' ? 'destructive' : 'outline'
                              }
                              className="text-xs"
                            >
                              Buyer Agent: {request.buyerAgentApprovalStatus === 'approved' ? 'Approved' : 
                                           request.buyerAgentApprovalStatus === 'rejected' ? 'Rejected' : 'Pending'}
                              {request.buyerAgentApprovalSource && (
                                <span className="ml-1 text-xs opacity-75">
                                  ({request.buyerAgentApprovalSource === 'public_viewing_page' ? 'Public Link' : 'Dashboard'})
                                </span>
                              )}
                            </Badge>
                          </div>
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
                              {formatCaliforniaTime(request.requestedDate.toString(), "MMMM d, yyyy")}
                            </span>
                          </div>
                          
                          <div className="flex items-center">
                            <Clock className="h-4 w-4 mr-2 text-gray-500" />
                            <span className="text-sm">
                              {formatCaliforniaTime(request.requestedDate.toString(), "h:mm a")}
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
                          
                          {/* Use the buyer route for property view if agent, since agent route isn't set up */}
                          <Link href={role === 'agent' ? `/buyer/property/${property.id}` : `/${role}/property/${property.id}`}>
                            <Button variant="outline" size="sm">
                              View Property
                            </Button>
                          </Link>
                          
                          {/* Cancel button for buyers (and for pending or accepted requests) */}
                          {role === 'buyer' && (request.status === 'pending' || request.status === 'accepted') && (
                            <Button 
                              variant="destructive"
                              size="sm"
                              onClick={() => handleCancelRequest(request.id)}
                              disabled={cancelRequestMutation.isPending}
                            >
                              {cancelRequestMutation.isPending && request.id === (cancelRequestMutation.variables as number) ? (
                                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                              ) : (
                                <X className="h-4 w-4 mr-1" />
                              )}
                              Cancel Viewing
                            </Button>
                          )}
                          
                          {/* Agent approval buttons */}
                          {role === 'agent' && request.status === 'pending' && (
                            <>
                              {/* Seller Agent Approval (if user is property agent or seller agent) */}
                              {(property.agentId === currentUserId || request.sellerAgentId === currentUserId) && 
                               request.sellerAgentApprovalStatus === 'pending' && (
                                <>
                                  <Button 
                                    variant="success"
                                    size="sm"
                                    onClick={() => sellerAgentApprovalMutation.mutate({ id: request.id, approvalStatus: 'approved' })}
                                    disabled={sellerAgentApprovalMutation.isPending}
                                  >
                                    {sellerAgentApprovalMutation.isPending ? (
                                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                                    ) : null}
                                    Approve (Seller Agent)
                                  </Button>
                                  
                                  <Button 
                                    variant="destructive"
                                    size="sm"
                                    onClick={() => sellerAgentApprovalMutation.mutate({ id: request.id, approvalStatus: 'rejected' })}
                                    disabled={sellerAgentApprovalMutation.isPending}
                                  >
                                    Reject (Seller Agent)
                                  </Button>
                                </>
                              )}
                              
                              {/* Buyer Agent Approval (if user is buyer agent) */}
                              {request.buyerAgentId === currentUserId && 
                               request.buyerAgentApprovalStatus === 'pending' && (
                                <>
                                  <Button 
                                    variant="success"
                                    size="sm"
                                    onClick={() => buyerAgentApprovalMutation.mutate({ id: request.id, approvalStatus: 'approved' })}
                                    disabled={buyerAgentApprovalMutation.isPending}
                                  >
                                    {buyerAgentApprovalMutation.isPending ? (
                                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                                    ) : null}
                                    Approve (Buyer Agent)
                                  </Button>
                                  
                                  <Button 
                                    variant="destructive"
                                    size="sm"
                                    onClick={() => buyerAgentApprovalMutation.mutate({ id: request.id, approvalStatus: 'rejected' })}
                                    disabled={buyerAgentApprovalMutation.isPending}
                                  >
                                    Reject (Buyer Agent)
                                  </Button>
                                </>
                              )}
                            </>
                          )}
                          
                          {/* For agents: if status is accepted, show Mark Completed button */}
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
                          
                          {/* For agents: always show Agency Disclosure Form button */}
                          {role === 'agent' && (
                            <Button 
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                // Store the current request with its property and participants
                                console.log("Button clicked, request:", request);
                                setSelectedRequest(request);
                                setShowAgreementModal(true);
                                console.log("showAgreementModal:", true);
                              }}
                              className="bg-primary/5 border-primary/30 text-primary hover:bg-primary/10"
                            >
                              <FileSignature className="h-4 w-4 mr-1" />
                              Agency Disclosure Form
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
      
      {/* Chat Dialog Section */}
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
      
      {/* Agency Disclosure Form Modal */}
      {console.log("Modal conditions:", {
        showAgreementModal,
        selectedRequest,
        hasProperty: selectedRequest?.property,
        hasAgent: selectedRequest?.agent
      })}
      
      {showAgreementModal && selectedRequest && selectedRequest.property && selectedRequest.agent ? (
        <AgencyDisclosureForm
          property={selectedRequest.property}
          agent={selectedRequest.agent}
          isOpen={showAgreementModal}
          onClose={() => {
            setShowAgreementModal(false);
            setSelectedRequest(null);
          }}
          viewingRequestId={selectedRequest.id} // Pass the viewing request ID
        />
      ) : showAgreementModal ? (
        <div>Modal cannot open: Missing property or agent data</div>
      ) : null}
    </div>
  );
}