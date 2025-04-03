import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Loader2, Search, Link as LinkIcon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { PropertyAIData } from "@shared/types";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { extractPropertyFromUrl } from "@/lib/ai";

const addressSchema = z.object({
  address: z.string().min(1, "Property address is required"),
});

const urlSchema = z.object({
  url: z.string().url("Please enter a valid URL"),
});

type AddPropertyFormValues = z.infer<typeof addressSchema>;
type PropertyUrlFormValues = z.infer<typeof urlSchema>;

interface AddPropertyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function AddPropertyModal({ isOpen, onClose, onSuccess }: AddPropertyModalProps) {
  const { toast } = useToast();
  const [propertyData, setPropertyData] = useState<PropertyAIData | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [activeTab, setActiveTab] = useState<string>("address");

  // Address form
  const addressForm = useForm<AddPropertyFormValues>({
    resolver: zodResolver(addressSchema),
    defaultValues: {
      address: "",
    },
  });

  // URL form
  const urlForm = useForm<PropertyUrlFormValues>({
    resolver: zodResolver(urlSchema),
    defaultValues: {
      url: "",
    },
  });

  // Search property data using AI by address
  const searchPropertyByAddress = async (address: string) => {
    setIsSearching(true);
    try {
      const response = await apiRequest("POST", "/api/ai/extract-property", { address });
      const data = await response.json();
      setPropertyData(data);
    } catch (error) {
      toast({
        title: "Search failed",
        description: error instanceof Error ? error.message : "Failed to extract property data",
        variant: "destructive",
      });
    } finally {
      setIsSearching(false);
    }
  };

  // Extract property data from URL
  const searchPropertyByUrl = async (url: string) => {
    setIsSearching(true);
    try {
      // Use our client function to extract property details from URL
      const data = await extractPropertyFromUrl(url);
      setPropertyData(data);
      
      toast({
        title: "Property found",
        description: "Successfully extracted data from the listing URL.",
      });
    } catch (error) {
      toast({
        title: "URL scraping failed",
        description: error instanceof Error ? error.message : "Failed to extract property data from URL",
        variant: "destructive",
      });
    } finally {
      setIsSearching(false);
    }
  };

  // Add property mutation
  const addPropertyMutation = useMutation({
    mutationFn: async (data: PropertyAIData) => {
      const response = await apiRequest("POST", "/api/properties", data);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Property added",
        description: "The property has been added successfully.",
      });
      onSuccess();
    },
    onError: (error) => {
      toast({
        title: "Failed to add property",
        description: error instanceof Error ? error.message : "Something went wrong",
        variant: "destructive",
      });
    },
  });

  const onSearchAddressSubmit = addressForm.handleSubmit((values) => {
    searchPropertyByAddress(values.address);
  });

  const onSearchUrlSubmit = urlForm.handleSubmit((values) => {
    searchPropertyByUrl(values.url);
  });

  const handleAddProperty = () => {
    if (propertyData) {
      addPropertyMutation.mutate(propertyData);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[550px]">
        <DialogHeader>
          <DialogTitle>Add a Property</DialogTitle>
          <DialogDescription>
            Add a property by entering the address or providing a listing URL.
          </DialogDescription>
        </DialogHeader>
        
        <Tabs defaultValue="address" value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="address">By Address</TabsTrigger>
            <TabsTrigger value="url">By URL</TabsTrigger>
          </TabsList>
          
          <TabsContent value="address" className="space-y-4">
            <form onSubmit={onSearchAddressSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="property-address">Property Address</Label>
                <div className="flex space-x-2">
                  <Input
                    id="property-address"
                    placeholder="Enter full property address"
                    {...addressForm.register("address")}
                  />
                  <Button type="submit" disabled={isSearching} className="shrink-0">
                    {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  </Button>
                </div>
                {addressForm.formState.errors.address && (
                  <p className="text-sm text-red-500">{addressForm.formState.errors.address.message}</p>
                )}
              </div>
            </form>
          </TabsContent>
          
          <TabsContent value="url" className="space-y-4">
            <form onSubmit={onSearchUrlSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="property-url">Property Listing URL</Label>
                <div className="flex space-x-2">
                  <Input
                    id="property-url"
                    placeholder="https://www.zillow.com/homedetails/..."
                    {...urlForm.register("url")}
                  />
                  <Button type="submit" disabled={isSearching} className="shrink-0">
                    {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <LinkIcon className="h-4 w-4" />}
                  </Button>
                </div>
                {urlForm.formState.errors.url && (
                  <p className="text-sm text-red-500">{urlForm.formState.errors.url.message}</p>
                )}
                <p className="text-xs text-muted-foreground mt-1">
                  Supported sites: Zillow, Redfin, Realtor.com, etc.
                </p>
              </div>
            </form>
          </TabsContent>
        </Tabs>
          
        {/* AI Found Property Details */}
        {propertyData && (
          <div className="mt-4">
            <h4 className="text-sm font-medium text-gray-700 mb-2">AI Found Property Details:</h4>
            <div className="bg-gray-50 p-3 rounded-md">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-gray-500">Price:</span>
                  <span className="font-medium">
                    {propertyData.price ? `$${propertyData.price.toLocaleString()}` : "Unknown"}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500">Type:</span>
                  <span className="font-medium">
                    {propertyData.propertyType || "Unknown"}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500">Beds:</span>
                  <span className="font-medium">
                    {propertyData.bedrooms || "Unknown"}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500">Baths:</span>
                  <span className="font-medium">
                    {propertyData.bathrooms || "Unknown"}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500">Size:</span>
                  <span className="font-medium">
                    {propertyData.squareFeet ? `${propertyData.squareFeet.toLocaleString()} sqft` : "Unknown"}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500">Location:</span>
                  <span className="font-medium">
                    {propertyData.city && propertyData.state 
                      ? `${propertyData.city}, ${propertyData.state}` 
                      : "Unknown"}
                  </span>
                </div>
              </div>
              
              {/* Seller/Agent details */}
              {(propertyData.sellerName || propertyData.sellerEmail || propertyData.sellerPhone) && (
                <div className="mt-4 pt-3 border-t border-gray-200">
                  <h5 className="text-sm font-medium text-gray-700 mb-2">Seller/Agent Information:</h5>
                  <div className="space-y-2 text-sm">
                    {propertyData.sellerName && (
                      <div>
                        <span className="text-gray-500">Name:</span>
                        <span className="font-medium"> {propertyData.sellerName}</span>
                      </div>
                    )}
                    {propertyData.sellerCompany && (
                      <div>
                        <span className="text-gray-500">Company:</span>
                        <span className="font-medium"> {propertyData.sellerCompany}</span>
                      </div>
                    )}
                    {propertyData.sellerPhone && (
                      <div>
                        <span className="text-gray-500">Phone:</span>
                        <span className="font-medium"> {propertyData.sellerPhone}</span>
                      </div>
                    )}
                    {propertyData.sellerEmail && (
                      <div>
                        <span className="text-gray-500">Email:</span>
                        <span className="font-medium"> {propertyData.sellerEmail}</span>
                      </div>
                    )}
                    {propertyData.sellerLicenseNo && (
                      <div>
                        <span className="text-gray-500">License:</span>
                        <span className="font-medium"> {propertyData.sellerLicenseNo}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
        
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleAddProperty}
            disabled={!propertyData || addPropertyMutation.isPending}
          >
            {addPropertyMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            Add Property
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
