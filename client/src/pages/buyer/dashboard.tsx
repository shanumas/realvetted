import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { PropertyCard } from "@/components/property-card";
import { AddPropertyModal } from "@/components/add-property-modal";
import { SiteHeader } from "@/components/layout/site-header";
import { Property } from "@shared/schema";
import { getQueryFn, queryClient, apiRequest } from "@/lib/queryClient";
import { deleteProperty } from "@/lib/ai";
import {
  Loader2,
  PlusIcon,
  Trash2,
  CalendarRange,
  RefreshCw,
  Shield,
  FileText,
  File,
  Upload,
  MailCheck,
  Eye,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useVerificationStatus } from "@/hooks/use-verification-status";
import { ViewingRequestsList } from "@/components/viewing-requests-list";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { createVeriffSession, launchVeriff } from "@/lib/veriff";
import { PrequalificationUpload } from "@/components/prequalification-upload";
import { ManualApprovalForm } from "@/components/manual-approval-form";
import { BuyerRepresentationAgreement } from "@/components/buyer-representation-agreement";
import { BRBCPdfViewer } from "@/components/brbc-pdf-viewer";
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
  const [, setLocation] = useLocation();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [propertyToDelete, setPropertyToDelete] = useState<number | null>(null);
  const [isVerifyingIdentity, setIsVerifyingIdentity] = useState(false);
  const [isVerificationStarted, setIsVerificationStarted] = useState(false);
  const [isPrequalificationModalOpen, setIsPrequalificationModalOpen] =
    useState(false);
  const [isRequestingApproval, setIsRequestingApproval] = useState(false);
  const [isManualApprovalFormOpen, setIsManualApprovalFormOpen] =
    useState(false);
  const [isBRBCModalOpen, setIsBRBCModalOpen] = useState(false);
  const [isBRBCPdfViewerOpen, setIsBRBCPdfViewerOpen] = useState(false);
  const [selectedAgentId, setSelectedAgentId] = useState<number | null>(null);

  // Get stored verification session ID if it exists
  const storedSessionId = localStorage.getItem("veriffSessionId");

  // Use the verification status hook
  const { checking, isVerified, lastChecked } =
    useVerificationStatus(storedSessionId);

  // Check if there's a tab preference stored in localStorage
  const [activeTab, setActiveTab] = useState(() => {
    // Read from localStorage or default to properties
    const savedTab = localStorage.getItem("buyerDashboardActiveTab");
    // Clear the localStorage preference after reading it
    if (savedTab) {
      localStorage.removeItem("buyerDashboardActiveTab");
    }
    return savedTab || "properties";
  });

  // Setup WebSocket for real-time updates
  useEffect(() => {
    // Set up WebSocket listener for property updates and viewing request changes
    const onMessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "notification" || data.type === "property_update") {
          // Refresh property data and viewing requests
          queryClient.invalidateQueries({
            queryKey: ["/api/properties/by-buyer"],
          });
          queryClient.invalidateQueries({
            queryKey: ["/api/viewing-requests/buyer"],
          });
        }
      } catch (e) {
        console.error("Error parsing WebSocket message:", e);
      }
    };

    // Connect event listener
    window.addEventListener("message", onMessage);

    // Clean up
    return () => {
      window.removeEventListener("message", onMessage);
    };
  }, []);

  const {
    data: properties,
    isLoading,
    refetch,
  } = useQuery<Property[]>({
    queryKey: ["/api/properties/by-buyer"],
    queryFn: getQueryFn({ on401: "throw" }),
  });

  // Fetch all agreements signed by the buyer
  const { data: buyerAgreements, isLoading: isLoadingAgreements } = useQuery<
    any[]
  >({
    queryKey: ["/api/buyer/agreements"],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!user, // Only run this query if we have a user
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

  // Start Veriff verification flow
  const startVerification = async () => {
    try {
      setIsVerifyingIdentity(true);

      // Create a Veriff verification session
      const sessionData = await createVeriffSession();

      // Store session ID in localStorage to allow background checking
      localStorage.setItem("veriffSessionId", sessionData.sessionId);

      // Launch Veriff verification
      launchVeriff(sessionData.url, handleVerificationComplete);

      // Update UI
      setIsVerificationStarted(true);

      toast({
        title: "Verification Started",
        description:
          "Please complete the identity verification process in the new window.",
      });
    } catch (error) {
      console.error("Verification error:", error);
      toast({
        title: "Verification failed",
        description:
          error instanceof Error
            ? error.message
            : "An unexpected error occurred",
        variant: "destructive",
      });
    } finally {
      setIsVerifyingIdentity(false);
    }
  };

  // Handle the completion of Veriff verification
  const handleVerificationComplete = async (
    status: "completed" | "canceled" | "error",
  ) => {
    if (status === "completed") {
      toast({
        title: "Verification Submitted",
        description:
          "Your identity verification has been submitted and is being processed.",
      });

      // Refresh user data
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
    } else if (status === "canceled") {
      toast({
        title: "Verification Canceled",
        description:
          "You canceled the identity verification process. You can try again later.",
        variant: "destructive",
      });

      // Clear the session ID from localStorage as it's no longer valid
      localStorage.removeItem("veriffSessionId");
    } else {
      toast({
        title: "Verification Error",
        description:
          "There was an error during the verification process. Please try again.",
        variant: "destructive",
      });
    }

    setIsVerificationStarted(false);
  };

  // Handle pre-qualification approval request
  const handleRequestApproval = async () => {
    try {
      setIsRequestingApproval(true);

      const response = await apiRequest(
        "/api/buyer/prequalification-approval",
        "POST",
      );

      toast({
        title: "Approval Request Sent",
        description:
          "Your pre-qualification approval request has been sent for manual review.",
      });

      // Refresh user data
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
    } catch (error) {
      console.error("Pre-qualification approval request error:", error);
      toast({
        title: "Request Failed",
        description:
          error instanceof Error
            ? error.message
            : "Failed to send pre-qualification approval request",
        variant: "destructive",
      });
    } finally {
      setIsRequestingApproval(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <SiteHeader />

      <main className="max-w-7xl mx-auto py-8 sm:px-6 lg:px-8">
        {/* Welcome Banner - 50% less height */}
        <div className="px-4 py-3 sm:px-6 bg-white shadow-sm rounded-lg mb-6 border border-gray-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  Welcome, {user?.firstName || "Buyer"}!
                </h3>

                <div className="flex items-center mt-1">
                  <div
                    className={`flex items-center ${user?.profileStatus === "verified" ? "text-green-600" : "text-yellow-600"} text-xs font-medium`}
                  >
                    {checking ? (
                      <RefreshCw className="h-3.5 w-3.5 text-blue-400 animate-spin mr-1" />
                    ) : user?.profileStatus === "verified" ? (
                      <svg
                        className="h-3.5 w-3.5 mr-1"
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                      >
                        <path
                          fillRule="evenodd"
                          d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                          clipRule="evenodd"
                        />
                      </svg>
                    ) : (
                      <svg
                        className="h-3.5 w-3.5 mr-1"
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                      >
                        <path
                          fillRule="evenodd"
                          d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                          clipRule="evenodd"
                        />
                      </svg>
                    )}
                    <span>
                      Status:{" "}
                      <span className="font-semibold">
                        {user?.profileStatus === "verified"
                          ? "Verified"
                          : "Pending"}
                      </span>
                      {user?.profileStatus === "verified" && (
                        <span className="ml-2 text-xs bg-green-50 text-green-700 px-1.5 py-0.5 rounded-full">
                          {(() => {
                            // KYC verification
                            const hasKYC = user?.verificationMethod === "kyc";
                            // Pre-qualification verification
                            const hasPreQual =
                              user?.prequalificationValidated === true;
                            // Verification by pre-qualification only
                            const preQualOnly =
                              user?.verificationMethod === "prequalification";

                            if (hasKYC && hasPreQual) {
                              return "Verified through both KYC and pre-qualification";
                            } else if (hasKYC) {
                              return "Verified through KYC";
                            } else if (preQualOnly || hasPreQual) {
                              return "Verified through pre-qualification";
                            } else {
                              return "Verified"; // Fallback
                            }
                          })()}
                        </span>
                      )}
                    </span>

                    {/* Show pre-qualification validation message/rejection reason if applicable */}

                    {storedSessionId && user?.profileStatus !== "verified" && (
                      <span className="ml-2 text-xs text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-full text-[10px]">
                        {checking ? "Checking..." : "Auto-checking"}
                      </span>
                    )}
                  </div>

                  {isVerificationStarted && (
                    <div className="ml-3 text-blue-600 text-xs flex items-center">
                      <Loader2 className="h-3 w-3 animate-spin mr-1" />
                      <span>Verification in progress...</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <Button onClick={() => setIsModalOpen(true)} size="sm">
              <PlusIcon className="mr-1.5 h-3.5 w-3.5" />
              Add Property
            </Button>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-3">
          {/* First column - Verification methods */}
          <div className="relative rounded-lg">
            <div className="h-full bg-blue-50 rounded-lg border border-blue-100 p-3 flex flex-col">
              <div className="flex items-center justify-between mb-2">
                {user?.profileStatus === "verified" && (
                  <div className="bg-green-100 px-1.5 py-0.5 rounded text-xs font-medium text-green-700 border border-green-200">
                    ✓ Verified
                  </div>
                )}
              </div>

              {/* Identity verification section - smaller */}
              <div className="bg-white rounded-md border border-gray-200 p-2 mb-2">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center">
                    <div className="bg-blue-100 rounded-full w-5 h-5 flex items-center justify-center mr-1.5">
                      <Shield className="h-2.5 w-2.5 text-blue-700" />
                    </div>
                    <h5 className="font-medium text-gray-800 text-xs">
                      Identity Verification (KYC)
                    </h5>
                  </div>

                  {/* Status badge for KYC */}
                  {user?.verificationMethod === "kyc" && (
                    <div className="bg-green-100 px-1.5 py-0.5 rounded text-[10px] font-medium text-green-700 border border-green-200">
                      ✓ Verified
                    </div>
                  )}

                  {/* Veriff logo */}
                  {!user?.verificationMethod && (
                    <div className="h-5 ml-1 flex items-center">
                      <div className="text-[10px] text-blue-700 font-semibold italic flex items-center">
                        by{" "}
                        <span className="font-bold ml-0.5 text-blue-800">
                          VERIFF
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {user?.verificationMethod === "kyc" ? (
                  <div className="bg-green-50 text-green-700 text-[10px] p-1.5 rounded-md border border-green-100 mb-1">
                    ✓ Identity verified successfully through our secure KYC
                    process
                  </div>
                ) : (
                  <>
                    <div className="text-[10px] text-gray-600 mb-2">
                      Complete identity verification using official ID
                      documents.
                    </div>
                    <Button
                      className="w-full py-1 px-2 h-auto text-[10px]"
                      onClick={startVerification}
                      disabled={isVerifyingIdentity || isVerificationStarted}
                    >
                      {isVerifyingIdentity ? (
                        <Loader2 className="mr-1 h-2.5 w-2.5 animate-spin" />
                      ) : (
                        <Shield className="mr-1 h-2.5 w-2.5" />
                      )}
                      {isVerificationStarted
                        ? "Verification In Progress..."
                        : isVerifyingIdentity
                          ? "Starting Verification..."
                          : "Verify Identity Now"}
                    </Button>
                  </>
                )}
              </div>

              {/* Divider between verification options */}
              <div className="flex items-center justify-center mb-2">
                <div className="border-t border-gray-200 flex-grow"></div>
                <div className="mx-2 text-xs text-gray-500 font-medium">
                  Choose one verification method
                </div>
                <div className="border-t border-gray-200 flex-grow"></div>
              </div>

              {/* Pre-qualification upload section - smaller */}
              <div className="bg-white rounded-md border border-gray-200 p-2">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center">
                    <div className="bg-purple-100 rounded-full w-5 h-5 flex items-center justify-center mr-1.5">
                      <Upload className="h-2.5 w-2.5 text-purple-700" />
                    </div>
                    <h5 className="font-medium text-gray-800 text-xs">
                      Pre-qualification Letter
                    </h5>
                  </div>

                  {/* Status badge */}
                  {user?.prequalificationDocUrl && (
                    <div
                      className={`px-1.5 py-0.5 rounded text-[10px] font-medium border ${
                        user?.prequalificationValidated
                          ? "bg-green-100 text-green-700 border-green-200"
                          : "bg-amber-100 text-amber-700 border-amber-200"
                      }`}
                    >
                      {user?.prequalificationValidated
                        ? "✓ Verified"
                        : "Pending"}
                    </div>
                  )}
                </div>

                {user?.prequalificationDocUrl ? (
                  <>
                    <div className="mb-2 flex-grow">
                      <div
                        className={`text-[10px] font-medium ${user?.prequalificationValidated ? "text-green-600" : "text-amber-600"}`}
                      >
                        {user?.prequalificationValidated
                          ? "✓ Pre-qualification document validated successfully"
                          : "⚠️ Document validation in progress"}
                      </div>
                      {user?.prequalificationMessage &&
                        !user?.prequalificationValidated && (
                          <p className="text-[10px] text-red-500 mt-0.5">
                            {user.prequalificationMessage}
                          </p>
                        )}
                    </div>
                    <Button
                      className="w-full py-1 px-2 h-auto text-[10px]"
                      onClick={() => setIsPrequalificationModalOpen(true)}
                      disabled={isVerificationStarted}
                      variant="outline"
                    >
                      <Upload className="mr-1 h-2.5 w-2.5" />
                      Upload New Document
                    </Button>
                  </>
                ) : (
                  <>
                    <div className="text-[10px] text-gray-600 mb-2">
                      Upload your pre-qualification letter to verify your buying
                      power.
                    </div>
                    <Button
                      className="w-full py-1 px-2 h-auto text-[10px]"
                      onClick={() => setIsPrequalificationModalOpen(true)}
                      disabled={isVerificationStarted}
                      variant="outline"
                    >
                      <Upload className="mr-1 h-2.5 w-2.5" />
                      Upload Document
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Second column - BRBC Agreement Card */}
          <div className="relative rounded-lg flex flex-col space-y-4">
            <div
              className={`h-1/2 border-2 border-gray-300 ${buyerAgreements?.some((a) => a.type === "global_brbc") ? "bg-green-50" : "bg-amber-50"} rounded-lg p-3 flex flex-col`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center">
                  <div
                    className={`${buyerAgreements?.some((a) => a.type === "global_brbc") ? "bg-green-100" : "bg-amber-100"} rounded-full w-6 h-6 flex items-center justify-center mr-2`}
                  >
                    <FileText
                      className={`h-3 w-3 ${buyerAgreements?.some((a) => a.type === "global_brbc") ? "text-green-700" : "text-amber-700"}`}
                    />
                  </div>
                  <h5
                    className={`font-medium ${buyerAgreements?.some((a) => a.type === "global_brbc") ? "text-green-800" : "text-amber-800"} text-sm`}
                  >
                    Buyer Representation Agreement
                  </h5>
                </div>

                {buyerAgreements?.some((a) => a.type === "global_brbc") ? (
                  <div className="bg-green-100 px-1.5 py-0.5 rounded text-xs font-medium text-green-700 border border-green-200">
                    ✓ Signed
                  </div>
                ) : (
                  <div className="bg-amber-100 px-1.5 py-0.5 rounded text-xs font-medium text-amber-700 border border-amber-200">
                    Required
                  </div>
                )}
              </div>

              {buyerAgreements?.some((a) => a.type === "global_brbc") ? (
                <div className="bg-green-50 text-green-700 text-xs p-2 rounded-md border border-green-100 mb-2">
                  <div className="flex items-center">
                    <svg
                      className="h-4 w-4 mr-1 text-green-600"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                    <span>Agreement successfully signed</span>
                  </div>

                  <div className="flex items-center mt-1.5 pt-1.5 border-t border-green-200">
                    <svg
                      className="h-3.5 w-3.5 mr-1 text-green-600"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10"
                      />
                    </svg>
                    <span
                      className="text-[10px] underline cursor-pointer"
                      onClick={() => {
                        // Find the global BRBC agreement
                        const brbcAgreement = buyerAgreements?.find(
                          (a) => a.type === "global_brbc",
                        );
                        if (brbcAgreement && brbcAgreement.documentUrl) {
                          // Format the URL properly if needed
                          let documentUrl =
                            brbcAgreement.documentUrl.startsWith("/uploads") ||
                            brbcAgreement.documentUrl.startsWith("http")
                              ? brbcAgreement.documentUrl
                              : `/uploads/${brbcAgreement.documentUrl}`;

                          // Add a timestamp and download parameter to force non-editable mode and prevent caching
                          if (documentUrl.includes("?")) {
                            documentUrl += "&download=true&t=" + Date.now();
                          } else {
                            documentUrl += "?download=true&t=" + Date.now();
                          }

                          console.log("Opening document URL:", documentUrl);
                          window.open(documentUrl, "_blank");
                        } else {
                          toast({
                            title: "Document Not Available",
                            description:
                              "The signed document is not available for download at this time.",
                            variant: "destructive",
                          });
                        }
                      }}
                    >
                      Download signed document
                    </span>
                  </div>
                </div>
              ) : (
                <div className="bg-amber-50 text-amber-700 text-xs p-2 rounded-md border border-amber-100 mb-2">
                  ⚠️ This agreement must be signed before you can request
                  property viewings
                </div>
              )}

              <Button
                className="w-full py-1.5 px-2 h-auto text-xs"
                onClick={() => {
                  // If already signed, open a non-editable view, otherwise open signing modal
                  if (buyerAgreements?.some((a) => a.type === "global_brbc")) {
                    // Find the signed agreement
                    const brbcAgreement = buyerAgreements.find(
                      (a) => a.type === "global_brbc",
                    );
                    if (brbcAgreement && brbcAgreement.documentUrl) {
                      // Format the URL properly if needed
                      let documentUrl =
                        brbcAgreement.documentUrl.startsWith("/uploads") ||
                        brbcAgreement.documentUrl.startsWith("http")
                          ? brbcAgreement.documentUrl
                          : `/uploads/${brbcAgreement.documentUrl}`;

                      // Add a timestamp and download parameter to force non-editable mode and prevent caching
                      if (documentUrl.includes("?")) {
                        documentUrl += "&download=true&t=" + Date.now();
                      } else {
                        documentUrl += "?download=true&t=" + Date.now();
                      }

                      console.log("Opening document URL:", documentUrl);
                      window.open(documentUrl, "_blank");
                    } else {
                      // Fallback to viewer if no document URL is found
                      setIsBRBCPdfViewerOpen(true);
                    }
                  } else {
                    // Open signing modal for new agreements
                    setIsBRBCPdfViewerOpen(true);
                  }
                }}
                variant={
                  buyerAgreements?.some((a) => a.type === "global_brbc")
                    ? "outline"
                    : "default"
                }
              >
                <FileText className="mr-1.5 h-3 w-3" />
                {buyerAgreements?.some((a) => a.type === "global_brbc")
                  ? "View Signed Agreement"
                  : "Sign Agreement"}
              </Button>
            </div>

            {/* Third column - Manual Approval Card */}

            <div className="h-1/4 border-2 border-gray-300 bg-green-50 rounded-lg p-3 flex flex-col">
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center">
                  <div className="bg-green-100 rounded-full w-6 h-6 flex items-center justify-center mr-2">
                    <MailCheck className="h-3 w-3 text-green-700" />
                  </div>
                  <h5 className="font-medium text-green-800 text-sm">
                    Get Pre-Qualification from Lender
                  </h5>
                </div>

                {user?.manualApprovalRequested && (
                  <div className="bg-green-100 px-1.5 py-0.5 rounded text-xs font-medium text-green-700 border border-green-200">
                    ✓ Sent
                  </div>
                )}
              </div>

              {user?.manualApprovalRequested ? (
                <div className="flex-grow">
                  <div className="text-xs text-gray-600 mb-2 flex-grow">
                    <p>
                      Your request has been submitted and is being reviewed. You
                      may submit a new request if needed.
                    </p>
                  </div>
                  <Button
                    className="w-full py-1.5 px-2 h-auto text-xs"
                    onClick={() => setIsManualApprovalFormOpen(true)}
                    variant="outline"
                  >
                    <MailCheck className="mr-1.5 h-3 w-3" />
                    Submit New Request
                  </Button>
                </div>
              ) : (
                <>
                  <p className="text-xs text-gray-600 mb-2 flex-grow line-clamp-2">
                    Submit form and supporting documents to get
                    pre-qualification
                  </p>
                  <Button
                    className="w-full py-1.5 px-2 h-auto text-xs"
                    onClick={() => setIsManualApprovalFormOpen(true)}
                    variant="default"
                  >
                    <MailCheck className="mr-1.5 h-3 w-3" />
                    Request Pre-Qual from Lender
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Main Content Tabs */}
        <div className="bg-white shadow-sm rounded-lg border border-gray-100 mt-6">
          <Tabs
            value={activeTab}
            onValueChange={setActiveTab}
            className="w-full"
          >
            <div className="px-6 pt-4 border-b border-gray-200">
              <TabsList className="grid w-full max-w-2xl grid-cols-3 gap-4">
                <TabsTrigger
                  value="properties"
                  className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:border-b-0"
                >
                  <PlusIcon className="h-4 w-4 mr-2" />
                  Properties
                </TabsTrigger>
                <TabsTrigger
                  value="viewingRequests"
                  className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:border-b-0"
                >
                  <CalendarRange className="h-4 w-4 mr-2" />
                  Viewing Requests
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="properties" className="p-0">
              <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
                <h3 className="text-lg leading-6 font-medium text-gray-900">
                  My Properties
                </h3>
                <p className="mt-1 text-sm text-gray-500">
                  Properties you've added to track
                </p>
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
                        <div className="flex flex-col space-y-2">
                          <div className="flex space-x-2">
                            <Link href={`/buyer/property/${property.id}`}>
                              <Button variant="outline" size="sm">
                                View Details
                              </Button>
                            </Link>
                            <Button
                              variant="outline"
                              size="sm"
                              className={`bg-red-50 text-red-600 hover:bg-red-100 ${property.agentId ? "opacity-50 cursor-not-allowed" : ""}`}
                              onClick={() =>
                                property.agentId
                                  ? null
                                  : setPropertyToDelete(property.id)
                              }
                              title={
                                property.agentId
                                  ? "Cannot delete after agent has accepted"
                                  : "Delete property"
                              }
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>

                          <div className="flex space-x-2 items-center">
                            {buyerAgreements?.some(
                              (a) => a.type === "global_brbc",
                            ) ? (
                              <Button
                                variant="outline"
                                size="sm"
                                className="bg-green-50 text-green-600 hover:bg-green-100 w-full"
                                onClick={() => {
                                  setLocation(`/buyer/property/${property.id}#viewing-requests-section`);
                                }}
                              >
                                <Eye className="mr-2 h-4 w-4" />
                                Request Tour
                              </Button>
                            ) : (
                              <div className="flex flex-col space-y-1 w-full">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="bg-gray-100 text-gray-400 w-full cursor-not-allowed"
                                  disabled={true}
                                  title="You need to sign the Buyer Representation Agreement first"
                                >
                                  <Eye className="mr-2 h-4 w-4" />
                                  Request Tour
                                </Button>
                                <Button
                                  variant="link"
                                  size="sm"
                                  className="text-amber-700 p-0 h-6 font-medium text-xs underline"
                                  onClick={() => setIsBRBCPdfViewerOpen(true)}
                                >
                                  Sign Representation Agreement
                                </Button>
                              </div>
                            )}
                          </div>
                        </div>
                      }
                    />
                  ))}
                </div>
              ) : (
                <div className="px-4 sm:px-6 py-10">
                  <p className="text-center text-gray-500">
                    You haven't added any properties yet. Add your first
                    property to get started.
                  </p>
                </div>
              )}
            </TabsContent>

            <TabsContent value="viewingRequests" className="p-0">
              {/* Fetch and display viewing requests */}
              {user && <ViewingRequestsList userId={user.id} role="buyer" />}
            </TabsContent>
          </Tabs>
        </div>
      </main>

      <AddPropertyModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={handleAddPropertySuccess}
      />

      {/* Confirmation Dialog for Property Deletion */}
      <AlertDialog open={propertyToDelete !== null}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Property</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this property? This action cannot
              be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPropertyToDelete(null)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => {
                if (propertyToDelete) {
                  deleteMutation.mutate(propertyToDelete);
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Pre-qualification Upload Modal */}
      <PrequalificationUpload
        isOpen={isPrequalificationModalOpen}
        onClose={() => setIsPrequalificationModalOpen(false)}
        onVerified={() => {
          // Refresh user data to update verification status
          queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
        }}
      />

      {/* Manual Approval Form */}
      <ManualApprovalForm
        isOpen={isManualApprovalFormOpen}
        onClose={() => setIsManualApprovalFormOpen(false)}
        onSubmitted={() => {
          // Refresh user data
          queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
        }}
      />

      {/* BRBC Agreement Form */}
      <BuyerRepresentationAgreement
        isOpen={isBRBCModalOpen}
        onClose={() => setIsBRBCModalOpen(false)}
        agentId={selectedAgentId || 0}
        isGlobal={true}
      />

      {/* BRBC PDF Viewer */}
      <BRBCPdfViewer
        isOpen={isBRBCPdfViewerOpen}
        onClose={() => setIsBRBCPdfViewerOpen(false)}
        onSigned={() => {
          // Refresh agreements after signing
          queryClient.invalidateQueries({
            queryKey: ["/api/buyer/agreements"],
          });
          toast({
            title: "Agreement Signed",
            description: "Your buyer representation agreement has been signed.",
          });
        }}
      />
    </div>
  );
}
