import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { SiteHeader } from "@/components/layout/site-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getQueryFn } from "@/lib/queryClient";
import { EmailList } from "@/components/email-outbox/email-list";
import { Mail, MessageSquare, Users, FileText, AlertCircle, User, Filter } from "lucide-react";
import { Email } from "@shared/schema";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";

export default function EmailOutbox() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("all");
  const [selectedRole, setSelectedRole] = useState<string | null>(null);

  // Fetch all emails
  const { data: allEmails, isLoading: isLoadingAllEmails } = useQuery<Email[]>({
    queryKey: ["/api/emails"],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: user?.role === "admin",
  });

  // Fetch user's emails
  const { data: userEmails, isLoading: isLoadingUserEmails } = useQuery<Email[]>({
    queryKey: ["/api/emails/user", user?.id],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!user?.id,
  });

  // Fetch role-specific emails (for buyer filtering)
  const { data: roleEmails, isLoading: isLoadingRoleEmails } = useQuery<Email[]>({
    queryKey: ["/api/emails/role", selectedRole],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!selectedRole && user?.role === "admin",
  });

  // Determine which email set to display based on active tab and role filter
  const getDisplayedEmails = () => {
    if (selectedRole) {
      return roleEmails || [];
    }
    return activeTab === "all" ? allEmails : userEmails;
  };
  
  // Derived state for different tabs
  const displayedEmails = getDisplayedEmails();
  
  const sentEmails = displayedEmails?.filter(
    (email) => email.status === "sent"
  ) || [];
  
  const failedEmails = displayedEmails?.filter(
    (email) => email.status === "failed"
  ) || [];

  const isLoading = selectedRole 
    ? isLoadingRoleEmails 
    : (activeTab === "all" ? isLoadingAllEmails : isLoadingUserEmails);
  
  const emails = displayedEmails || [];
  
  // Handle role filter change
  const handleRoleFilterChange = (value: string) => {
    if (value === "all") {
      setSelectedRole(null);
    } else {
      setSelectedRole(value);
    }
  };

  // Clear all filters
  const clearFilters = () => {
    setSelectedRole(null);
    setActiveTab("all");
  };
  
  return (
    <div className="flex flex-col min-h-screen">
      <SiteHeader />
      <main className="flex-1 container py-6">
        <div className="flex flex-col space-y-6">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
            <h1 className="text-3xl font-bold">Email Outbox</h1>
            
            {user?.role === "admin" && (
              <div className="flex flex-col sm:flex-row gap-3">
                <Select 
                  value={selectedRole || "all"} 
                  onValueChange={handleRoleFilterChange}
                >
                  <SelectTrigger className="w-full sm:w-[180px]">
                    <div className="flex items-center">
                      <Filter className="h-4 w-4 mr-2" />
                      <SelectValue placeholder="Filter by role" />
                    </div>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Roles</SelectItem>
                    <SelectItem value="buyer">
                      <div className="flex items-center">
                        <User className="h-4 w-4 mr-2 text-blue-500" />
                        Buyer Emails
                      </div>
                    </SelectItem>
                    <SelectItem value="agent">
                      <div className="flex items-center">
                        <User className="h-4 w-4 mr-2 text-green-500" />
                        Agent Emails
                      </div>
                    </SelectItem>
                    <SelectItem value="admin">
                      <div className="flex items-center">
                        <User className="h-4 w-4 mr-2 text-purple-500" />
                        Admin Emails
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
                
                {(selectedRole) && (
                  <Button 
                    variant="outline" 
                    onClick={clearFilters}
                    className="flex items-center"
                  >
                    <Filter className="h-4 w-4 mr-2" />
                    Clear Filters
                  </Button>
                )}
              </div>
            )}
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-500">Total Emails</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center">
                  <Mail className="h-5 w-5 text-blue-500 mr-2" />
                  <span className="text-2xl font-bold">{emails?.length || 0}</span>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-500">Sent Successfully</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center">
                  <MessageSquare className="h-5 w-5 text-green-500 mr-2" />
                  <span className="text-2xl font-bold">{sentEmails.length}</span>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-500">Failed Emails</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center">
                  <AlertCircle className="h-5 w-5 text-red-500 mr-2" />
                  <span className="text-2xl font-bold">{failedEmails.length}</span>
                </div>
              </CardContent>
            </Card>
          </div>
          
          {selectedRole ? (
            <div className="bg-blue-50 p-4 rounded-md flex items-center">
              <Filter className="h-5 w-5 text-blue-500 mr-2" />
              <span>
                <strong>Filtered:</strong> Showing emails from {selectedRole === "buyer" ? "Buyers" : selectedRole === "agent" ? "Agents" : "Admins"}
              </span>
            </div>
          ) : (
            <Tabs defaultValue="all" value={activeTab} onValueChange={setActiveTab}>
              <TabsList>
                {user?.role === "admin" && (
                  <TabsTrigger value="all" className="flex items-center">
                    <Mail className="h-4 w-4 mr-2" />
                    All Emails
                  </TabsTrigger>
                )}
                <TabsTrigger value="user" className="flex items-center">
                  <Users className="h-4 w-4 mr-2" />
                  My Emails
                </TabsTrigger>
                <TabsTrigger value="sent" className="flex items-center">
                  <MessageSquare className="h-4 w-4 mr-2" />
                  Sent Successfully
                </TabsTrigger>
                <TabsTrigger value="failed" className="flex items-center">
                  <AlertCircle className="h-4 w-4 mr-2" />
                  Failed Emails
                </TabsTrigger>
              </TabsList>
              
              <TabsContent value="all" className="mt-6">
                <EmailList emails={emails || []} isLoading={isLoading} />
              </TabsContent>
              
              <TabsContent value="user" className="mt-6">
                <EmailList emails={userEmails || []} isLoading={isLoadingUserEmails} />
              </TabsContent>
              
              <TabsContent value="sent" className="mt-6">
                <EmailList emails={sentEmails} isLoading={isLoading} />
              </TabsContent>
              
              <TabsContent value="failed" className="mt-6">
                <EmailList emails={failedEmails} isLoading={isLoading} />
              </TabsContent>
            </Tabs>
          )}
          
          {selectedRole && (
            <div className="mt-6">
              <EmailList emails={emails} isLoading={isLoading} />
            </div>
          )}
        </div>
      </main>
    </div>
  );
}