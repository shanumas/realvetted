import React, { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { SiteHeader } from "@/components/layout/site-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getQueryFn, apiRequest, queryClient } from "@/lib/queryClient";
import { User, Property } from "@shared/schema";
import { 
  Loader2, UserX, UserCheck, Shield, RefreshCw, Settings, Mail, Home, Users, UserCog
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";

// Define schema for email settings form
const emailSettingsSchema = z.object({
  testEmail: z.string().email("Please enter a valid email address").or(z.literal("")),
  enableTestMode: z.boolean(),
});

type EmailSettingsValues = z.infer<typeof emailSettingsSchema>;

export default function AdminDashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("buyers");
  const [userSubTab, setUserSubTab] = useState("buyers");
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [reassignDialogOpen, setReassignDialogOpen] = useState(false);
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState<number | null>(null);

  // Initialize form for email settings
  const emailSettingsForm = useForm<EmailSettingsValues>({
    resolver: zodResolver(emailSettingsSchema),
    defaultValues: {
      testEmail: "",
      enableTestMode: false,
    }
  });

  // Get current email settings (if set in localStorage for demo purposes or from server in production)
  const { data: emailSettings, isLoading: isLoadingEmailSettings } = useQuery<{ testEmail: string, enableTestMode: boolean }>({
    queryKey: ["/api/admin/email-settings"],
    queryFn: async () => {
      // For simplicity in demo, we'll use localStorage
      const settings = localStorage.getItem("emailSettings");
      if (settings) {
        return JSON.parse(settings);
      }
      return { testEmail: "", enableTestMode: false };
    }
  });
  
  // Set form values when emailSettings load
  React.useEffect(() => {
    if (emailSettings) {
      emailSettingsForm.reset(emailSettings);
    }
  }, [emailSettings, emailSettingsForm]);

  // Mutation for saving email settings
  const saveEmailSettingsMutation = useMutation({
    mutationFn: async (data: EmailSettingsValues) => {
      // For demo, save to localStorage
      localStorage.setItem("emailSettings", JSON.stringify(data));
      // In production, would call API:
      // const response = await apiRequest("PUT", "/api/admin/email-settings", data);
      // return response.json();
      return data;
    },
    onSuccess: () => {
      toast({
        title: "Email settings saved",
        description: "Your email settings have been updated successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/email-settings"] });
    },
    onError: (error) => {
      toast({
        title: "Failed to save settings",
        description: error instanceof Error ? error.message : "Something went wrong",
        variant: "destructive",
      });
    },
  });

  // Handle email settings form submission
  const onEmailSettingsSubmit = (data: EmailSettingsValues) => {
    saveEmailSettingsMutation.mutate(data);
  };

  // Fetch all users
  const { data: allUsers, isLoading: isLoadingAllUsers } = useQuery<User[]>({
    queryKey: ["/api/admin/users"],
    queryFn: getQueryFn({ on401: "throw" }),
  });

  // Filter users based on role
  const buyers = allUsers?.filter(u => u.role === "buyer") || [];
  const sellers = allUsers?.filter(u => u.role === "seller") || [];
  const agentUsers = allUsers?.filter(u => u.role === "agent") || [];
  
  // Define current users based on selected tab
  const users = userSubTab === "buyers" 
    ? buyers 
    : userSubTab === "sellers" 
      ? sellers 
      : userSubTab === "agents" 
        ? agentUsers 
        : allUsers;
  
  const isLoadingUsers = isLoadingAllUsers;

  // Fetch properties
  const { data: properties, isLoading: isLoadingProperties } = useQuery<Property[]>({
    queryKey: ["/api/admin/properties"],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: activeTab === "properties",
  });

  // Fetch agents for reassignment
  const { data: agents, isLoading: isLoadingAgents } = useQuery<User[]>({
    queryKey: ["/api/admin/agents"],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: reassignDialogOpen,
  });

  // Block/Unblock user mutation
  const toggleBlockMutation = useMutation({
    mutationFn: async ({ userId, block }: { userId: number; block: boolean }) => {
      const response = await apiRequest("PUT", `/api/admin/users/${userId}/block`, { block });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "User status updated",
        description: "The user's block status has been updated successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
    },
    onError: (error) => {
      toast({
        title: "Failed to update user",
        description: error instanceof Error ? error.message : "Something went wrong",
        variant: "destructive",
      });
    },
  });

  // Reassign agent mutation
  const reassignAgentMutation = useMutation({
    mutationFn: async ({ propertyId, agentId }: { propertyId: number; agentId: number }) => {
      const response = await apiRequest("PUT", `/api/admin/properties/${propertyId}/reassign`, { agentId });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Agent reassigned",
        description: "The property has been assigned to a new agent.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/properties"] });
      setReassignDialogOpen(false);
      setSelectedProperty(null);
      setSelectedAgentId(null);
    },
    onError: (error) => {
      toast({
        title: "Failed to reassign agent",
        description: error instanceof Error ? error.message : "Something went wrong",
        variant: "destructive",
      });
    },
  });

  const handleToggleBlock = (userId: number, currentlyBlocked: boolean) => {
    toggleBlockMutation.mutate({ userId, block: !currentlyBlocked });
  };

  const openReassignDialog = (property: Property) => {
    setSelectedProperty(property);
    setReassignDialogOpen(true);
  };

  const handleReassignAgent = () => {
    if (selectedProperty && selectedAgentId) {
      reassignAgentMutation.mutate({
        propertyId: selectedProperty.id,
        agentId: selectedAgentId,
      });
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <SiteHeader />
      
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        {/* Admin Header */}
        <Card className="mb-6">
          <CardContent className="p-6">
            <div className="flex items-center">
              <Shield className="h-6 w-6 mr-2 text-primary" />
              <div>
                <h3 className="text-lg leading-6 font-medium text-gray-900">
                  Admin Dashboard
                </h3>
                <p className="mt-1 text-sm text-gray-500">
                  Manage users and properties across the platform
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-4">
            <TabsTrigger value="buyers" className="flex items-center">
              <Users className="mr-2 h-4 w-4" /> Buyers
            </TabsTrigger>
            <TabsTrigger value="sellers" className="flex items-center">
              <Home className="mr-2 h-4 w-4" /> Sellers
            </TabsTrigger>
            <TabsTrigger value="agents" className="flex items-center">
              <UserCog className="mr-2 h-4 w-4" /> Agents
            </TabsTrigger>
            <TabsTrigger value="properties" className="flex items-center">
              <Home className="mr-2 h-4 w-4" /> Properties
            </TabsTrigger>
            <TabsTrigger value="settings" className="flex items-center">
              <Settings className="mr-2 h-4 w-4" /> Settings
            </TabsTrigger>
          </TabsList>
          
          {/* Buyers Tab */}
          <TabsContent value="buyers">
            <Card>
              <CardHeader>
                <CardTitle>Buyer Management</CardTitle>
                <CardDescription>
                  View and manage all buyer accounts
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoadingUsers ? (
                  <div className="flex justify-center p-8">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                ) : !buyers || buyers.length === 0 ? (
                  <div className="text-center p-8 text-gray-500">
                    <p>No buyers found.</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {buyers.map((user) => (
                        <TableRow key={user.id}>
                          <TableCell>{user.firstName} {user.lastName}</TableCell>
                          <TableCell>{user.email}</TableCell>
                          <TableCell>
                            <span className={`px-2 py-1 rounded-full text-xs ${
                              user.isBlocked ? "bg-red-100 text-red-800" : "bg-green-100 text-green-800"
                            }`}>
                              {user.isBlocked ? "Blocked" : "Active"}
                            </span>
                          </TableCell>
                          <TableCell>
                            <Button
                              variant={user.isBlocked ? "outline" : "destructive"}
                              size="sm"
                              onClick={() => handleToggleBlock(user.id, user.isBlocked === true)}
                              disabled={toggleBlockMutation.isPending && selectedUserId === user.id}
                            >
                              {toggleBlockMutation.isPending && selectedUserId === user.id ? (
                                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                              ) : user.isBlocked ? (
                                <UserCheck className="h-4 w-4 mr-1" />
                              ) : (
                                <UserX className="h-4 w-4 mr-1" />
                              )}
                              {user.isBlocked ? "Unblock" : "Block"}
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          
          {/* Sellers Tab */}
          <TabsContent value="sellers">
            <Card>
              <CardHeader>
                <CardTitle>Seller Management</CardTitle>
                <CardDescription>
                  View and manage all seller accounts
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoadingUsers ? (
                  <div className="flex justify-center p-8">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                ) : !sellers || sellers.length === 0 ? (
                  <div className="text-center p-8 text-gray-500">
                    <p>No sellers found.</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sellers.map((user) => (
                        <TableRow key={user.id}>
                          <TableCell>{user.firstName} {user.lastName}</TableCell>
                          <TableCell>{user.email}</TableCell>
                          <TableCell>
                            <span className={`px-2 py-1 rounded-full text-xs ${
                              user.isBlocked ? "bg-red-100 text-red-800" : "bg-green-100 text-green-800"
                            }`}>
                              {user.isBlocked ? "Blocked" : "Active"}
                            </span>
                          </TableCell>
                          <TableCell>
                            <Button
                              variant={user.isBlocked ? "outline" : "destructive"}
                              size="sm"
                              onClick={() => handleToggleBlock(user.id, user.isBlocked === true)}
                              disabled={toggleBlockMutation.isPending && selectedUserId === user.id}
                            >
                              {toggleBlockMutation.isPending && selectedUserId === user.id ? (
                                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                              ) : user.isBlocked ? (
                                <UserCheck className="h-4 w-4 mr-1" />
                              ) : (
                                <UserX className="h-4 w-4 mr-1" />
                              )}
                              {user.isBlocked ? "Unblock" : "Block"}
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          
          {/* Agents Tab */}
          <TabsContent value="agents">
            <Card>
              <CardHeader>
                <CardTitle>Agent Management</CardTitle>
                <CardDescription>
                  View and manage all buyer's agent accounts
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoadingUsers ? (
                  <div className="flex justify-center p-8">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                ) : !agentUsers || agentUsers.length === 0 ? (
                  <div className="text-center p-8 text-gray-500">
                    <p>No agents found.</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {agentUsers.map((user) => (
                        <TableRow key={user.id}>
                          <TableCell>{user.firstName} {user.lastName}</TableCell>
                          <TableCell>{user.email}</TableCell>
                          <TableCell>
                            <span className={`px-2 py-1 rounded-full text-xs ${
                              user.isBlocked ? "bg-red-100 text-red-800" : "bg-green-100 text-green-800"
                            }`}>
                              {user.isBlocked ? "Blocked" : "Active"}
                            </span>
                          </TableCell>
                          <TableCell>
                            <Button
                              variant={user.isBlocked ? "outline" : "destructive"}
                              size="sm"
                              onClick={() => handleToggleBlock(user.id, user.isBlocked === true)}
                              disabled={toggleBlockMutation.isPending && selectedUserId === user.id}
                            >
                              {toggleBlockMutation.isPending && selectedUserId === user.id ? (
                                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                              ) : user.isBlocked ? (
                                <UserCheck className="h-4 w-4 mr-1" />
                              ) : (
                                <UserX className="h-4 w-4 mr-1" />
                              )}
                              {user.isBlocked ? "Unblock" : "Block"}
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          
          {/* Properties Tab */}
          <TabsContent value="properties">
            <Card>
              <CardHeader>
                <CardTitle>Property Management</CardTitle>
                <CardDescription>
                  View and manage all properties on the platform
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoadingProperties ? (
                  <div className="flex justify-center p-8">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                ) : !properties || properties.length === 0 ? (
                  <div className="text-center p-8 text-gray-500">
                    <p>No properties found.</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Address</TableHead>
                        <TableHead>Buyer</TableHead>
                        <TableHead>Seller</TableHead>
                        <TableHead>Agent</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {properties.map((property) => (
                        <TableRow key={property.id}>
                          <TableCell>{property.address}</TableCell>
                          <TableCell>ID: {property.createdBy}</TableCell>
                          <TableCell>
                            {property.sellerEmail || (property.sellerId ? "ID: " + property.sellerId : "None")}
                          </TableCell>
                          <TableCell>
                            {property.agentId ? "ID: " + property.agentId : "None"}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openReassignDialog(property)}
                            >
                              <RefreshCw className="h-4 w-4 mr-1" />
                              Reassign Agent
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          
          {/* Settings Tab */}
          <TabsContent value="settings">
            <Card>
              <CardHeader>
                <CardTitle>Email Settings</CardTitle>
                <CardDescription>
                  Configure email notification settings for testing
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Form {...emailSettingsForm}>
                  <form onSubmit={emailSettingsForm.handleSubmit(onEmailSettingsSubmit)} className="space-y-6">
                    <div className="space-y-4">
                      <FormField
                        control={emailSettingsForm.control}
                        name="enableTestMode"
                        render={({ field }) => (
                          <FormItem className="flex items-center gap-2 space-y-0">
                            <FormControl>
                              <input
                                type="checkbox"
                                checked={field.value}
                                onChange={field.onChange}
                                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                              />
                            </FormControl>
                            <FormLabel className="font-medium cursor-pointer">
                              Enable Email Test Mode
                            </FormLabel>
                          </FormItem>
                        )}
                      />
                      
                      <div className="border-t pt-4">
                        <FormField
                          control={emailSettingsForm.control}
                          name="testEmail"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Test Email Address</FormLabel>
                              <FormDescription>
                                When test mode is enabled, all emails will be sent to this address instead of their actual recipients
                              </FormDescription>
                              <FormControl>
                                <Input 
                                  placeholder="test@example.com" 
                                  {...field} 
                                  disabled={!emailSettingsForm.watch("enableTestMode")}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    </div>
                    
                    <Button 
                      type="submit" 
                      disabled={saveEmailSettingsMutation.isPending || 
                        (emailSettingsForm.watch("enableTestMode") && !emailSettingsForm.watch("testEmail"))}
                    >
                      {saveEmailSettingsMutation.isPending ? (
                        <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                      ) : (
                        <Mail className="h-4 w-4 mr-1" />
                      )}
                      Save Email Settings
                    </Button>
                  </form>
                </Form>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
      
      {/* Reassign Agent Dialog */}
      <Dialog open={reassignDialogOpen} onOpenChange={setReassignDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reassign Property Agent</DialogTitle>
            <DialogDescription>
              Select a new agent to assign to this property.
            </DialogDescription>
          </DialogHeader>
          
          {selectedProperty && (
            <div className="py-4">
              <p className="text-sm font-medium">Property:</p>
              <p className="text-sm text-gray-500">{selectedProperty.address}</p>
              
              <div className="mt-4">
                <p className="text-sm font-medium mb-2">Select new agent:</p>
                {isLoadingAgents ? (
                  <div className="flex justify-center p-4">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  </div>
                ) : !agents || agents.length === 0 ? (
                  <p className="text-sm text-gray-500">No agents available</p>
                ) : (
                  <Select onValueChange={(value) => setSelectedAgentId(parseInt(value))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select an agent" />
                    </SelectTrigger>
                    <SelectContent>
                      {agents.map((agent) => (
                        <SelectItem key={agent.id} value={agent.id.toString()}>
                          {agent.firstName} {agent.lastName} ({agent.email})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>
          )}
          
          <DialogFooter>
            <Button
              onClick={handleReassignAgent}
              disabled={!selectedAgentId || reassignAgentMutation.isPending}
            >
              {reassignAgentMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : null}
              Reassign Agent
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
