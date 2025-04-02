import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { PropertyCard } from "@/components/property-card";
import { AddPropertyModal } from "@/components/add-property-modal";
import { SiteHeader } from "@/components/layout/site-header";
import { Property } from "@shared/schema";
import { getQueryFn, queryClient } from "@/lib/queryClient";
import { deleteProperty } from "@/lib/ai";
import { Loader2, PlusIcon, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function BuyerDashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [propertyToDelete, setPropertyToDelete] = useState<number | null>(null);

  const { data: properties, isLoading, refetch } = useQuery<Property[]>({
    queryKey: ["/api/properties/by-buyer"],
    queryFn: getQueryFn({ on401: "throw" }),
  });

  const handleAddPropertySuccess = () => {
    setIsModalOpen(false);
    refetch();
  };
  
  const deleteMutation = useMutation({
    mutationFn: (propertyId: number) => {
      return deleteProperty(propertyId);
    },
    onSuccess: () => {
      toast({
        title: "Property deleted",
        description: "Property has been successfully deleted",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/properties/by-buyer"] });
      setPropertyToDelete(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
      setPropertyToDelete(null);
    },
  });

  return (
    <div className="min-h-screen bg-gray-50">
      <SiteHeader />
      
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        {/* Welcome Banner */}
        <div className="px-4 py-5 sm:px-6 bg-white shadow rounded-lg mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg leading-6 font-medium text-gray-900">
                Welcome, {user?.firstName || 'Buyer'}!
              </h3>
              <p className="mt-1 max-w-2xl text-sm text-gray-500">
                Start your property search by adding a new property address below.
              </p>
            </div>
            <Button onClick={() => setIsModalOpen(true)}>
              <PlusIcon className="mr-2 h-4 w-4" />
              Add Property
            </Button>
          </div>
        </div>
        
        {/* Property List */}
        <div className="bg-white shadow rounded-lg">
          <div className="px-4 py-5 sm:px-6 border-b border-gray-200">
            <h3 className="text-lg leading-6 font-medium text-gray-900">My Properties</h3>
            <p className="mt-1 text-sm text-gray-500">Properties you've added to track</p>
          </div>
          
          {isLoading ? (
            <div className="p-8 flex justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : properties && properties.length > 0 ? (
            <div className="divide-y divide-gray-200">
              {properties.map((property) => (
                <PropertyCard
                  key={property.id}
                  property={property}
                  actionButton={
                    <Link href={`/buyer/property/${property.id}`}>
                      <Button variant="outline" size="sm">
                        View Details
                      </Button>
                    </Link>
                  }
                />
              ))}
            </div>
          ) : (
            <div className="px-4 sm:px-6 py-10">
              <p className="text-center text-gray-500">
                You haven't added any properties yet. Add your first property to get started.
              </p>
            </div>
          )}
        </div>
      </main>
      
      <AddPropertyModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={handleAddPropertySuccess}
      />
    </div>
  );
}
