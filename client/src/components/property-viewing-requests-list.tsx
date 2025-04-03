import { useState } from "react";
import { format, parseISO } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar, Clock } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { ViewingRequestWithParticipants } from "@shared/types";

type PropertyViewingRequestsListProps = {
  viewingRequests: ViewingRequestWithParticipants[];
  showPropertyDetails?: boolean;
  propertyName?: string;
};

export function PropertyViewingRequestsList({ 
  viewingRequests, 
  showPropertyDetails = true,
  propertyName
}: PropertyViewingRequestsListProps) {
  const [activeTab, setActiveTab] = useState("pending");
  const { user } = useAuth();
  
  // Debugging output
  console.log("ViewingRequests received:", viewingRequests);
  
  // Filter requests based on active tab
  const filteredRequests = viewingRequests?.filter(request => {
    if (activeTab === "pending") return request.status === "pending";
    if (activeTab === "approved") return request.status === "approved";
    if (activeTab === "rejected") return request.status === "rejected";
    if (activeTab === "completed") return request.status === "completed";
    return true; // Show all requests on "all" tab
  });
  
  // Get counts for badges
  const pendingCount = viewingRequests?.filter(req => req.status === "pending").length || 0;
  const approvedCount = viewingRequests?.filter(req => req.status === "approved").length || 0;
  const rejectedCount = viewingRequests?.filter(req => req.status === "rejected").length || 0;
  const completedCount = viewingRequests?.filter(req => req.status === "completed").length || 0;

  return (
    <div className="space-y-4">
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
            {!filteredRequests || filteredRequests.length === 0 ? (
              <div className="text-center p-8 text-gray-500">
                <p>No {tab} viewing requests found.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredRequests.map(request => {
                  const property = request.property;
                  if (!showPropertyDetails && !property) return null;

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
                              request.status === 'approved' ? 'success' :
                              request.status === 'rejected' ? 'destructive' : 'default'
                            }
                          >
                            {request.status.charAt(0).toUpperCase() + request.status.slice(1)}
                          </Badge>
                        </div>
                      </CardHeader>
                      
                      <CardContent className="p-4">
                        {showPropertyDetails && property && (
                          <div className="mb-4">
                            <h3 className="font-semibold text-gray-700 mb-1">{property.address}</h3>
                            <p className="text-sm text-gray-500">
                              {property.city}, {property.state} {property.zip}
                            </p>
                          </div>
                        )}
                        
                        {!showPropertyDetails && propertyName && (
                          <div className="mb-4">
                            <h3 className="font-semibold text-gray-700 mb-1">{propertyName}</h3>
                          </div>
                        )}
                        
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
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}