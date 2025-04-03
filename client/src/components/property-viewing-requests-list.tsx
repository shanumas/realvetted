import { useState } from "react";
import { format, parseISO, addDays, addHours, setHours, setMinutes } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar, Clock } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { ViewingRequestWithParticipants } from "@shared/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

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
  const { toast } = useToast();
  
  // Dialog state for requesting different time
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<ViewingRequestWithParticipants | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [selectedTime, setSelectedTime] = useState("12:00");
  const [durationHours, setDurationHours] = useState("2");
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Calculate the minimum date for scheduling (24 hours from now)
  const minimumDate = addDays(new Date(), 1);
  
  // Debugging output
  console.log("ViewingRequests received:", viewingRequests);
  
  // Ensure viewingRequests is not undefined and is an array
  const validRequests = Array.isArray(viewingRequests) ? viewingRequests : [];
  console.log("Valid requests array:", validRequests);
  
  // Filter requests based on active tab
  const filteredRequests = validRequests.filter(request => {
    // Additional debugging to check each request and its status
    console.log("Request being filtered:", request, "Status:", request.status, "Active tab:", activeTab);
    
    if (activeTab === "pending") return request.status === "pending";
    if (activeTab === "approved") return request.status === "approved";
    if (activeTab === "rejected") return request.status === "rejected";
    if (activeTab === "completed") return request.status === "completed";
    return true; // Show all requests on "all" tab
  });
  
  console.log("Filtered requests for tab", activeTab, ":", filteredRequests);
  
  // Get counts for badges
  const pendingCount = validRequests.filter(req => req.status === "pending").length || 0;
  const approvedCount = validRequests.filter(req => req.status === "approved").length || 0;
  const rejectedCount = validRequests.filter(req => req.status === "rejected").length || 0;
  const completedCount = validRequests.filter(req => req.status === "completed").length || 0;
  
  // Open the dialog for requesting a different time
  const openRequestDialog = (request: ViewingRequestWithParticipants) => {
    setSelectedRequest(request);
    
    // Default to a date 2 days from now
    const defaultDate = addDays(new Date(), 2);
    setSelectedDate(defaultDate);
    
    // Default time to 12:00 PM
    setSelectedTime("12:00");
    
    // Default duration to 2 hours
    setDurationHours("2");
    
    // Clear notes
    setNotes("");
    
    // Open the dialog
    setDialogOpen(true);
  };
  
  // Handle delete request
  const handleDeleteRequest = async (requestId: number) => {
    if (!confirm("Are you sure you want to delete this viewing request?")) {
      return;
    }
    
    try {
      setIsSubmitting(true);
      
      // Send the delete request to the server - don't check response.ok as apiRequest already handles this
      await apiRequest("DELETE", `/api/viewing-requests/${requestId}`);
      
      // Show success message
      toast({
        title: "Request Deleted",
        description: "Your viewing request has been deleted successfully.",
        variant: "default"
      });
      
      // Invalidate both relevant query caches so the UI updates
      const propertyId = viewingRequests[0]?.propertyId;
      if (propertyId) {
        queryClient.invalidateQueries({ queryKey: [`/api/properties/${propertyId}/viewing-requests`] });
        queryClient.invalidateQueries({ queryKey: ['/api/viewing-requests/buyer'] });
      } else {
        // If we don't have a propertyId, invalidate all viewing request queries
        queryClient.invalidateQueries({ queryKey: ['/api/viewing-requests'] });
      }
      
      // Also invalidate the auth user query to ensure we're still logged in
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
    } catch (error) {
      console.error("Error deleting viewing request:", error);
      toast({
        title: "Error",
        description: "Failed to delete viewing request. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };
  
  // Handle form submission
  const handleSubmit = async () => {
    if (!selectedRequest || !selectedDate || !selectedTime) {
      toast({
        title: "Missing Information",
        description: "Please provide all required information",
        variant: "destructive"
      });
      return;
    }
    
    try {
      setIsSubmitting(true);
      
      // Parse the time string (format: "HH:MM")
      const [hours, minutes] = selectedTime.split(":").map(Number);
      
      // Set the time on the selected date
      let requestedDate = setHours(selectedDate, hours);
      requestedDate = setMinutes(requestedDate, minutes);
      
      // Calculate the end date/time based on duration
      const requestedEndDate = addHours(requestedDate, parseInt(durationHours));
      
      // Create the request payload
      const payload = {
        propertyId: selectedRequest.propertyId,
        requestedDate: requestedDate.toISOString(),
        requestedEndDate: requestedEndDate.toISOString(),
        notes,
        override: true // This flag indicates we're replacing an existing request
      };
      
      // Send the request to the server - don't check response.ok as apiRequest already handles this
      await apiRequest("POST", "/api/viewing-requests", payload);
      
      // Show success message
      toast({
        title: "Request Submitted",
        description: "Your viewing request has been submitted successfully and will replace the previous request.",
        variant: "default"
      });
      
      // Close the dialog
      setDialogOpen(false);
      
      // Invalidate queries to update the UI
      queryClient.invalidateQueries({ queryKey: [`/api/properties/${selectedRequest.propertyId}/viewing-requests`] });
      queryClient.invalidateQueries({ queryKey: ['/api/viewing-requests/buyer'] });
      
      // Also invalidate the auth user query to ensure we're still logged in
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
    } catch (error) {
      console.error("Error submitting viewing request:", error);
      toast({
        title: "Error",
        description: "Failed to submit viewing request. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Dialog for requesting a different time */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Request Different Viewing Time</DialogTitle>
            <DialogDescription>
              Choose a new date and time to view this property. 
              This will replace your current pending request.
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="date">Date (must be at least 24 hours from now)</Label>
              <DatePicker 
                date={selectedDate} 
                setDate={setSelectedDate}
                fromDate={minimumDate}
                label="Select a date"
              />
            </div>
            
            <div className="grid gap-2">
              <Label htmlFor="time">Time</Label>
              <Select
                value={selectedTime}
                onValueChange={setSelectedTime}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a time" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="9:00">9:00 AM</SelectItem>
                  <SelectItem value="9:30">9:30 AM</SelectItem>
                  <SelectItem value="10:00">10:00 AM</SelectItem>
                  <SelectItem value="10:30">10:30 AM</SelectItem>
                  <SelectItem value="11:00">11:00 AM</SelectItem>
                  <SelectItem value="11:30">11:30 AM</SelectItem>
                  <SelectItem value="12:00">12:00 PM</SelectItem>
                  <SelectItem value="12:30">12:30 PM</SelectItem>
                  <SelectItem value="13:00">1:00 PM</SelectItem>
                  <SelectItem value="13:30">1:30 PM</SelectItem>
                  <SelectItem value="14:00">2:00 PM</SelectItem>
                  <SelectItem value="14:30">2:30 PM</SelectItem>
                  <SelectItem value="15:00">3:00 PM</SelectItem>
                  <SelectItem value="15:30">3:30 PM</SelectItem>
                  <SelectItem value="16:00">4:00 PM</SelectItem>
                  <SelectItem value="16:30">4:30 PM</SelectItem>
                  <SelectItem value="17:00">5:00 PM</SelectItem>
                  <SelectItem value="17:30">5:30 PM</SelectItem>
                  <SelectItem value="18:00">6:00 PM</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="grid gap-2">
              <Label htmlFor="duration">Duration (hours)</Label>
              <Select
                value={durationHours}
                onValueChange={setDurationHours}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select duration" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 hour</SelectItem>
                  <SelectItem value="2">2 hours</SelectItem>
                  <SelectItem value="3">3 hours</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="grid gap-2">
              <Label htmlFor="notes">Notes (optional)</Label>
              <Textarea
                id="notes"
                placeholder="Add any special requests or notes here"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button 
              onClick={handleSubmit}
              disabled={isSubmitting || !selectedDate || !selectedTime}
            >
              {isSubmitting ? "Submitting..." : "Submit Request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
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
                  
                  // Previously this was returning null in a specific condition which could stop all requests from showing
                  // Now we'll just render each request
                  
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
                      
                      {/* Add buttons for request management */}
                      {request.status === "pending" && user?.role === "buyer" && (
                        <CardFooter className="bg-gray-50 pt-2 pb-3 px-4 flex justify-end gap-2">
                          <Button 
                            variant="outline"
                            onClick={() => openRequestDialog(request)}
                            className="text-sm"
                          >
                            Request Different Time
                          </Button>
                          <Button 
                            variant="destructive"
                            onClick={() => handleDeleteRequest(request.id)}
                            className="text-sm"
                          >
                            Delete Request
                          </Button>
                        </CardFooter>
                      )}
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