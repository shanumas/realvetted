import { useQuery } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import { PropertyActivityLogWithUser } from "@shared/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, Clock, User } from "lucide-react";
import { format } from "date-fns";

interface PropertyActivityLogProps {
  propertyId: number;
}

export function PropertyActivityLog({ propertyId }: PropertyActivityLogProps) {
  const { data, isLoading } = useQuery<{ success: boolean; data: PropertyActivityLogWithUser[] }>({
    queryKey: [`/api/properties/${propertyId}/logs`],
    queryFn: getQueryFn({ on401: "throw" }),
  });
  
  const logs = data?.data;

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-40">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!logs || logs.length === 0) {
    return (
      <div className="py-4 px-6 text-center text-gray-500">
        No activity logs found for this property.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {logs.map((log) => (
        <Card key={log.id} className="border border-gray-200">
          <CardContent className="p-4">
            <div className="flex items-start gap-4">
              <div className="bg-primary/10 p-2 rounded-full">
                <Activity className="h-5 w-5 text-primary" />
              </div>
              
              <div className="flex-1">
                <div className="font-medium">{log.activity}</div>
                
                <div className="flex items-center mt-1 text-sm text-gray-500">
                  <Clock className="h-3.5 w-3.5 mr-1" />
                  <span>{format(new Date(log.timestamp), 'MMM d, yyyy h:mm a')}</span>
                  
                  {log.user && (
                    <>
                      <span className="mx-1">•</span>
                      <User className="h-3.5 w-3.5 mr-1" />
                      <span>
                        {log.user.firstName || log.user.lastName 
                          ? `${log.user.firstName || ''} ${log.user.lastName || ''}`.trim()
                          : log.user.email} ({log.user.role})
                      </span>
                    </>
                  )}
                </div>
                
                {/* Removed JSON display of log details */}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}