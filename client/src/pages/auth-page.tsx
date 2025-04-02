import { useState, useEffect, useRef } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import { Loader2, Upload, ImageIcon, Image } from "lucide-react";

const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Email is required")
    .email("Please enter a valid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  rememberMe: z.boolean().optional(),
});

const registerSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Email is required")
    .email("Please enter a valid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  profilePhotoUrl: z.string().optional(),
});

type LoginFormValues = z.infer<typeof loginSchema>;
type RegisterFormValues = z.infer<typeof registerSchema>;

export default function AuthPage() {
  const [roleTab, setRoleTab] = useState<string>("buyer");
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const { user, isLoading, loginMutation, registerMutation } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [previewImage, setPreviewImage] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Redirect if user is already logged in
  useEffect(() => {
    if (user) {
      if (user.role === "buyer") {
        navigate(
          user.profileStatus === "verified" ? "/buyer/dashboard" : "/buyer/kyc",
        );
      } else if (user.role === "agent") {
        navigate(
          user.profileStatus === "verified" ? "/agent/dashboard" : "/agent/kyc",
        );
      } else if (user.role === "seller") {
        navigate("/seller/dashboard");
      } else if (user.role === "admin") {
        navigate("/admin/dashboard");
      }
    }
  }, [user, navigate]);

  const loginForm = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
      rememberMe: false,
    },
  });

  const registerForm = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      email: "",
      password: "",
      firstName: "",
      lastName: "",
    },
  });

  // Listen to the form state changes
  useEffect(() => {
    if (
      loginForm.formState.errors &&
      Object.keys(loginForm.formState.errors).length > 0
    ) {
      console.log("Login form errors:", loginForm.formState.errors);
    }
  }, [loginForm.formState.errors]);

  useEffect(() => {
    if (
      registerForm.formState.errors &&
      Object.keys(registerForm.formState.errors).length > 0
    ) {
      console.log("Register form errors:", registerForm.formState.errors);
    }
  }, [registerForm.formState.errors]);

  const onLoginSubmit = (values: LoginFormValues) => {
    console.log("Login form values:", values);
    loginMutation.mutate({
      email: values.email,
      password: values.password,
      role: roleTab as any,
    });
  };

  // Handle profile photo upload
  const handleProfilePhotoUpload = async (file: File): Promise<string> => {
    try {
      setUploadingPhoto(true);
      
      const formData = new FormData();
      formData.append('profilePhoto', file);
      
      const response = await fetch('/api/uploads/profile-photo', {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        throw new Error('Failed to upload profile photo');
      }
      
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to upload profile photo');
      }
      
      return data.profilePhotoUrl;
    } catch (error) {
      console.error('Profile photo upload error:', error);
      toast({
        title: 'Upload Failed',
        description: error instanceof Error ? error.message : 'Failed to upload profile photo',
        variant: 'destructive'
      });
      throw error;
    } finally {
      setUploadingPhoto(false);
    }
  };

  // Handle file selection
  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    try {
      // Preview the image
      const reader = new FileReader();
      reader.onload = (e) => {
        setPreviewImage(e.target?.result as string);
      };
      reader.readAsDataURL(file);
      
      // Upload the image
      const photoUrl = await handleProfilePhotoUpload(file);
      registerForm.setValue('profilePhotoUrl', photoUrl);
    } catch (error) {
      console.error('Error handling file:', error);
    }
  };

  const onRegisterSubmit = (values: RegisterFormValues) => {
    console.log("Register form values:", values);
    
    // Validate that agents have a profile photo
    if (roleTab === "agent" && !values.profilePhotoUrl) {
      toast({
        title: "Profile Photo Required",
        description: "Agents must upload a profile photo to register",
        variant: "destructive"
      });
      return;
    }
    
    registerMutation.mutate({
      email: values.email,
      password: values.password,
      firstName: values.firstName,
      lastName: values.lastName,
      profilePhotoUrl: values.profilePhotoUrl,
      role: roleTab as any,
    });
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            PropertyMatch
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            AI-Powered Real Estate Connections
          </p>
        </div>

        <Tabs
          defaultValue="buyer"
          value={roleTab}
          onValueChange={setRoleTab}
          className="w-full"
        >
          <TabsList className="grid grid-cols-4 mb-8">
            <TabsTrigger value="buyer">Buyer</TabsTrigger>
            <TabsTrigger value="agent">Agent</TabsTrigger>
            <TabsTrigger value="seller">Seller</TabsTrigger>
            <TabsTrigger value="admin">Admin</TabsTrigger>
          </TabsList>

          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle>
                    {authMode === "login" ? "Sign In" : "Create Account"}
                  </CardTitle>
                  <CardDescription>
                    {roleTab === "buyer"
                      ? "Find your dream property with AI-powered matching"
                      : roleTab === "agent"
                        ? "Get matched with qualified buyers"
                        : roleTab === "seller"
                          ? "Connect with interested buyers"
                          : "Manage platform users and properties"}
                  </CardDescription>
                </div>
                <div>
                  <Button
                    variant="link"
                    onClick={() =>
                      setAuthMode(authMode === "login" ? "register" : "login")
                    }
                  >
                    {authMode === "login" ? "Register" : "Sign In"}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {authMode === "login" ? (
                <Form {...loginForm}>
                  <form
                    onSubmit={loginForm.handleSubmit(onLoginSubmit)}
                    className="space-y-4"
                  >
                    <FormField
                      control={loginForm.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="name@example.com"
                              type="email"
                              autoComplete="email"
                              {...field}
                              onChange={(e) => {
                                field.onChange(e.target.value.trim());
                              }}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={loginForm.control}
                      name="password"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Password</FormLabel>
                          <FormControl>
                            <Input
                              type="password"
                              placeholder="••••••"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <div className="flex items-center justify-between">
                      <FormField
                        control={loginForm.control}
                        name="rememberMe"
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-center space-x-2 space-y-0">
                            <FormControl>
                              <Checkbox
                                checked={field.value}
                                onCheckedChange={field.onChange}
                              />
                            </FormControl>
                            <FormLabel className="text-sm font-medium leading-none cursor-pointer">
                              Remember me
                            </FormLabel>
                          </FormItem>
                        )}
                      />
                      <Button
                        type="button"
                        variant="link"
                        size="sm"
                        className="px-0"
                      >
                        Forgot password?
                      </Button>
                    </div>
                    <Button
                      type="submit"
                      className="w-full"
                      disabled={loginMutation.isPending}
                    >
                      {loginMutation.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : null}
                      Sign In
                    </Button>

                    {roleTab === "seller" && (
                      <p className="text-center text-sm text-gray-500 mt-4">
                        Sellers are invited by email when a buyer adds a
                        property.
                      </p>
                    )}
                  </form>
                </Form>
              ) : (
                <Form {...registerForm}>
                  <form
                    onSubmit={registerForm.handleSubmit(onRegisterSubmit)}
                    className="space-y-4"
                  >
                    <FormField
                      control={registerForm.control}
                      name="firstName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>First Name</FormLabel>
                          <FormControl>
                            <Input placeholder="John" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={registerForm.control}
                      name="lastName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Last Name</FormLabel>
                          <FormControl>
                            <Input placeholder="Doe" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={registerForm.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="name@example.com"
                              type="email"
                              autoComplete="email"
                              {...field}
                              onChange={(e) => {
                                field.onChange(e.target.value.trim());
                              }}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={registerForm.control}
                      name="password"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Password</FormLabel>
                          <FormControl>
                            <Input
                              type="password"
                              placeholder="••••••"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    {roleTab === "agent" && (
                      <FormField
                        control={registerForm.control}
                        name="profilePhotoUrl"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>
                              Profile Photo <span className="text-red-500">*</span>
                            </FormLabel>
                            <FormDescription>
                              Agents must upload a professional profile photo
                            </FormDescription>
                            <div className="flex flex-col items-center space-y-4">
                              {previewImage ? (
                                <div className="relative w-32 h-32 rounded-full overflow-hidden border-2 border-primary">
                                  <img
                                    src={previewImage}
                                    alt="Profile preview"
                                    className="w-full h-full object-cover"
                                  />
                                  <Button
                                    type="button"
                                    variant="destructive"
                                    size="sm"
                                    className="absolute bottom-0 right-0"
                                    onClick={() => {
                                      setPreviewImage("");
                                      field.onChange("");
                                    }}
                                  >
                                    ✕
                                  </Button>
                                </div>
                              ) : (
                                <div className="w-32 h-32 rounded-full bg-gray-100 flex items-center justify-center border-2 border-dashed border-gray-300">
                                  <ImageIcon className="h-12 w-12 text-gray-400" />
                                </div>
                              )}
                              
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                ref={fileInputRef}
                                onChange={handleFileChange}
                              />
                              
                              <Button
                                type="button"
                                variant="outline"
                                onClick={() => fileInputRef.current?.click()}
                                disabled={uploadingPhoto}
                                className="flex items-center"
                              >
                                {uploadingPhoto ? (
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                ) : (
                                  <Upload className="mr-2 h-4 w-4" />
                                )}
                                {field.value ? "Change Photo" : "Upload Photo"}
                              </Button>
                            </div>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}
                    
                    <Button
                      type="submit"
                      className="w-full"
                      disabled={registerMutation.isPending}
                    >
                      {registerMutation.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : null}
                      Create Account
                    </Button>

                    {roleTab === "seller" && (
                      <p className="text-center text-sm text-gray-500 mt-4">
                        Sellers are invited by email when a buyer adds a
                        property.
                      </p>
                    )}
                  </form>
                </Form>
              )}
            </CardContent>
          </Card>
        </Tabs>
      </div>
    </div>
  );
}
