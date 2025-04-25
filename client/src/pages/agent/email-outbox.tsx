import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { SiteHeader } from "@/components/layout/site-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getQueryFn } from "@/lib/queryClient";
import { EmailList } from "@/components/email-outbox/email-list";
import { Mail, MessageSquare, AlertCircle } from "lucide-react";
import { Email } from "@shared/schema";

export default function AgentEmailOutbox() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("all");

  // Fetch user's emails
  const { data: userEmails, isLoading: isLoadingUserEmails } = useQuery<Email[]>({
    queryKey: ["/api/emails/user", user?.id],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!user?.id,
  });

  // Derived state for different tabs
  const sentEmails = userEmails?.filter(
    (email) => email.status === "sent"
  ) || [];
  
  const failedEmails = userEmails?.filter(
    (email) => email.status === "failed"
  ) || [];

  // Content based on the active tab
  const activeEmails = 
    activeTab === "all" ? userEmails || [] :
    activeTab === "sent" ? sentEmails :
    failedEmails;
  
  return (
    <div className="flex flex-col min-h-screen">
      <SiteHeader />
      <main className="flex-1 container py-6">
        <div className="flex flex-col space-y-6">
          <h1 className="text-3xl font-bold">Email Outbox</h1>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-500">Total Emails</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center">
                  <Mail className="h-5 w-5 text-blue-500 mr-2" />
                  <span className="text-2xl font-bold">{userEmails?.length || 0}</span>
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
          
          <Tabs defaultValue="all" value={activeTab} onValueChange={setActiveTab}>
            <TabsList>
              <TabsTrigger value="all" className="flex items-center">
                <Mail className="h-4 w-4 mr-2" />
                All Emails
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
              <EmailList emails={activeEmails} isLoading={isLoadingUserEmails} />
            </TabsContent>
            
            <TabsContent value="sent" className="mt-6">
              <EmailList emails={activeEmails} isLoading={isLoadingUserEmails} />
            </TabsContent>
            
            <TabsContent value="failed" className="mt-6">
              <EmailList emails={activeEmails} isLoading={isLoadingUserEmails} />
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
}