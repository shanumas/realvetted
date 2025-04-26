import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { format } from "date-fns";
import { Loader2, CalendarIcon, Clock, Home, DollarSign, BedDouble, Bath, SquareCode, User, Check, X, Calendar as CalendarIcon2, Clock1 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { TimeInput } from "@/components/ui/time-input";

// Type definitions
interface ViewingRequest {
  id: number;
  propertyId: number;
  buyerId: number;
  buyerAgentId: number | null;
  sellerAgentId: number | null;
  requestedDate: string;
  requestedEndDate: string;
  confirmedDate: string | null;
  confirmedEndDate: string | null;
  status: string;
  notes: string | null;
  confirmedById: number | null;
  responseMessage: string | null;
  createdAt: string;
  updatedAt: string | null;
  buyer?: User;
  agent?: User;
}

interface Property {
  id: number;
  address: string;
  city: string | null;
  state: string | null;
  zip: string | null;
  price: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  squareFeet: number | null;
  description: string | null;
  status: string;
  type: string | null;
  yearBuilt: number | null;
  lotSize: number | null;
  photoUrls: string[] | null;
  mainPhotoUrl: string | null;
  sellerId: number | null;
  agentId: number | null;
}

interface User {
  id: number;
  email: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  role: string;
}

interface PublicViewingResponse {
  success: boolean;
  viewingRequest: ViewingRequest;
  property: Property;
  buyerName?: string;
  agentName?: string;
  error?: string;
}

export default function PublicViewingRequest() {
  const { token } = useParams();
  const { toast } = useToast();
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [startTime, setStartTime] = useState<string>("12:00");
  const [endTime, setEndTime] = useState<string>("13:00");
  const [responseMessage, setResponseMessage] = useState("");
  const [isRescheduling, setIsRescheduling] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data, isLoading, error, refetch } = useQuery<PublicViewingResponse>({
    queryKey: ["publicViewingRequest", token],
    queryFn: async () => {
      const response = await fetch(`/api/public/viewing/${token}`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to fetch viewing request");
      }
      return response.json();
    },
  });

  useEffect(() => {
    if (data?.viewingRequest) {
      // Pre-fill with the requested date and times for rescheduling
      setSelectedDate(new Date(data.viewingRequest.requestedDate));
      
      // Extract times from the date strings
      const requestedTime = new Date(data.viewingRequest.requestedDate);
      const requestedEndTime = new Date(data.viewingRequest.requestedEndDate);
      
      setStartTime(format(requestedTime, "HH:mm"));
      setEndTime(format(requestedEndTime, "HH:mm"));
    }
  }, [data]);

  const handleAccept = async () => {
    try {
      setIsSubmitting(true);
      const response = await fetch(`/api/public/viewing/${token}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          status: "accepted",
          confirmedDate: data?.viewingRequest.requestedDate,
          confirmedEndDate: data?.viewingRequest.requestedEndDate,
          responseMessage: responseMessage || "Viewing request accepted",
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to update viewing request");
      }

      toast({
        title: "Success!",
        description: "You have accepted the viewing request.",
      });

      refetch();
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReject = async () => {
    if (!responseMessage) {
      toast({
        title: "Missing information",
        description: "Please provide a reason for rejection",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsSubmitting(true);
      const response = await fetch(`/api/public/viewing/${token}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          status: "rejected",
          responseMessage,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to update viewing request");
      }

      toast({
        title: "Success!",
        description: "You have rejected the viewing request.",
      });

      refetch();
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReschedule = async () => {
    if (!selectedDate) {
      toast({
        title: "Missing information",
        description: "Please select a date for rescheduling",
        variant: "destructive",
      });
      return;
    }

    if (!responseMessage) {
      toast({
        title: "Missing information",
        description: "Please provide a reason for rescheduling",
        variant: "destructive",
      });
      return;
    }

    // Create date objects with the selected date and time
    const confirmedDate = new Date(selectedDate);
    const [startHours, startMinutes] = startTime.split(":").map(Number);
    const [endHours, endMinutes] = endTime.split(":").map(Number);
    
    confirmedDate.setHours(startHours, startMinutes, 0, 0);
    
    const confirmedEndDate = new Date(selectedDate);
    confirmedEndDate.setHours(endHours, endMinutes, 0, 0);

    try {
      setIsSubmitting(true);
      const response = await fetch(`/api/public/viewing/${token}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          status: "rescheduled",
          confirmedDate: confirmedDate.toISOString(),
          confirmedEndDate: confirmedEndDate.toISOString(),
          responseMessage,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to update viewing request");
      }

      toast({
        title: "Success!",
        description: "You have rescheduled the viewing request.",
      });

      setIsRescheduling(false);
      refetch();
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="mt-2 text-gray-500">Loading viewing request...</p>
      </div>
    );
  }

  if (error || !data?.success) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-red-600">Error</CardTitle>
            <CardDescription>
              Unable to load the viewing request.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600">
              {error instanceof Error
                ? error.message
                : data?.error || "Invalid or expired link."}
            </p>
          </CardContent>
          <CardFooter>
            <p className="text-xs text-gray-400">
              If you believe this is an error, please contact support.
            </p>
          </CardFooter>
        </Card>
      </div>
    );
  }

  const viewingRequest = data.viewingRequest;
  const property = data.property;
  
  // Format dates for display
  const requestedDate = new Date(viewingRequest.requestedDate);
  const requestedEndDate = new Date(viewingRequest.requestedEndDate);
  
  const formattedRequestedDate = format(requestedDate, "EEEE, MMMM d, yyyy");
  const formattedRequestedTime = `${format(requestedDate, "h:mm a")} - ${format(requestedEndDate, "h:mm a")}`;
  
  const confirmedDate = viewingRequest.confirmedDate ? new Date(viewingRequest.confirmedDate) : null;
  const confirmedEndDate = viewingRequest.confirmedEndDate ? new Date(viewingRequest.confirmedEndDate) : null;
  
  const formattedConfirmedDate = confirmedDate ? format(confirmedDate, "EEEE, MMMM d, yyyy") : null;
  const formattedConfirmedTime = confirmedDate && confirmedEndDate 
    ? `${format(confirmedDate, "h:mm a")} - ${format(confirmedEndDate, "h:mm a")}`
    : null;
  
  // Determine if the viewing request can be acted upon
  const isAcceptable = viewingRequest.status === "pending";
  const isRejectable = viewingRequest.status === "pending";
  const isReschedulable = viewingRequest.status === "pending";

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-primary p-4 text-white">
        <div className="container mx-auto">
          <h1 className="text-xl font-bold">Property Viewing Request</h1>
          <p className="text-sm opacity-90">
            Respond to the viewing request for {property.address}
          </p>
        </div>
      </header>
      
      <main className="container mx-auto p-4 flex-1 md:flex md:space-x-4">
        <div className="md:w-2/3 space-y-4">
          {/* Property Card */}
          <Card>
            <CardHeader>
              <CardTitle>Property Details</CardTitle>
              <CardDescription>Information about the property</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {property.mainPhotoUrl && (
                <div className="rounded-md overflow-hidden h-60 w-full">
                  <img
                    src={property.mainPhotoUrl}
                    alt={property.address}
                    className="h-full w-full object-cover"
                  />
                </div>
              )}
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="flex items-center space-x-2">
                  <Home className="h-5 w-5 text-gray-400" />
                  <span className="text-sm">{property.address}, {property.city}, {property.state} {property.zip}</span>
                </div>
                
                {property.price && (
                  <div className="flex items-center space-x-2">
                    <DollarSign className="h-5 w-5 text-gray-400" />
                    <span className="text-sm">${property.price.toLocaleString()}</span>
                  </div>
                )}
                
                {property.bedrooms && (
                  <div className="flex items-center space-x-2">
                    <BedDouble className="h-5 w-5 text-gray-400" />
                    <span className="text-sm">{property.bedrooms} Bedrooms</span>
                  </div>
                )}
                
                {property.bathrooms && (
                  <div className="flex items-center space-x-2">
                    <Bath className="h-5 w-5 text-gray-400" />
                    <span className="text-sm">{property.bathrooms} Bathrooms</span>
                  </div>
                )}
                
                {property.squareFeet && (
                  <div className="flex items-center space-x-2">
                    <SquareCode className="h-5 w-5 text-gray-400" />
                    <span className="text-sm">{property.squareFeet} sq ft</span>
                  </div>
                )}
                
                {property.type && (
                  <div className="flex items-center space-x-2">
                    <Home className="h-5 w-5 text-gray-400" />
                    <span className="text-sm">{property.type}</span>
                  </div>
                )}
              </div>
              
              {property.description && (
                <div className="mt-4">
                  <h3 className="text-sm font-medium mb-1">Description</h3>
                  <p className="text-sm text-gray-600">{property.description}</p>
                </div>
              )}
            </CardContent>
          </Card>
          
          {/* Viewing Request Card */}
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle>Viewing Request</CardTitle>
                <Badge
                  className={cn(
                    "capitalize",
                    viewingRequest.status === "accepted" && "bg-green-600",
                    viewingRequest.status === "rejected" && "bg-red-600",
                    viewingRequest.status === "rescheduled" && "bg-amber-600",
                    viewingRequest.status === "pending" && "bg-blue-600",
                    viewingRequest.status === "completed" && "bg-green-600",
                    viewingRequest.status === "cancelled" && "bg-gray-600"
                  )}
                >
                  {viewingRequest.status}
                </Badge>
              </div>
              <CardDescription>Details about the requested viewing</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center space-x-3">
                <User className="h-5 w-5 text-gray-400" />
                <div>
                  <p className="text-sm font-medium">Requested By</p>
                  <p className="text-sm text-gray-600">{data.buyerName}</p>
                </div>
              </div>
              
              {data.agentName && (
                <div className="flex items-center space-x-3">
                  <User className="h-5 w-5 text-gray-400" />
                  <div>
                    <p className="text-sm font-medium">Buyer's Agent</p>
                    <p className="text-sm text-gray-600">{data.agentName}</p>
                  </div>
                </div>
              )}
              
              <div className="flex items-center space-x-3">
                <CalendarIcon2 className="h-5 w-5 text-gray-400" />
                <div>
                  <p className="text-sm font-medium">Requested Date</p>
                  <p className="text-sm text-gray-600">{formattedRequestedDate}</p>
                </div>
              </div>
              
              <div className="flex items-center space-x-3">
                <Clock1 className="h-5 w-5 text-gray-400" />
                <div>
                  <p className="text-sm font-medium">Requested Time</p>
                  <p className="text-sm text-gray-600">{formattedRequestedTime}</p>
                </div>
              </div>
              
              {viewingRequest.notes && (
                <div className="flex items-start space-x-3">
                  <div className="mt-1">
                    <span className="block h-5 w-5 text-gray-400">📝</span>
                  </div>
                  <div>
                    <p className="text-sm font-medium">Notes</p>
                    <p className="text-sm text-gray-600">{viewingRequest.notes}</p>
                  </div>
                </div>
              )}
              
              {formattedConfirmedDate && (
                <>
                  <Separator />
                  <div className="flex items-center space-x-3">
                    <CalendarIcon2 className="h-5 w-5 text-gray-400" />
                    <div>
                      <p className="text-sm font-medium">Confirmed Date</p>
                      <p className="text-sm text-gray-600">{formattedConfirmedDate}</p>
                    </div>
                  </div>
                </>
              )}
              
              {formattedConfirmedTime && (
                <div className="flex items-center space-x-3">
                  <Clock1 className="h-5 w-5 text-gray-400" />
                  <div>
                    <p className="text-sm font-medium">Confirmed Time</p>
                    <p className="text-sm text-gray-600">{formattedConfirmedTime}</p>
                  </div>
                </div>
              )}
              
              {viewingRequest.responseMessage && (
                <div className="flex items-start space-x-3">
                  <div className="mt-1">
                    <span className="block h-5 w-5 text-gray-400">💬</span>
                  </div>
                  <div>
                    <p className="text-sm font-medium">Response Message</p>
                    <p className="text-sm text-gray-600">{viewingRequest.responseMessage}</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
        
        <div className="md:w-1/3 space-y-4 mt-4 md:mt-0">
          {/* Response Card */}
          <Card>
            <CardHeader>
              <CardTitle>Respond to Request</CardTitle>
              <CardDescription>
                {viewingRequest.status === "pending"
                  ? "Accept, reject, or suggest a new time"
                  : `This request has been ${viewingRequest.status}`}
              </CardDescription>
            </CardHeader>
            
            {viewingRequest.status === "pending" ? (
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="response-message">Message (optional)</Label>
                  <Textarea
                    id="response-message"
                    placeholder="Add a message for the buyer"
                    value={responseMessage}
                    onChange={(e) => setResponseMessage(e.target.value)}
                  />
                </div>
                
                <div className="flex space-x-2">
                  <Button
                    onClick={handleAccept}
                    className="flex-1"
                    disabled={!isAcceptable || isSubmitting}
                  >
                    {isSubmitting ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Check className="mr-2 h-4 w-4" />
                    )}
                    Accept
                  </Button>
                  
                  <Button
                    onClick={() => setIsRescheduling(true)}
                    variant="outline"
                    className="flex-1"
                    disabled={!isReschedulable || isSubmitting}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    Reschedule
                  </Button>
                  
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button
                        variant="destructive"
                        className="flex-1"
                        disabled={!isRejectable || isSubmitting}
                      >
                        <X className="mr-2 h-4 w-4" />
                        Reject
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Reject Viewing Request</DialogTitle>
                        <DialogDescription>
                          Please provide a reason for rejecting this viewing request.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4 py-4">
                        <div className="space-y-2">
                          <Label htmlFor="rejection-reason">Reason for rejection</Label>
                          <Textarea
                            id="rejection-reason"
                            placeholder="Explain why you're rejecting this viewing request"
                            value={responseMessage}
                            onChange={(e) => setResponseMessage(e.target.value)}
                            required
                          />
                        </div>
                      </div>
                      <DialogFooter>
                        <Button
                          variant="destructive"
                          onClick={handleReject}
                          disabled={isSubmitting}
                        >
                          {isSubmitting ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            "Confirm Rejection"
                          )}
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>
              </CardContent>
            ) : (
              <CardContent>
                <p className="text-sm text-gray-600">
                  This viewing request has already been processed. No further action is needed.
                </p>
              </CardContent>
            )}
          </Card>
          
          {/* Reschedule Dialog */}
          <Dialog open={isRescheduling} onOpenChange={setIsRescheduling}>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>Reschedule Viewing</DialogTitle>
                <DialogDescription>
                  Suggest a new date and time for this property viewing.
                </DialogDescription>
              </DialogHeader>
              
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Select Date</Label>
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={(date) => date && setSelectedDate(date)}
                    className="border rounded-md"
                    disabled={(date) => date < new Date()}
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="start-time">Start Time</Label>
                    <TimeInput
                      id="start-time"
                      value={startTime}
                      onChange={setStartTime}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="end-time">End Time</Label>
                    <TimeInput
                      id="end-time"
                      value={endTime}
                      onChange={setEndTime}
                    />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="reschedule-message">Message</Label>
                  <Textarea
                    id="reschedule-message"
                    placeholder="Explain why you're suggesting a new time"
                    value={responseMessage}
                    onChange={(e) => setResponseMessage(e.target.value)}
                    required
                  />
                </div>
              </div>
              
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setIsRescheduling(false)}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleReschedule}
                  disabled={!selectedDate || !responseMessage || isSubmitting}
                >
                  {isSubmitting ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    "Suggest New Time"
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </main>
      
      <footer className="bg-gray-100 p-4 text-center text-gray-500 text-sm">
        &copy; {new Date().getFullYear()} Real Estate App • Secured Property Viewing Request
      </footer>
    </div>
  );
}