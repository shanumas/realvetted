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
    <div className="px-6 py-6 border-b border-gray-200 hover:bg-gray-50 transition-colors duration-150">
      <div className="flex flex-col sm:flex-row justify-between">
        <div className="mb-4 sm:mb-0">
          <Link to={getLinkPath()}>
            <h4 className="text-lg font-semibold text-gray-900 hover:text-primary cursor-pointer">
              {property.address}
            </h4>
          </Link>
          
          {property.city && property.state && (
            <div className="mt-1 text-sm text-gray-500">
              {property.city}, {property.state} {property.zip}
            </div>
          )}
          
          <div className="mt-3 flex flex-wrap items-center text-sm text-gray-600 gap-3">
            {property.bedrooms && (
              <span className="flex items-center px-2 py-1 bg-blue-50 rounded-md">
                <Bed className="mr-1.5 h-4 w-4 text-blue-500" /> 
                <span className="font-medium">{property.bedrooms}</span> beds
              </span>
            )}
            
            {property.bathrooms && (
              <span className="flex items-center px-2 py-1 bg-purple-50 rounded-md">
                <Bath className="mr-1.5 h-4 w-4 text-purple-500" /> 
                <span className="font-medium">{property.bathrooms}</span> baths
              </span>
            )}
            
            {property.squareFeet && (
              <span className="flex items-center px-2 py-1 bg-green-50 rounded-md">
                <Square className="mr-1.5 h-4 w-4 text-green-500" /> 
                <span className="font-medium">{property.squareFeet.toLocaleString()}</span> sqft
              </span>
            )}
            
            {property.propertyType && (
              <span className="flex items-center px-2 py-1 bg-amber-50 rounded-md">
                <Home className="mr-1.5 h-4 w-4 text-amber-500" /> 
                {property.propertyType}
              </span>
            )}
          </div>
          
          {property.price && (
            <div className="mt-3 font-semibold text-primary text-lg">
              ${property.price.toLocaleString()}
            </div>
          )}
        </div>
        
        <div className="flex flex-col sm:items-end space-y-3">
          {property.agentId && (
            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 px-3 py-1 rounded-md">
              <span className="flex items-center">
                Agent Assigned
              </span>
            </Badge>
          )}
          
          {actionButton}
        </div>
      </div>
    </div>
  );
}
