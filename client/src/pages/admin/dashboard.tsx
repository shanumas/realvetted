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

// Define schema for settings forms
const emailSettingsSchema = z.object({
  testEmail: z.string().email("Please enter a valid email address").or(z.literal("")),
  enableTestMode: z.boolean(),
});

const securitySettingsSchema = z.object({
  emergencyPasswordEnabled: z.boolean(),
});

type EmailSettingsValues = z.infer<typeof emailSettingsSchema>;
type SecuritySettingsValues = z.infer<typeof securitySettingsSchema>;

export default function AdminDashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("users");
  const [reassignDialogOpen, setReassignDialogOpen] = useState(false);
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState<number | null>(null);
  
  // Fetch users
  const { data: users = [], isLoading: isLoadingUsers, refetch: refetchUsers } = useQuery<User[]>({
    queryKey: ["/api/users"],
    queryFn: getQueryFn<User[]>({ baseUrl: "" })
  });
  
  // Fetch properties
  const { data: properties = [], isLoading: isLoadingProperties, refetch: refetchProperties } = useQuery<Property[]>({
    queryKey: ["/api/properties"],
    queryFn: getQueryFn<Property[]>({ baseUrl: "" })
  });
  
  // Fetch agents for reassignment
  const { data: agents = [], isLoading: isLoadingAgents } = useQuery<User[]>({
    queryKey: ["/api/users", "agent"],
    queryFn: getQueryFn<User[]>({ baseUrl: "" })
  });
  
  // Fetch system settings
  const { data: settings = [] } = useQuery<{ key: string; value: string; description: string | null; }[]>({
    queryKey: ["/api/admin/settings"],
    queryFn: getQueryFn<{ key: string; value: string; description: string | null; }>({ baseUrl: "" })
  });
  
  // Setup forms
  const emailSettingsForm = useForm<EmailSettingsValues>({
    resolver: zodResolver(emailSettingsSchema),
    defaultValues: {
      enableTestMode: false,
      testEmail: "",
    }
  });
  
  const securitySettingsForm = useForm<SecuritySettingsValues>({
    resolver: zodResolver(securitySettingsSchema),
    defaultValues: {
      emergencyPasswordEnabled: false,
    }
  });
  
  // Update form values when settings are loaded
  useEffect(() => {
    if (settings && settings.length > 0) {
      const emailTestMode = settings.find((s: { key: string; value: string }) => s.key === "email_test_mode");
      const emailTestAddress = settings.find((s: { key: string; value: string }) => s.key === "email_test_address");
      const emergencyPassword = settings.find((s: { key: string; value: string }) => s.key === "emergency_password_enabled");
      
      if (emailTestMode) {
        emailSettingsForm.setValue("enableTestMode", emailTestMode.value === "true");
      }
      
      if (emailTestAddress) {
        emailSettingsForm.setValue("testEmail", emailTestAddress.value);
      }
      
      if (emergencyPassword) {
        securitySettingsForm.setValue("emergencyPasswordEnabled", emergencyPassword.value === "true");
      }
    }
  }, [settings, emailSettingsForm, securitySettingsForm]);
  
  // Mutations
  const blockUserMutation = useMutation({
    mutationFn: async (userId: number) => {
      const res = await apiRequest("POST", `/api/admin/users/${userId}/block`);
      return await res.json();
    },
    onSuccess: () => {
      refetchUsers();
      toast({
        title: "User blocked",
        description: "The user has been blocked successfully.",
      });
    }
  });
  
  const unblockUserMutation = useMutation({
    mutationFn: async (userId: number) => {
      const res = await apiRequest("POST", `/api/admin/users/${userId}/unblock`);
      return await res.json();
    },
    onSuccess: () => {
      refetchUsers();
      toast({
        title: "User unblocked",
        description: "The user has been unblocked successfully.",
      });
    }
  });
  
  const reassignAgentMutation = useMutation({
    mutationFn: async () => {
      if (!selectedProperty || !selectedAgentId) return null;
      const res = await apiRequest("POST", `/api/admin/properties/${selectedProperty.id}/reassign`, {
        agentId: selectedAgentId
      });
      return await res.json();
    },
    onSuccess: () => {
      refetchProperties();
      setReassignDialogOpen(false);
      setSelectedProperty(null);
      setSelectedAgentId(null);
      toast({
        title: "Agent reassigned",
        description: "The property has been reassigned to the selected agent.",
      });
    }
  });
  
  const saveEmailSettingsMutation = useMutation({
    mutationFn: async (data: EmailSettingsValues) => {
      const res = await apiRequest("POST", "/api/admin/settings/email", data);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({queryKey: ["/api/admin/settings"]});
      toast({
        title: "Email settings saved",
        description: "Your email settings have been saved successfully.",
      });
    }
  });
  
  const saveSecuritySettingsMutation = useMutation({
    mutationFn: async (data: SecuritySettingsValues) => {
      const res = await apiRequest("POST", "/api/admin/settings/security", data);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({queryKey: ["/api/admin/settings"]});
      toast({
        title: "Security settings saved",
        description: "Your security settings have been saved successfully.",
      });
    }
  });
  
  // Form submit handlers
  const onEmailSettingsSubmit = (data: EmailSettingsValues) => {
    saveEmailSettingsMutation.mutate(data);
  };
  
  const onSecuritySettingsSubmit = (data: SecuritySettingsValues) => {
    saveSecuritySettingsMutation.mutate(data);
  };
  
  // Dialog handlers
  const openReassignDialog = (property: Property) => {
    setSelectedProperty(property);
    setReassignDialogOpen(true);
  };
  
  const handleReassignAgent = () => {
    reassignAgentMutation.mutate();
  };
  
  if (!user || user.role !== "admin") {
    return (
      <div className="flex flex-col min-h-screen">
        <SiteHeader />
        <main className="flex-1 p-6">
          <Card>
            <CardContent className="p-6">
              <div className="text-center">
                <h2 className="text-xl font-bold">Access Denied</h2>
                <p className="text-gray-500 mt-2">You don't have permission to access this page.</p>
              </div>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }
  
  return (
    <div className="flex flex-col min-h-screen">
      <SiteHeader />
      <main className="flex-1 p-6">
        <h1 className="text-3xl font-bold mb-6">Admin Dashboard</h1>
        
        <Tabs defaultValue={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-6">
            <TabsTrigger value="users" className="flex items-center gap-1">
              <Users className="h-4 w-4" /> Users
            </TabsTrigger>
            <TabsTrigger value="properties" className="flex items-center gap-1">
              <Home className="h-4 w-4" /> Properties
            </TabsTrigger>
            <TabsTrigger value="settings" className="flex items-center gap-1">
              <Settings className="h-4 w-4" /> Settings
            </TabsTrigger>
          </TabsList>
          
          {/* Users Tab */}
          <TabsContent value="users">
            <Card>
              <CardHeader>
                <CardTitle>Manage Users</CardTitle>
                <CardDescription>
                  View and manage all users in the system.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoadingUsers ? (
                  <div className="flex justify-center p-4">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                ) : !users || users.length === 0 ? (
                  <div className="text-center p-4">
                    <p className="text-gray-500">No users found</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>ID</TableHead>
                          <TableHead>Name</TableHead>
                          <TableHead>Email</TableHead>
                          <TableHead>Role</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {users.map((user) => (
                          <TableRow key={user.id}>
                            <TableCell>{user.id}</TableCell>
                            <TableCell>
                              {user.firstName} {user.lastName}
                            </TableCell>
                            <TableCell>{user.email}</TableCell>
                            <TableCell className="capitalize">{user.role}</TableCell>
                            <TableCell>
                              {user.isBlocked ? (
                                <span className="px-2 py-1 bg-red-100 text-red-800 rounded-full text-xs font-medium">
                                  Blocked
                                </span>
                              ) : (
                                <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs font-medium">
                                  Active
                                </span>
                              )}
                            </TableCell>
                            <TableCell>
                              {user.isBlocked ? (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => unblockUserMutation.mutate(user.id)}
                                  disabled={unblockUserMutation.isPending}
                                >
                                  <UserCheck className="h-4 w-4 mr-1" />
                                  Unblock
                                </Button>
                              ) : (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => blockUserMutation.mutate(user.id)}
                                  disabled={blockUserMutation.isPending}
                                >
                                  <UserX className="h-4 w-4 mr-1" />
                                  Block
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          
          {/* Properties Tab */}
          <TabsContent value="properties">
            <Card>
              <CardHeader>
                <CardTitle>Manage Properties</CardTitle>
                <CardDescription>
                  View and manage property listings.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoadingProperties ? (
                  <div className="flex justify-center p-4">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                ) : !properties || properties.length === 0 ? (
                  <div className="text-center p-4">
                    <p className="text-gray-500">No properties found</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>ID</TableHead>
                          <TableHead>Address</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Price</TableHead>
                          <TableHead>Agent</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {properties.map((property) => (
                          <TableRow key={property.id}>
                            <TableCell>{property.id}</TableCell>
                            <TableCell>{property.address}</TableCell>
                            <TableCell className="capitalize">{property.status}</TableCell>
                            <TableCell>${property.price?.toLocaleString()}</TableCell>
                            <TableCell>
                              {property.agentId ? `Agent #${property.agentId}` : "Unassigned"}
                            </TableCell>
                            <TableCell>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => openReassignDialog(property)}
                              >
                                <UserCog className="h-4 w-4 mr-1" />
                                Reassign
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          
          {/* Settings Tab */}
          <TabsContent value="settings">
              {/* Email Settings Card */}
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
              
              {/* Security Settings Card */}
              <Card className="mt-6">
                <CardHeader>
                  <CardTitle>Security Settings</CardTitle>
                  <CardDescription>
                    Configure system-wide security options
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Form {...securitySettingsForm}>
                    <form onSubmit={securitySettingsForm.handleSubmit(onSecuritySettingsSubmit)} className="space-y-6">
                      <div className="space-y-4">
                        <FormField
                          control={securitySettingsForm.control}
                          name="emergencyPasswordEnabled"
                          render={({ field }) => (
                            <FormItem className="flex flex-col">
                              <div className="flex items-center gap-2 space-y-0">
                                <FormControl>
                                  <input
                                    type="checkbox"
                                    checked={field.value}
                                    onChange={field.onChange}
                                    className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                                  />
                                </FormControl>
                                <FormLabel className="font-medium cursor-pointer">
                                  Enable Emergency Password
                                </FormLabel>
                              </div>
                              <FormDescription className="ml-6">
                                When enabled, users can login with an emergency password: <code className="bg-muted p-1 rounded">sellerbaba123*</code>
                              </FormDescription>
                            </FormItem>
                          )}
                        />
                      </div>
                      
                      <Button 
                        type="submit" 
                        disabled={saveSecuritySettingsMutation.isPending}
                      >
                        {saveSecuritySettingsMutation.isPending ? (
                          <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                        ) : (
                          <Shield className="h-4 w-4 mr-1" />
                        )}
                        Save Security Settings
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