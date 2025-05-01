import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { getQueryFn, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { ViewingRequestWithParticipants } from "@shared/types";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Calendar,
  Clock,
  Home,
  Check,
  X,
  Calendar as CalendarIcon,
  Loader2,
  User,
  MapPin,
  Trash2,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

type PropertyViewingRequestsListProps = {
  // Original props
  viewingRequests?: ViewingRequestWithParticipants[];
  showPropertyDetails?: boolean;
  propertyName?: string;
  
  // New alternative props
  propertyId?: number;
  viewAs?: "buyer" | "seller" | "agent";
};

export function PropertyViewingRequestsList({ 
  viewingRequests: providedViewingRequests, 
  showPropertyDetails = true,
  propertyName,
  propertyId,
  viewAs
}: PropertyViewingRequestsListProps) {
  const [activeTab, setActiveTab] = useState("pending");
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [selectedRequestId, setSelectedRequestId] = useState<number | null>(null);
  const [isConfirmDialogOpen, setIsConfirmDialogOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<"approve" | "reject" | "delete" | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  // Only fetch if propertyId is provided and viewingRequests aren't directly provided
  const { data: fetchedViewingRequests, isLoading } = useQuery<ViewingRequestWithParticipants[]>({
    queryKey: [`/api/properties/${propertyId}/viewing-requests`],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!propertyId && !providedViewingRequests,
  });

  // Use provided viewingRequests if available, otherwise use fetched data
  const viewingRequests = providedViewingRequests || fetchedViewingRequests || [];
  
  // Enhanced debugging for property viewing requests
  React.useEffect(() => {
    if (providedViewingRequests) {
      console.log('PropertyViewingRequestsList received direct viewingRequests prop:', providedViewingRequests);
      console.log('PropertyViewingRequestsList received propertyId:', propertyId);
      console.log('PropertyViewingRequestsList received viewAs:', viewAs);
    } else if (fetchedViewingRequests) {
      console.log('PropertyViewingRequestsList using fetched data:', fetchedViewingRequests);
    } else {
      console.log('PropertyViewingRequestsList has no viewing requests data');
    }
  }, [providedViewingRequests, fetchedViewingRequests, propertyId, viewAs]);

  const handleViewingAction = async (requestId: number, status: string) => {
    try {
      await apiRequest(`/api/viewing-requests/${requestId}`, "PATCH", { status });
      
      // Invalidate relevant queries
      queryClient.invalidateQueries({
        queryKey: [`/api/properties/${propertyId}/viewing-requests`],
      });
      
      // Also invalidate buyer and agent viewing request queries
      queryClient.invalidateQueries({
        queryKey: ["/api/viewing-requests/buyer"],
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/viewing-requests/agent"],
      });
      
      toast({
        title: "Success",
        description: `Viewing request ${status === "approved" ? "approved" : "rejected"}.`,
      });
    } catch (error) {
      console.error("Error updating viewing request:", error);
      toast({
        title: "Error",
        description: "There was a problem updating the viewing request.",
        variant: "destructive",
      });
    }
  };
  
  const handleDeleteViewingRequest = async (requestId: number) => {
    try {
      console.log(`Attempting to cancel viewing request with ID: ${requestId}`);
      // The server endpoint technically updates status to "cancelled" rather than deleting
      const response = await apiRequest("DELETE", `/api/viewing-requests/${requestId}`);
      console.log("Cancel request response status:", response.status);
      
      // Invalidate relevant queries
      queryClient.invalidateQueries({
        queryKey: [`/api/properties/${propertyId}/viewing-requests`],
      });
      
      // Also invalidate buyer and agent viewing request queries
      queryClient.invalidateQueries({
        queryKey: ["/api/viewing-requests/buyer"],
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/viewing-requests/agent"],
      });
      
      toast({
        title: "Success",
        description: "Viewing request cancelled successfully.",
      });
      
      setIsDeleteDialogOpen(false);
      setSelectedRequestId(null);
    } catch (error) {
      console.error("Error cancelling viewing request:", error);
      toast({
        title: "Error",
        description: "There was a problem cancelling the viewing request.",
        variant: "destructive",
      });
    }
  };

  const confirmDialog = (requestId: number, action: "approve" | "reject" | "delete") => {
    setSelectedRequestId(requestId);
    setConfirmAction(action);
    
    if (action === "delete") {
      setIsDeleteDialogOpen(true);
    } else {
      setIsConfirmDialogOpen(true);
    }
  };

  const handleConfirmAction = async () => {
    if (!selectedRequestId || !confirmAction) return;
    
    await handleViewingAction(
      selectedRequestId, 
      confirmAction === "approve" ? "approved" : "rejected"
    );
    
    setIsConfirmDialogOpen(false);
    setSelectedRequestId(null);
    setConfirmAction(null);
  };

  // Log all viewing requests received (for debugging)
  console.log('All viewing requests:', viewingRequests);

  // Modified to show all pending requests in tab "pending" and all other requests in their respective tabs
  const filteredViewingRequests = viewingRequests.filter((request) => {
    if (activeTab === "pending") {
      return request.status === "pending";
    } else if (activeTab === "approved") {
      return request.status === "approved";
    } else if (activeTab === "rejected") {
      return request.status === "rejected";
    } else if (activeTab === "completed") {
      return request.status === "completed";
    }
    return true;
  });
  
  // Log filtered viewing requests (for debugging)
  console.log('Filtered viewing requests for tab', activeTab, ':', filteredViewingRequests);

  return (
    <div>
      <Tabs defaultValue="pending" value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-4 mb-4">
          <TabsTrigger value="pending">Pending</TabsTrigger>
          <TabsTrigger value="approved">Approved</TabsTrigger>
          <TabsTrigger value="rejected">Rejected</TabsTrigger>
          <TabsTrigger value="completed">Completed</TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab}>
          {isLoading ? (
            <div className="flex justify-center p-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : filteredViewingRequests.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Calendar className="h-12 w-12 mx-auto mb-2 text-gray-300" />
              <p>No {activeTab} viewing requests found.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredViewingRequests.map((request) => (
                <Card key={request.id} className="overflow-hidden">
                  <CardContent className="p-0">
                    <div className="bg-gray-50 p-4 border-b flex justify-between items-center">
                      <div className="flex items-center">
                        <CalendarIcon className="mr-2 h-5 w-5 text-primary" />
                        <div>
                          <span className="font-medium">
                            {request.date 
                              ? format(new Date(request.date), "PPP")
                              : request.requestedDate 
                                ? format(new Date(request.requestedDate), "PPP") 
                                : "Date not specified"}
                          </span>
                          {request.timeSlot 
                            ? (
                              <span className="text-sm text-gray-500 ml-2">
                                at {request.timeSlot}
                              </span>
                            )
                            : (request.requestedDate && request.requestedEndDate) && (
                              <span className="text-sm text-gray-500 ml-2">
                                at {format(new Date(request.requestedDate), "h:mm a")} - {format(new Date(request.requestedEndDate), "h:mm a")}
                              </span>
                            )
                          }
                        </div>
                      </div>
                      <Badge
                        variant={
                          request.status === "pending"
                            ? "outline"
                            : request.status === "approved"
                            ? "success"
                            : request.status === "rejected"
                            ? "destructive"
                            : "secondary"
                        }
                      >
                        {request.status.charAt(0).toUpperCase() + request.status.slice(1)}
                      </Badge>
                    </div>

                    <div className="p-4">
                      {/* Property details if showing */}
                      {showPropertyDetails && request.property && (
                        <div className="mb-4 pb-4 border-b border-gray-100">
                          <div className="flex items-start">
                            <Home className="h-5 w-5 text-gray-400 mt-0.5 mr-2" />
                            <div>
                              <h4 className="font-medium">
                                {request.property.address}
                              </h4>
                              <p className="text-sm text-gray-500">
                                {request.property.city}, {request.property.state}{" "}
                                {request.property.zip}
                              </p>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* If there's no property but propertyName is provided */}
                      {showPropertyDetails && !request.property && propertyName && (
                        <div className="mb-4 pb-4 border-b border-gray-100">
                          <div className="flex items-start">
                            <Home className="h-5 w-5 text-gray-400 mt-0.5 mr-2" />
                            <div>
                              <h4 className="font-medium">{propertyName}</h4>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Buyer information */}
                      {request.buyer && (
                        <div className="mb-3">
                          <div className="flex items-center">
                            <Avatar className="h-8 w-8 mr-2">
                              <AvatarFallback>
                                {request.buyer.firstName?.[0] || "B"}
                                {request.buyer.lastName?.[0] || ""}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="font-medium">
                                {request.buyer.firstName}{" "}
                                {request.buyer.lastName}
                              </p>
                              <p className="text-sm text-gray-500">Buyer</p>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Agent information */}
                      {request.agent && (
                        <div className="mb-3">
                          <div className="flex items-center">
                            <Avatar className="h-8 w-8 mr-2">
                              <AvatarFallback>
                                {request.agent.firstName?.[0] || "A"}
                                {request.agent.lastName?.[0] || ""}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="font-medium">
                                {request.agent.firstName}{" "}
                                {request.agent.lastName}
                              </p>
                              <p className="text-sm text-gray-500">
                                Real Estate Agent
                              </p>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Notes */}
                      {request.notes && (
                        <div className="mt-3 text-sm text-gray-700">
                          <p className="font-medium mb-1">Notes:</p>
                          <p>{request.notes}</p>
                        </div>
                      )}

                      {/* Feedback if completed or response message exists */}
                      {(request.status === "completed" && request.feedback) || request.responseMessage ? (
                        <div className="mt-3">
                          <Alert>
                            <AlertTitle>{request.status === "completed" ? "Feedback" : "Response"}</AlertTitle>
                            <AlertDescription>
                              {request.feedback || request.responseMessage}
                            </AlertDescription>
                          </Alert>
                        </div>
                      ) : null}
                    </div>

                    {/* Action buttons for seller/agent to approve/reject viewing requests */}
                    {(viewAs === "seller" || viewAs === "agent") && 
                     request.status === "pending" &&
                     (
                      <div className="px-4 py-3 bg-gray-50 border-t flex justify-end space-x-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => confirmDialog(request.id, "reject")}
                        >
                          <X className="h-4 w-4 mr-1" /> Reject
                        </Button>
                        <Button
                          variant="default"
                          size="sm"
                          onClick={() => confirmDialog(request.id, "approve")}
                        >
                          <Check className="h-4 w-4 mr-1" /> Approve
                        </Button>
                      </div>
                    )}

                    {/* Cancel button for buyers to cancel their viewing requests */}
                    {viewAs === "buyer" && (
                      <div className="px-4 py-3 bg-gray-50 border-t flex justify-end space-x-2">
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => confirmDialog(request.id, "delete")}
                        >
                          <X className="h-4 w-4 mr-1" /> Cancel Request
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Approval/Rejection Confirmation Dialog */}
      <Dialog open={isConfirmDialogOpen} onOpenChange={setIsConfirmDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirmAction === "approve"
                ? "Approve Viewing Request"
                : "Reject Viewing Request"}
            </DialogTitle>
            <DialogDescription>
              {confirmAction === "approve"
                ? "Are you sure you want to approve this viewing request?"
                : "Are you sure you want to reject this viewing request?"}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsConfirmDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant={confirmAction === "approve" ? "default" : "destructive"}
              onClick={handleConfirmAction}
            >
              {confirmAction === "approve" ? "Approve" : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Cancel Request Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel Viewing Request</DialogTitle>
            <DialogDescription>
              Are you sure you want to cancel this viewing request? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsDeleteDialogOpen(false);
                setSelectedRequestId(null);
              }}
            >
              Keep Request
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (selectedRequestId) {
                  handleDeleteViewingRequest(selectedRequestId);
                }
              }}
            >
              Cancel Request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}