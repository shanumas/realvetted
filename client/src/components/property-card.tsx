import { Property } from "@shared/schema";
import { Badge } from "@/components/ui/badge";
import { Bed, Bath, Square, Tag, Home } from "lucide-react";
import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";

interface PropertyCardProps {
  property: Property;
  actionButton?: React.ReactNode;
  customLinkPath?: string; // Allow for custom link override
}

export function PropertyCard({ property, actionButton, customLinkPath }: PropertyCardProps) {
  const { user } = useAuth();
  
  // Determine the correct link path based on user role or custom override
  const getLinkPath = () => {
    if (customLinkPath) {
      return customLinkPath;
    }
    
    // Default paths based on user role
    switch (user?.role) {
      case 'buyer':
        return `/buyer/property/${property.id}`;
      case 'seller':
        return `/seller/property/${property.id}`;
      case 'agent':
        return `/agent/property/${property.id}`;
      default:
        return `/property/${property.id}`;
    }
  };

  return (
    <div className="border-b border-gray-200 px-4 py-5 sm:px-6">
      <div className="flex flex-col sm:flex-row justify-between">
        <div className="mb-4 sm:mb-0">
          <Link to={getLinkPath()}>
            <h4 className="text-lg font-medium text-gray-900 hover:text-primary hover:underline cursor-pointer">
              {property.address}
            </h4>
          </Link>
          <div className="mt-2 flex flex-wrap items-center text-sm text-gray-500 gap-2">
            {property.bedrooms && (
              <span className="flex items-center mr-4">
                <Bed className="mr-1 h-4 w-4" /> {property.bedrooms} beds
              </span>
            )}
            
            {property.bathrooms && (
              <span className="flex items-center mr-4">
                <Bath className="mr-1 h-4 w-4" /> {property.bathrooms} baths
              </span>
            )}
            
            {property.squareFeet && (
              <span className="flex items-center mr-4">
                <Square className="mr-1 h-4 w-4" /> {property.squareFeet.toLocaleString()} sqft
              </span>
            )}
            
            {property.price && (
              <span className="flex items-center">
                <Tag className="mr-1 h-4 w-4" /> ${property.price.toLocaleString()}
              </span>
            )}
            
            {property.propertyType && (
              <span className="flex items-center ml-4">
                <Home className="mr-1 h-4 w-4" /> {property.propertyType}
              </span>
            )}
          </div>
          
          {property.city && property.state && (
            <div className="mt-1 text-sm text-gray-500">
              {property.city}, {property.state} {property.zip}
            </div>
          )}
        </div>
        
        <div className="flex flex-col sm:flex-row sm:items-center space-y-2 sm:space-y-0 sm:space-x-3">
          {property.agentId && (
            <Badge variant="outline" className="bg-green-100 text-green-800 border-green-200 w-fit">
              Agent Assigned
            </Badge>
          )}
          
          {actionButton}
        </div>
      </div>
    </div>
  );
}
