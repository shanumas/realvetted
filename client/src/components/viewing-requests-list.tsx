import React, { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { getQueryFn, apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { ViewingRequest } from "@shared/schema";
import { ViewingRequestWithParticipants } from "@shared/types";
import { format, parseISO } from "date-fns";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  Calendar,
  Clock,
  User,
  Home,
  CheckCircle,
  XCircle,
  AlertCircle,
  Loader2,
  Phone,
  Mail,
} from "lucide-react";
import { UserProfilePhoto } from "@/components/user-profile-photo";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";

interface ViewingRequestsListProps {
  propertyId: number;
}

export function ViewingRequestsList({ propertyId }: ViewingRequestsListProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [responseMessage, setResponseMessage] = useState("");
  const [activeRequestId, setActiveRequestId] = useState<number | null>(null);

  const { data: viewingRequests, isLoading } = useQuery<ViewingRequestWithParticipants[]>({
    queryKey: [`/api/properties/${propertyId}/viewing-requests`],
    queryFn: getQueryFn({ on401: "throw" }),
  });

  const updateViewingRequestMutation = useMutation({
    mutationFn: async ({ id, status, responseMessage }: { id: number; status: string; responseMessage?: string }) => {
      const res = await apiRequest("PUT", `/api/viewing-requests/${id}`, { 
        status, 
        responseMessage 
      });
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: "Request updated",
        description: "The viewing request has been updated.",
        variant: "default",
      });
      queryClient.invalidateQueries({ queryKey: [`/api/properties/${propertyId}/viewing-requests`] });
      queryClient.invalidateQueries({ queryKey: [`/api/properties/${propertyId}/logs`] });
      setResponseMessage("");
      setActiveRequestId(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Error updating request",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return (
          <div className="flex items-center text-amber-600">
            <AlertCircle className="w-4 h-4 mr-1" /> Pending
          </div>
        );
      case "approved":
        return (
          <div className="flex items-center text-green-600">
            <CheckCircle className="w-4 h-4 mr-1" /> Approved
          </div>
        );
      case "rejected":
        return (
          <div className="flex items-center text-red-600">
            <XCircle className="w-4 h-4 mr-1" /> Rejected
          </div>
        );
      case "completed":
        return (
          <div className="flex items-center text-blue-600">
            <CheckCircle className="w-4 h-4 mr-1" /> Completed
          </div>
        );
      default:
        return <span>{status}</span>;
    }
  };

  const handleStatusChange = (id: number, status: string) => {
    if (status === "rejected" && !responseMessage && id === activeRequestId) {
      // If rejecting and there's no response message, don't submit yet
      toast({
        title: "Response required",
        description: "Please provide a reason for rejecting this request.",
        variant: "destructive",
      });
      return;
    }
    
    updateViewingRequestMutation.mutate({ 
      id, 
      status,
      responseMessage: responseMessage || undefined 
    });
  };
  
  const handleResponseChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setResponseMessage(e.target.value);
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!viewingRequests?.length) {
    return (
      <div className="bg-gray-50 p-6 rounded-lg text-center">
        <h3 className="text-lg font-medium text-gray-900">No viewing requests</h3>
        <p className="mt-2 text-gray-500">There are no viewing requests for this property yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {viewingRequests.map((request) => (
        <Card key={request.id} className="overflow-hidden">
          <CardHeader className="bg-gray-50 pb-3">
            <div className="flex justify-between items-start">
              <div>
                <CardTitle className="text-lg">
                  Viewing Request #{request.id}
                </CardTitle>
                <CardDescription>
                  {format(parseISO(request.requestedDate.toString()), "MMMM d, yyyy 'at' h:mm a")}
                </CardDescription>
              </div>
              {getStatusBadge(request.status)}
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="flex flex-wrap gap-4 mb-4">
              {/* Buyer Information */}
              {request.buyer && (
                <div className="flex items-center">
                  <UserProfilePhoto user={request.buyer} size="sm" />
                  <div className="ml-3">
                    <h4 className="text-sm font-medium">
                      {request.buyer.firstName} {request.buyer.lastName}
                    </h4>
                    <div className="flex items-center text-sm text-gray-500">
                      <Mail className="h-3 w-3 mr-1" />
                      {request.buyer.email}
                    </div>
                    {request.buyer.phone && (
                      <div className="flex items-center text-sm text-gray-500">
                        <Phone className="h-3 w-3 mr-1" />
                        {request.buyer.phone}
                      </div>
                    )}
                  </div>
                </div>
              )}
              
              {/* Agent Information */}
              {request.agent && (
                <div className="flex items-center">
                  <UserProfilePhoto user={request.agent} size="sm" />
                  <div className="ml-3">
                    <h4 className="text-sm font-medium">
                      {request.agent.firstName} {request.agent.lastName}
                    </h4>
                    <div className="flex items-center text-sm text-gray-500">
                      <Badge variant="outline" className="text-xs">Agent</Badge>
                    </div>
                  </div>
                </div>
              )}
            </div>
            
            {/* Request Notes */}
            {request.notes && (
              <div className="mt-2 mb-4">
                <h4 className="text-sm font-medium mb-1">Request Notes</h4>
                <p className="text-sm text-gray-600 bg-gray-50 p-3 rounded">{request.notes}</p>
              </div>
            )}
            
            {/* Response Message */}
            {request.responseMessage && (
              <div className="mt-2 mb-4">
                <h4 className="text-sm font-medium mb-1">Response</h4>
                <p className="text-sm text-gray-600 bg-blue-50 p-3 rounded border-l-2 border-blue-400">
                  {request.responseMessage}
                </p>
              </div>
            )}
            
            {/* Active rejection form */}
            {activeRequestId === request.id && (
              <div className="mt-4 mb-2">
                <h4 className="text-sm font-medium mb-1">Response Message</h4>
                <Textarea 
                  value={responseMessage}
                  onChange={handleResponseChange}
                  placeholder="Please provide a reason or any additional information..."
                  className="resize-none"
                  rows={3}
                />
              </div>
            )}
            
            {/* Schedule Information */}
            <div className="grid grid-cols-2 gap-4 mt-4">
              <div className="flex items-center">
                <Calendar className="h-4 w-4 text-gray-400 mr-2" />
                <span className="text-sm">
                  {format(parseISO(request.requestedDate.toString()), "MMMM d, yyyy")}
                </span>
              </div>
              <div className="flex items-center">
                <Clock className="h-4 w-4 text-gray-400 mr-2" />
                <span className="text-sm">
                  {format(parseISO(request.requestedDate.toString()), "h:mm a")} - 
                  {request.requestedEndDate ? 
                    ` ${format(parseISO(request.requestedEndDate.toString()), "h:mm a")}` : 
                    " (no end time specified)"
                  }
                </span>
              </div>
            </div>
            
            {/* Confirmation Information */}
            {request.confirmedDate && (
              <div className="mt-4 p-3 bg-green-50 rounded-md">
                <h4 className="text-sm font-medium text-green-700 mb-1">Confirmed Schedule</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center">
                    <Calendar className="h-4 w-4 text-green-600 mr-2" />
                    <span className="text-sm text-green-700">
                      {format(parseISO(request.confirmedDate.toString()), "MMMM d, yyyy")}
                    </span>
                  </div>
                  <div className="flex items-center">
                    <Clock className="h-4 w-4 text-green-600 mr-2" />
                    <span className="text-sm text-green-700">
                      {format(parseISO(request.confirmedDate.toString()), "h:mm a")}
                      {request.confirmedEndDate ? 
                        ` - ${format(parseISO(request.confirmedEndDate.toString()), "h:mm a")}` : 
                        ""
                      }
                    </span>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
          
          <CardFooter className="bg-gray-50 flex flex-wrap justify-end gap-2 border-t p-3">
            {request.status === "pending" && (
              <>
                {/* For setting up rejection with response message */}
                {activeRequestId !== request.id ? (
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => setActiveRequestId(request.id)}
                    disabled={updateViewingRequestMutation.isPending}
                  >
                    Reject
                  </Button>
                ) : (
                  <>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => setActiveRequestId(null)}
                    >
                      Cancel
                    </Button>
                    <Button 
                      variant="destructive" 
                      size="sm"
                      onClick={() => handleStatusChange(request.id, "rejected")}
                      disabled={updateViewingRequestMutation.isPending || !responseMessage.trim()}
                    >
                      {updateViewingRequestMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : null}
                      Confirm Rejection
                    </Button>
                  </>
                )}
                
                {/* Only show approve button if not actively rejecting */}
                {activeRequestId !== request.id && (
                  <Button 
                    variant="default" 
                    size="sm"
                    onClick={() => handleStatusChange(request.id, "approved")}
                    disabled={updateViewingRequestMutation.isPending}
                  >
                    {updateViewingRequestMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : null}
                    Approve
                  </Button>
                )}
              </>
            )}
            
            {request.status === "approved" && (
              <Button 
                variant="default" 
                size="sm"
                onClick={() => handleStatusChange(request.id, "completed")}
                disabled={updateViewingRequestMutation.isPending}
              >
                Mark as Completed
              </Button>
            )}
            
            {(request.status === "rejected" || request.status === "completed") && (
              <Select 
                onValueChange={(value) => handleStatusChange(request.id, value)}
                defaultValue={request.status}
                disabled={updateViewingRequestMutation.isPending}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Change status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Set to Pending</SelectItem>
                  <SelectItem value="approved">Set to Approved</SelectItem>
                  <SelectItem value="rejected">Set to Rejected</SelectItem>
                  <SelectItem value="completed">Set to Completed</SelectItem>
                </SelectContent>
              </Select>
            )}
          </CardFooter>
        </Card>
      ))}
    </div>
  );
}