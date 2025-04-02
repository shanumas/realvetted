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
import { Loader2, Search } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { PropertyAIData } from "@shared/types";

const addressSchema = z.object({
  address: z.string().min(1, "Property address is required"),
});

type AddPropertyFormValues = z.infer<typeof addressSchema>;

interface AddPropertyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function AddPropertyModal({ isOpen, onClose, onSuccess }: AddPropertyModalProps) {
  const { toast } = useToast();
  const [propertyData, setPropertyData] = useState<PropertyAIData | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm<AddPropertyFormValues>({
    resolver: zodResolver(addressSchema),
    defaultValues: {
      address: "",
    },
  });

  // Search property data using AI
  const searchProperty = async (address: string) => {
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

  const onSearchSubmit = (values: AddPropertyFormValues) => {
    searchProperty(values.address);
  };

  const handleAddProperty = () => {
    if (propertyData) {
      addPropertyMutation.mutate(propertyData);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a Property</DialogTitle>
          <DialogDescription>
            Enter the property address and our AI will automatically extract available details.
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit(onSearchSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="property-address">Property Address</Label>
            <div className="flex space-x-2">
              <Input
                id="property-address"
                placeholder="Enter full property address"
                {...register("address")}
              />
              <Button type="submit" disabled={isSearching} className="shrink-0">
                {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              </Button>
            </div>
            {errors.address && (
              <p className="text-sm text-red-500">{errors.address.message}</p>
            )}
          </div>
          
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
                {propertyData.sellerEmail && (
                  <div className="mt-3">
                    <span className="text-gray-500">Seller Email:</span>
                    <span className="font-medium"> {propertyData.sellerEmail}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </form>
        
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
