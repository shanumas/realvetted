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
import { Label } from "@/components/ui/label";

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
  phone: z.string().min(1, "Phone number is required"),
  profilePhotoUrl: z.string().optional(),
  licenseNumber: z.string().optional(),
  brokerageName: z.string().optional(),
  geographicalArea: z.string().optional(),
  serviceArea: z.string().optional(),
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
  const [lookingUpLicense, setLookingUpLicense] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Redirect if user is already logged in
  useEffect(() => {
    if (user) {
      if (user.role === "buyer") {
        navigate(
          user.profileStatus === "verified" ? "/buyer/dashboard" : "/buyer/kyc",
        );
      } else if (user.role === "agent") {
        // Always redirect agents to dashboard, regardless of profile status
        navigate("/agent/dashboard");
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
      phone: "",
      profilePhotoUrl: "",
      licenseNumber: "",
      brokerageName: "",
      geographicalArea: "",
      serviceArea: "",
    },
    mode: "onChange",
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
      formData.append("profilePhoto", file);

      const response = await fetch("/api/uploads/profile-photo", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Failed to upload profile photo");
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || "Failed to upload profile photo");
      }

      return data.profilePhotoUrl;
    } catch (error) {
      console.error("Profile photo upload error:", error);
      toast({
        title: "Upload Failed",
        description:
          error instanceof Error
            ? error.message
            : "Failed to upload profile photo",
        variant: "destructive",
      });
      throw error;
    } finally {
      setUploadingPhoto(false);
    }
  };

  // Handle license lookup
  const handleLicenseLookup = async (licenseNumber: string) => {
    try {
      setLookingUpLicense(true);

      const response = await fetch(
        `/api/agent/license-lookup?licenseNumber=${encodeURIComponent(licenseNumber)}`,
      );

      if (!response.ok) {
        throw new Error("Failed to look up license");
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || "Failed to find license information");
      }

      // Populate the form with the agent's details from the license lookup
      if (data.data) {
        const { name, address, city, state, zip } = data.data;

        // Parse the full name into first and last name
        if (name) {
          const nameParts = name.split(" ");
          if (nameParts.length >= 2) {
            const firstName = nameParts[0];
            const lastName = nameParts.slice(1).join(" ");
            registerForm.setValue("firstName", firstName);
            registerForm.setValue("lastName", lastName);
          } else {
            registerForm.setValue("firstName", name);
          }
        }

        toast({
          title: "License Information Found",
          description:
            "Your name has been filled based on your license information.",
        });
      }
    } catch (error) {
      console.error("License lookup error:", error);
      toast({
        title: "License Lookup Failed",
        description:
          error instanceof Error
            ? error.message
            : "Failed to look up license information",
        variant: "destructive",
      });
    } finally {
      setLookingUpLicense(false);
    }
  };

  // Handle file selection
  const handleFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
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
      registerForm.setValue("profilePhotoUrl", photoUrl);
    } catch (error) {
      console.error("Error handling file:", error);
    }
  };

  const onRegisterSubmit = (values: RegisterFormValues) => {
    console.log("Register form values:", values);

    registerMutation.mutate({
      email: values.email,
      password: values.password,
      firstName: values.firstName,
      lastName: values.lastName,
      phone: values.phone,
      profilePhotoUrl: values.profilePhotoUrl,
      licenseNumber: values.licenseNumber,
      brokerageName: values.brokerageName,
      geographicalArea: values.geographicalArea,
      serviceArea: values.serviceArea,
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
          <TabsList className="grid grid-cols-2 mb-8">
            <TabsTrigger value="buyer">Buyer</TabsTrigger>
            <TabsTrigger value="agent">Agent</TabsTrigger>
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
                        : "Connect with interested buyers"}
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
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="firstName">First Name</Label>
                        <Input
                          id="firstName"
                          placeholder="John"
                          {...registerForm.register("firstName")}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="lastName">Last Name</Label>
                        <Input
                          id="lastName"
                          placeholder="Doe"
                          {...registerForm.register("lastName")}
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="email">Email</Label>
                      <Input
                        id="email"
                        type="email"
                        placeholder="john@example.com"
                        {...registerForm.register("email")}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="phone">Phone</Label>
                      <Input
                        id="phone"
                        type="tel"
                        placeholder="(555) 555-5555"
                        {...registerForm.register("phone")}
                      />
                    </div>

                    {roleTab === "buyer" && (
                      <div className="space-y-2">
                        <Label htmlFor="geographicalArea">
                          Where are you looking to buy? (City, State or Area)
                        </Label>
                        <Input
                          id="geographicalArea"
                          placeholder="e.g., San Francisco Bay Area, CA"
                          {...registerForm.register("geographicalArea")}
                        />
                        <p className="text-sm text-muted-foreground">
                          This helps us match you with a local buyer's agent
                        </p>
                      </div>
                    )}

                    {roleTab === "agent" && (
                      <div className="space-y-2">
                        <Label htmlFor="serviceArea">
                          What areas do you serve? (Cities, Counties, or Regions)
                        </Label>
                        <Input
                          id="serviceArea"
                          placeholder="e.g., Greater Los Angeles Area"
                          {...registerForm.register("serviceArea")}
                        />
                        <p className="text-sm text-muted-foreground">
                          This helps us match you with buyers in your service area
                        </p>
                      </div>
                    )}

                    <div className="space-y-2">
                      <Label htmlFor="password">Password</Label>
                      <Input
                        id="password"
                        type="password"
                        {...registerForm.register("password")}
                      />
                    </div>

                    {roleTab === "agent" && (
                      <>
                        <div>
                          <label htmlFor="licenseNumber" className="block text-sm font-medium text-gray-700">
                            DRE License Number <span className="text-red-500">*</span>
                          </label>
                          <div className="mt-1">
                            <input
                              id="licenseNumber"
                              name="licenseNumber"
                              type="text"
                              placeholder="01234567"
                              className="px-3 py-2 block w-full rounded-md border border-gray-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm"
                              value={registerForm.watch('licenseNumber')}
                              onChange={(e) => registerForm.setValue('licenseNumber', e.target.value)}
                              required
                            />
                          </div>
                          {registerForm.formState.errors.licenseNumber && (
                            <p className="text-sm text-red-500 mt-1">
                              {registerForm.formState.errors.licenseNumber.message}
                            </p>
                          )}
                        </div>
                        <div>
                          <label htmlFor="brokerageName" className="block text-sm font-medium text-gray-700">
                            Brokerage Name <span className="text-red-500">*</span>
                          </label>
                          <div className="mt-1">
                            <input
                              id="brokerageName"
                              name="brokerageName"
                              type="text"
                              placeholder="Keller Williams, Coldwell Banker, etc."
                              className="px-3 py-2 block w-full rounded-md border border-gray-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm"
                              value={registerForm.watch('brokerageName')}
                              onChange={(e) => registerForm.setValue('brokerageName', e.target.value)}
                              required
                            />
                          </div>
                          {registerForm.formState.errors.brokerageName && (
                            <p className="text-sm text-red-500 mt-1">
                              {registerForm.formState.errors.brokerageName.message}
                            </p>
                          )}
                        </div>
                      </>
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
