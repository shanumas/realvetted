import React, { useState, useRef, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2,
  FileText,
  Check,
  User,
  UserPlus,
  Eye,
  ChevronUp,
  ChevronDown,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import SignatureCanvas from "react-signature-canvas";
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
import { PDFDocument, PDFTextField } from "pdf-lib";

// Utility to save and restore signature canvas data
interface SignatureData {
  primary: string | null;
  initials: string | null;
  buyer2Primary: string | null;
  buyer2Initials: string | null;
}

interface BRBCPdfViewerProps {
  isOpen: boolean;
  onClose: () => void;
  onSigned?: () => void;
}

export function BRBCPdfViewer({
  isOpen,
  onClose,
  onSigned,
}: BRBCPdfViewerProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(true);
  const [pdfUrl, setPdfUrl] = useState("");
  const [cachedPdfUrl, setCachedPdfUrl] = useState<string | null>(null); // Store last valid PDF to avoid losing form data
  const [isSigning, setIsSigning] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [hasSigned, setHasSigned] = useState(false);
  const [activeTab, setActiveTab] = useState("buyer1-signature");
  const [termsAgreed, setTermsAgreed] = useState(false);
  const [showTermsDetails, setShowTermsDetails] = useState(false);
  const [showKeyTermsSummaryPage, setShowKeyTermsSummaryPage] = useState(true);
  const [showVideoPage, setShowVideoPage] = useState(false);
  const [showAgreementTermsPage, setShowAgreementTermsPage] = useState(false);
  const [videoWatched, setVideoWatched] = useState(false);
  const [hasPreviewedOnce, setHasPreviewedOnce] = useState(false);

  // Calculate today's date and end date (90 days from today)
  const today = new Date();
  const endDate = new Date(today);
  endDate.setDate(today.getDate() + 90);

  // Constants for date formatting
  const START_DATE = today.toLocaleDateString("en-US");
  const END_DATE = endDate.toLocaleDateString("en-US");
  // Track if the user already has a signed agreement
  const [existingAgreement, setExistingAgreement] = useState<any | null>(null);
  const [lastPreviewTimestamp, setLastPreviewTimestamp] = useState<
    number | null
  >(null);

  // Signature refs for different signature types
  const signatureRef = useRef<SignatureCanvas>(null);
  const initialsRef = useRef<SignatureCanvas>(null);
  const buyer2SignatureRef = useRef<SignatureCanvas>(null);
  const buyer2InitialsRef = useRef<SignatureCanvas>(null);

  // Signature empty states
  const [signatureIsEmpty, setSignatureIsEmpty] = useState(true);
  const [initialsIsEmpty, setInitialsIsEmpty] = useState(true);
  const [buyer2SignatureIsEmpty, setBuyer2SignatureIsEmpty] = useState(true);
  const [buyer2InitialsIsEmpty, setBuyer2InitialsIsEmpty] = useState(true);

  // State to store signature images when switching tabs
  const [savedSignatures, setSavedSignatures] = useState<SignatureData>({
    primary: null,
    initials: null,
    buyer2Primary: null,
    buyer2Initials: null,
  });

  // Reference to the iframe to access the PDF form fields
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // State to store the raw PDF data for client-side processing
  const [pdfArrayBuffer, setPdfArrayBuffer] = useState<ArrayBuffer | null>(
    null,
  );

  // State to store form field values
  const [formFields, setFormFields] = useState<Record<string, string>>({});

  // PDF document for client-side manipulation
  const [pdfDoc, setPdfDoc] = useState<PDFDocument | null>(null);

  // Function to fetch existing signed BRBC agreements for this buyer
  const fetchExistingAgreement = async () => {
    try {
      setIsLoading(true);

      // Fetch buyer agreements from the server
      const response = await fetch(`/api/buyer/agreements`);
      if (!response.ok) {
        throw new Error(
          `Failed to fetch agreements: ${response.status} ${response.statusText}`,
        );
      }

      const agreements = await response.json();

      // Find the most recent global BRBC agreement
      const brbcAgreement = agreements.find(
        (a: any) => a.type === "global_brbc",
      );

      if (brbcAgreement && brbcAgreement.documentUrl) {
        // Found an existing signed agreement
        setExistingAgreement(brbcAgreement);

        // Ensure the documentUrl path is correct
        let documentUrl = brbcAgreement.documentUrl;
        if (
          !documentUrl.startsWith("/uploads/") &&
          !documentUrl.startsWith("http")
        ) {
          documentUrl = `/uploads/${documentUrl}`;
        }

        console.log("Found existing signed BRBC agreement:", documentUrl);

        // Set the signed state since we're viewing an existing document
        setHasSigned(true);

        // Load the existing PDF
        try {
          // Fetch the PDF document directly from its URL
          const pdfResponse = await fetch(documentUrl);
          if (!pdfResponse.ok) {
            console.error(
              `Failed to fetch existing PDF from ${documentUrl}: ${pdfResponse.status}`,
            );
            throw new Error("Couldn't load the signed document");
          }

          const arrayBuffer = await pdfResponse.arrayBuffer();

          // Create a blob URL for displaying the PDF
          const blob = new Blob([arrayBuffer], { type: "application/pdf" });
          const blobUrl = URL.createObjectURL(blob);
          setPdfUrl(blobUrl);

          return true; // Successfully loaded existing agreement
        } catch (error) {
          console.error("Error loading existing PDF:", error);
          toast({
            title: "Error Loading Signed Document",
            description:
              "Could not load your signed agreement. Loading the blank form instead.",
            variant: "destructive",
          });
        }
      }

      return false; // No existing agreement found
    } catch (error) {
      console.error("Error checking for existing agreements:", error);
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  // Function to fetch and load the PDF data for client-side processing
  const fetchPdfData = async () => {
    try {
      setIsLoading(true);
      const timestamp = Date.now();
      // Remove fillable=true parameter to make the PDF non-editable
      const url = `/api/docs/brbc.pdf?prefill=buyer&inline=true&t=${timestamp}`;

      // Fetch the PDF as an ArrayBuffer
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(
          `Failed to fetch PDF: ${response.status} ${response.statusText}`,
        );
      }

      const arrayBuffer = await response.arrayBuffer();
      setPdfArrayBuffer(arrayBuffer);

      // Load the PDF document using pdf-lib
      const pdfDocument = await PDFDocument.load(arrayBuffer);
      setPdfDoc(pdfDocument);

      // Create a blob URL for displaying the PDF
      const blob = new Blob([arrayBuffer], { type: "application/pdf" });
      const blobUrl = URL.createObjectURL(blob);
      setPdfUrl(blobUrl);
      setCachedPdfUrl(blobUrl);

      // Extract form field names and default values
      const form = pdfDocument.getForm();
      const fields = form.getFields();

      const fieldValues: Record<string, string> = {};
      for (const field of fields) {
        if (field instanceof PDFTextField) {
          const name = field.getName();
          const value = field.getText() || "";
          fieldValues[name] = value;
        }
      }

      setFormFields(fieldValues);
    } catch (error) {
      console.error("Error loading PDF:", error);
      toast({
        title: "Error Loading PDF",
        description: "Failed to load the agreement. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // When the dialog opens, check for existing agreements and load the appropriate PDF
    if (isOpen) {
      // Reset states
      setIsSigning(false);
      setIsPreviewing(false);
      setShowSubmitConfirm(false);
      setCachedPdfUrl(null);
      setPdfDoc(null);
      setPdfArrayBuffer(null);
      setFormFields({});
      setTermsAgreed(false);
      setShowTermsDetails(false);
      setHasPreviewedOnce(false);

      // For existing signed agreements, show them directly
      // For new agreements, show the key terms summary page first
      fetchExistingAgreement().then((found) => {
        if (found) {
          // If there's an existing agreement, show PDF directly and skip all intro pages
          setShowKeyTermsSummaryPage(false);
          setShowAgreementTermsPage(false);
        } else {
          // For new agreements, show key terms summary page first
          setShowKeyTermsSummaryPage(true);
          setShowAgreementTermsPage(false);
          // Also load the blank template in the background
          fetchPdfData();
        }
      });
    }
  }, [isOpen]);

  const handlePdfLoad = () => {
    setIsLoading(false);

    // If we were previewing, turn off preview mode after load
    if (isPreviewing) {
      setIsPreviewing(false);
    }
  };

  const handlePdfError = () => {
    setIsLoading(false);

    // If load fails and we have a cached PDF, use it
    if (cachedPdfUrl) {
      setPdfUrl(cachedPdfUrl);
    } else {
      toast({
        title: "Error Loading PDF",
        description:
          "There was a problem loading the agreement. Please try again.",
        variant: "destructive",
      });
    }
  };

  // This function is defined later

  // Clear the signature canvas based on type
  const clearSignature = (
    type: "primary" | "initials" | "buyer2Primary" | "buyer2Initials",
  ) => {
    if (type === "primary" && signatureRef.current) {
      // Clear the canvas
      signatureRef.current.clear();
      // Update empty state
      setSignatureIsEmpty(true);
      // Also update the saved signatures state
      setSavedSignatures((prev) => ({ ...prev, primary: null }));
    } else if (type === "initials" && initialsRef.current) {
      // Clear the canvas
      initialsRef.current.clear();
      // Update empty state
      setInitialsIsEmpty(true);
      // Also update the saved signatures state
      setSavedSignatures((prev) => ({ ...prev, initials: null }));
    } else if (type === "buyer2Primary" && buyer2SignatureRef.current) {
      // Clear the canvas
      buyer2SignatureRef.current.clear();
      // Update empty state
      setBuyer2SignatureIsEmpty(true);
      // Also update the saved signatures state
      setSavedSignatures((prev) => ({ ...prev, buyer2Primary: null }));
    } else if (type === "buyer2Initials" && buyer2InitialsRef.current) {
      // Clear the canvas
      buyer2InitialsRef.current.clear();
      // Update empty state
      setBuyer2InitialsIsEmpty(true);
      // Also update the saved signatures state
      setSavedSignatures((prev) => ({ ...prev, buyer2Initials: null }));
    }
  };

  // Save current signature data and form values before switching tabs
  const saveCurrentSignature = () => {
    try {
      // Save form values first
      captureFormValues();

      const updatedSignatures = { ...savedSignatures };

      if (activeTab === "buyer1-signature") {
        // Save Buyer 1 signature if available
        if (signatureRef.current) {
          updatedSignatures.primary = signatureRef.current.isEmpty()
            ? null
            : signatureRef.current.toDataURL();

          // Update the empty state
          setSignatureIsEmpty(signatureRef.current.isEmpty());
        }

        // Save Buyer 1 initials if available
        if (initialsRef.current) {
          updatedSignatures.initials = initialsRef.current.isEmpty()
            ? null
            : initialsRef.current.toDataURL();

          // Update the empty state
          setInitialsIsEmpty(initialsRef.current.isEmpty());
        }
      } else if (activeTab === "buyer2-signature") {
        // Save Buyer 2 signature if available
        if (buyer2SignatureRef.current) {
          updatedSignatures.buyer2Primary = buyer2SignatureRef.current.isEmpty()
            ? null
            : buyer2SignatureRef.current.toDataURL();

          // Update the empty state
          setBuyer2SignatureIsEmpty(buyer2SignatureRef.current.isEmpty());
        }

        // Save Buyer 2 initials if available
        if (buyer2InitialsRef.current) {
          updatedSignatures.buyer2Initials = buyer2InitialsRef.current.isEmpty()
            ? null
            : buyer2InitialsRef.current.toDataURL();

          // Update the empty state
          setBuyer2InitialsIsEmpty(buyer2InitialsRef.current.isEmpty());
        }
      }

      setSavedSignatures(updatedSignatures);
    } catch (err) {
      console.error("Error saving signature:", err);
    }
  };

  // Helper method to restore saved signatures when switching tabs
  const restoreSignaturesOnTabLoad = (newTab: string) => {
    setTimeout(() => {
      try {
        if (newTab === "buyer1-signature") {
          // Restore primary buyer's signature if available
          if (signatureRef.current && savedSignatures.primary) {
            const img = new Image();
            img.onload = () => {
              const canvas = signatureRef.current;
              if (canvas) {
                canvas.clear();
                canvas.fromDataURL(savedSignatures.primary as string);

                // Manually update empty state after a slight delay
                setTimeout(() => {
                  setSignatureIsEmpty(canvas.isEmpty());
                  checkSignature();
                }, 100);
              }
            };
            img.src = savedSignatures.primary;
          }

          // Restore primary buyer's initials if available
          if (initialsRef.current && savedSignatures.initials) {
            const img = new Image();
            img.onload = () => {
              const canvas = initialsRef.current;
              if (canvas) {
                canvas.clear();
                canvas.fromDataURL(savedSignatures.initials as string);

                // Manually update empty state after a slight delay
                setTimeout(() => {
                  setInitialsIsEmpty(canvas.isEmpty());
                  checkSignature();
                }, 100);
              }
            };
            img.src = savedSignatures.initials;
          }
        } else if (newTab === "buyer2-signature") {
          // Restore second buyer's signature if available
          if (buyer2SignatureRef.current && savedSignatures.buyer2Primary) {
            const img = new Image();
            img.onload = () => {
              const canvas = buyer2SignatureRef.current;
              if (canvas) {
                canvas.clear();
                canvas.fromDataURL(savedSignatures.buyer2Primary as string);

                // Manually update empty state
                setTimeout(() => {
                  setBuyer2SignatureIsEmpty(canvas.isEmpty());
                  checkSignature();
                }, 100);
              }
            };
            img.src = savedSignatures.buyer2Primary;
          }

          // Restore second buyer's initials if available
          if (buyer2InitialsRef.current && savedSignatures.buyer2Initials) {
            const img = new Image();
            img.onload = () => {
              const canvas = buyer2InitialsRef.current;
              if (canvas) {
                canvas.clear();
                canvas.fromDataURL(savedSignatures.buyer2Initials as string);

                // Manually update empty state
                setTimeout(() => {
                  setBuyer2InitialsIsEmpty(canvas.isEmpty());
                  checkSignature();
                }, 100);
              }
            };
            img.src = savedSignatures.buyer2Initials;
          }
        }
      } catch (err) {
        console.error("Error restoring signature:", err);
      }
    }, 50); // Small delay to ensure canvas is ready
  };

  // Check if the signature canvas is empty based on active tab and update the PDF preview
  const checkSignature = () => {
    // Capture form values before checking signature
    captureFormValues();

    if (activeTab === "buyer1-signature") {
      // Check primary buyer's signature if available
      if (signatureRef.current) {
        const isEmpty = signatureRef.current.isEmpty();
        setSignatureIsEmpty(isEmpty);

        // If not empty, update PDF preview with signature
        if (!isEmpty) {
          const signatureData = signatureRef.current.toDataURL();
          updatePdfPreviewWithSignature(signatureData, "primary");
        }
      }

      // Check primary buyer's initials if available
      if (initialsRef.current) {
        const isEmpty = initialsRef.current.isEmpty();
        setInitialsIsEmpty(isEmpty);

        // If not empty, update PDF preview with initials
        if (!isEmpty) {
          const initialsData = initialsRef.current.toDataURL();
          updatePdfPreviewWithSignature(initialsData, "initials");
        }
      }
    } else if (activeTab === "buyer2-signature") {
      // Check second buyer's signature if available
      if (buyer2SignatureRef.current) {
        const isEmpty = buyer2SignatureRef.current.isEmpty();
        setBuyer2SignatureIsEmpty(isEmpty);

        // If not empty, update PDF preview with signature
        if (!isEmpty) {
          const signatureData = buyer2SignatureRef.current.toDataURL();
          updatePdfPreviewWithSignature(signatureData, "buyer2Primary");
        }
      }

      // Check second buyer's initials if available
      if (buyer2InitialsRef.current) {
        const isEmpty = buyer2InitialsRef.current.isEmpty();
        setBuyer2InitialsIsEmpty(isEmpty);

        // If not empty, update PDF preview with initials
        if (!isEmpty) {
          const initialsData = buyer2InitialsRef.current.toDataURL();
          updatePdfPreviewWithSignature(initialsData, "buyer2Initials");
        }
      }
    }
  };

  // Function to update the PDF with the signature image using client-side processing
  // The manualPreview flag indicates if this was triggered by the user clicking "Preview"
  const updatePdfPreviewWithSignature = async (
    signatureData: string,
    type: "primary" | "initials" | "buyer2Primary" | "buyer2Initials",
    manualPreview = false,
  ) => {
    try {
      // Save current signature and form values to state
      saveCurrentSignature();
      captureFormValues();

      // Only update PDF in real-time if manually previewing - this prevents form fields from being reset
      // For automatic updates during signing, we'll just save the signature data without refreshing the PDF
      if (!manualPreview) {
        // Just save the signature data without updating the PDF display
        return;
      }

      // If this is a manual preview, show loading state
      if (manualPreview) {
        setIsLoading(true);
        setIsPreviewing(true);
      }

      // Update timestamp
      const currentTime = Date.now();
      setLastPreviewTimestamp(currentTime);

      // Try to use client-side PDF processing if we have the PDF document loaded
      if (pdfDoc && pdfArrayBuffer) {
        try {
          // Create a duplicate of the PDF for editing
          const pdfBytes = await pdfDoc.save();
          const newPdfDoc = await PDFDocument.load(pdfBytes);

          // Get form to edit
          const form = newPdfDoc.getForm();

          // Save all form field values to preserve manual edits
          const fields = form.getFields();
          const updatedFormFields: Record<string, string> = {};

          for (const field of fields) {
            if (field instanceof PDFTextField) {
              const name = field.getName();
              // Try to get value from iframe if it exists
              const value = field.getText() || "";
              updatedFormFields[name] = value;
            }
          }

          // Apply the current form field values
          if (iframeRef.current) {
            try {
              const iframe = iframeRef.current;
              if (iframe.contentWindow && iframe.contentWindow.document) {
                const formElements =
                  iframe.contentWindow.document.querySelectorAll("input");
                formElements.forEach((input) => {
                  if (input.name && input.value) {
                    updatedFormFields[input.name] = input.value;
                  }
                });
              }
            } catch (err) {
              console.error("Error accessing iframe form fields:", err);
            }
          }

          // Apply saved form field values
          Object.entries(updatedFormFields).forEach(([name, value]) => {
            try {
              const field = form.getTextField(name);
              if (field) {
                field.setText(value);
              }
            } catch (err) {
              // Field may not exist or not be a text field
              console.warn(`Could not set field ${name}:`, err);
            }
          });

          // Update formFields state for future use
          setFormFields(updatedFormFields);

          // Save the modified PDF and update the viewer
          const modifiedPdfBytes = await newPdfDoc.save();
          const blob = new Blob([modifiedPdfBytes], {
            type: "application/pdf",
          });
          const blobUrl = URL.createObjectURL(blob);

          if (manualPreview) {
            setPdfUrl(blobUrl);
          } else if (!cachedPdfUrl) {
            setPdfUrl(blobUrl);
            setCachedPdfUrl(blobUrl);
          }

          if (manualPreview) {
            setIsPreviewing(false);
            setIsLoading(false);
          }

          return;
        } catch (err) {
          console.error("Error in client-side PDF processing:", err);
          // Fall back to server-side processing if client-side fails
        }
      }

      // Fall back to server-side processing
      // Prepare data for server request
      const requestData: Record<string, any> = {
        previewOnly: true, // Flag to indicate this is just for preview
        details: {},
        formFieldValues: formFields, // Send current form field values to server
      };

      // Set the appropriate signature data based on type
      if (type === "primary") {
        requestData.signatureData = signatureData;
      } else if (type === "initials") {
        requestData.initialsData = signatureData;
      } else if (type === "buyer2Primary") {
        requestData.buyer2SignatureData = signatureData;
      } else if (type === "buyer2Initials") {
        requestData.buyer2InitialsData = signatureData;
      }

      // Add existing signatures from state
      if (type !== "primary" && savedSignatures.primary) {
        requestData.signatureData = savedSignatures.primary;
      }
      if (type !== "initials" && savedSignatures.initials) {
        requestData.initialsData = savedSignatures.initials;
      }
      if (type !== "buyer2Primary" && savedSignatures.buyer2Primary) {
        requestData.buyer2SignatureData = savedSignatures.buyer2Primary;
      }
      if (type !== "buyer2Initials" && savedSignatures.buyer2Initials) {
        requestData.buyer2InitialsData = savedSignatures.buyer2Initials;
      }

      // Send the request to get a preview PDF with signatures
      const response = await fetch("/api/global-brbc/pdf-signature", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestData),
      }).then((res) => res.json());

      // If successful, update the PDF preview
      if (
        response &&
        response.success &&
        response.data &&
        response.data.pdfUrl
      ) {
        // If we're coming from a manual preview, we want to reload
        if (manualPreview) {
          setPdfUrl(response.data.pdfUrl);
        }
        // For auto-updates, only update if we don't have a cached PDF yet
        // or if this is a manual preview request
        else if (!cachedPdfUrl) {
          setPdfUrl(response.data.pdfUrl);
          setCachedPdfUrl(response.data.pdfUrl);
        }
      }
    } catch (error) {
      console.error("Error updating PDF preview:", error);

      // For manual previews, show error
      if (manualPreview) {
        setIsPreviewing(false);
        setIsLoading(false);
        toast({
          title: "Preview Error",
          description: "Could not generate PDF preview. Please try again.",
          variant: "destructive",
        });
      }
    }
  };

  // Function to generate a preview of the PDF with current signatures
  const previewSignedPdf = async () => {
    try {
      // Show loading state
      setIsLoading(true);
      setIsPreviewing(true);

      // Save current signature data
      saveCurrentSignature();

      // Capture form field values
      captureFormValues();

      // Check if we have at least one signature
      if (
        !savedSignatures.primary &&
        !savedSignatures.initials &&
        !savedSignatures.buyer2Primary &&
        !savedSignatures.buyer2Initials
      ) {
        toast({
          title: "No Signatures",
          description:
            "Please add at least one signature or initial before previewing.",
          variant: "default",
        });
        setIsLoading(false);
        setIsPreviewing(false);
        return;
      }

      // Prepare request data with all signatures and form fields
      const requestData: Record<string, any> = {
        previewOnly: true,
        details: {},
        formFieldValues: formFields,
      };

      // Add all available signatures
      if (savedSignatures.primary) {
        requestData.signatureData = savedSignatures.primary;
      }
      if (savedSignatures.initials) {
        requestData.initialsData = savedSignatures.initials;
      }
      if (savedSignatures.buyer2Primary) {
        requestData.buyer2SignatureData = savedSignatures.buyer2Primary;
      }
      if (savedSignatures.buyer2Initials) {
        requestData.buyer2InitialsData = savedSignatures.buyer2Initials;
      }

      // Send the request to get a preview PDF with signatures
      const response = await fetch("/api/global-brbc/pdf-signature", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestData),
      }).then((res) => res.json());

      // If successful, update the PDF preview
      if (
        response &&
        response.success &&
        response.data &&
        response.data.pdfUrl
      ) {
        // Set the PDF URL to the preview PDF
        setPdfUrl(response.data.pdfUrl);

        // Mark that user has previewed the document at least once
        setHasPreviewedOnce(true);
      } else {
        throw new Error("Failed to generate preview");
      }
    } catch (error) {
      console.error("Error generating preview:", error);
      toast({
        title: "Preview Failed",
        description: "Could not generate preview. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
      setIsPreviewing(false);
    }
  };

  // This function validates signatures and shows the preview confirmation dialog
  // Function to capture current form field values from the iframe
  const captureFormValues = () => {
    try {
      // Get the current form field values from the iframe
      if (iframeRef.current && iframeRef.current.contentWindow) {
        const formElements =
          iframeRef.current.contentWindow.document.querySelectorAll("input");
        const updatedFormFields: Record<string, string> = { ...formFields };

        formElements.forEach((input) => {
          if (input.name && input.value) {
            updatedFormFields[input.name] = input.value;
          }
        });

        // Update form fields state
        setFormFields(updatedFormFields);
      }
    } catch (err) {
      console.error("Error capturing form values:", err);
    }
  };

  const handleSubmitSignature = async () => {
    // Capture any form field values before switching to sign mode
    captureFormValues();

    // Force an update of the current tab's signatures
    saveCurrentSignature();

    // Manual check for primary buyer's signature using saved signature data
    if (!savedSignatures.primary) {
      toast({
        title: "Primary Signature Required",
        description:
          "Please provide the primary buyer's signature before submitting.",
        variant: "destructive",
      });
      // Switch to buyer 1 tab if needed
      if (activeTab !== "buyer1-signature") {
        setActiveTab("buyer1-signature");
        restoreSignaturesOnTabLoad("buyer1-signature");
      }
      return;
    }

    // Manual check for initials using saved data
    if (!savedSignatures.initials) {
      toast({
        title: "Initials Required",
        description:
          "Please provide the primary buyer's initials before submitting.",
        variant: "destructive",
      });
      // Switch to buyer 1 tab if needed
      if (activeTab !== "buyer1-signature") {
        setActiveTab("buyer1-signature");
        restoreSignaturesOnTabLoad("buyer1-signature");
      }
      return;
    }

    // Check if the user has agreed to the terms
    if (!termsAgreed) {
      toast({
        title: "Terms Agreement Required",
        description:
          "Please read and agree to the terms before submitting the agreement.",
        variant: "destructive",
      });
      return;
    }

    // Show a preview before submitting
    await previewSignedPdf();

    // Open confirmation dialog once preview is loaded
    setShowSubmitConfirm(true);
  };

  // Actually submit the signature after confirmation
  const confirmAndSubmitSignature = async () => {
    // Save any signature currently in the active canvas
    saveCurrentSignature();

    try {
      setIsSubmitting(true);

      // First, ensure we have the most updated signature data
      saveCurrentSignature();

      // Get all signature data - use saved signatures for submission
      // For the primary buyer's signature
      let signatureData: string;
      if (savedSignatures.primary) {
        signatureData = savedSignatures.primary as string;
      } else {
        throw new Error("Primary signature is required");
      }

      // For the primary buyer's initials
      let initialsData: string;
      if (savedSignatures.initials) {
        initialsData = savedSignatures.initials as string;
      } else {
        throw new Error("Initials are required");
      }

      // For the second buyer's signature (optional)
      const buyer2SignatureData =
        savedSignatures.buyer2Primary ||
        (buyer2SignatureRef.current && !buyer2SignatureRef.current.isEmpty()
          ? buyer2SignatureRef.current.toDataURL()
          : null);

      // For the second buyer's initials (optional)
      const buyer2InitialsData =
        savedSignatures.buyer2Initials ||
        (buyer2InitialsRef.current && !buyer2InitialsRef.current.isEmpty()
          ? buyer2InitialsRef.current.toDataURL()
          : null);

      // Capture latest form values before submitting
      captureFormValues();

      // Submit signature to server with all signature types and form field data
      const response = await fetch("/api/global-brbc/pdf-signature", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          // Main signature for sign1 field
          signatureData,
          // Initials for initial1 field
          initialsData,
          // Optional second buyer signature and initials
          buyer2SignatureData,
          buyer2InitialsData,
          // Include form field values to preserve user edits
          formFieldValues: formFields,
          details: {
            buyer1:
              formFields.buyer1 ||
              (user?.firstName && user?.lastName
                ? `${user.firstName} ${user.lastName}`.trim()
                : ""),
            buyer2: formFields.buyer2 || "",
            startDate: START_DATE,
            endDate: END_DATE,
            startDate2: START_DATE,
            endDate2: END_DATE,
          },
        }),
      }).then((res) => res.json());

      // Handle successful submission
      if (response && response.success) {
        setHasSigned(true);
        toast({
          title: "Agreement Signed",
          description:
            "You have successfully signed the buyer representation agreement.",
        });

        // Call onSigned callback if provided
        if (onSigned) {
          onSigned();
        }
      } else {
        const errorMessage =
          response && (response.error as string)
            ? (response.error as string)
            : "Failed to sign agreement";
        throw new Error(errorMessage);
      }
    } catch (error) {
      console.error("Error signing agreement:", error);
      toast({
        title: "Signing Failed",
        description:
          error instanceof Error
            ? error.message
            : "An unexpected error occurred while signing the agreement.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
      setShowSubmitConfirm(false);
    }
  };

  const handleClose = () => {
    // If the user has signed, we can just close
    if (hasSigned) {
      onClose();
      return;
    }

    // If they're in signing mode but haven't submitted, ask for confirmation
    if (isSigning && !signatureIsEmpty) {
      if (
        window.confirm(
          "You haven't submitted your signature. Are you sure you want to close?",
        )
      ) {
        // Reset the state
        setShowKeyTermsSummaryPage(true);
        setShowAgreementTermsPage(false);
        setTermsAgreed(false);
        setShowTermsDetails(false);
        onClose();
      }
    } else {
      // Reset the state
      setShowKeyTermsSummaryPage(true);
      setShowAgreementTermsPage(false);
      setTermsAgreed(false);
      setShowTermsDetails(false);
      // Otherwise just close
      onClose();
    }
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
        <DialogContent className="max-w-12xl w-[90vw] h-[90vh] flex flex-col p-0 overflow-hidden">
          <DialogHeader className="p-6 border-b bg-gray-50">
            <DialogTitle className="text-xl font-semibold">
              <div className="flex items-center">
                <FileText className="mr-2 h-5 w-5 text-primary" />
                {existingAgreement
                  ? "Signed Buyer Representation Agreement"
                  : showKeyTermsSummaryPage
                    ? "Key Agreement Terms"
                    : showAgreementTermsPage
                      ? "Agreement Terms & Disclosures"
                      : "Buyer Representation Agreement"}
              </div>
            </DialogTitle>
            <DialogDescription>
              {hasSigned
                ? "Your completed and signed buyer representation agreement."
                : showKeyTermsSummaryPage
                  ? "Please review the key agreement terms before proceeding."
                  : showAgreementTermsPage
                    ? "Please review and accept the following terms before proceeding to the agreement."
                    : isSigning
                      ? "Please review the agreement and add your signature below."
                      : "Please review and sign the agreement below to proceed with your property search."}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-grow flex flex-col md:flex-row overflow-hidden">
            {/* Key Terms Summary Page (shows first before Agreement Terms) */}
            {showKeyTermsSummaryPage ? (
              <div className="flex-grow p-6 overflow-y-auto">
                <div className="max-w-3xl mx-auto">
                  <div className="mb-6">
                    <h2 className="text-2xl font-bold text-gray-900 mb-4">
                      Key Agreement Terms
                    </h2>
                    <div
                      style={{
                        fontFamily: "Arial, sans-serif",
                        fontSize: "16px",
                        color: "#000",
                      }}
                    >
                      <p>
                        The following are the key terms of this Buyer
                        Representation and Broker Compensation Agreement (BRBC)
                        between you and the real estate brokerage/agent:
                      </p>

                      <p>
                        <strong>A(1)</strong> – The agreement is for a{" "}
                        <strong>3-month period</strong>.<br />
                        <strong>A(2)</strong> – It is an{" "}
                        <strong>exclusive agreement</strong>, meaning you agree
                        to work only with the named brokerage/agent during this
                        time.
                        <br />
                        <strong>E(1)</strong> –{" "}
                        <strong>Compensation of $5,900</strong> will be paid to
                        the broker at <strong>closing</strong>.<br />
                        <strong>E(3)</strong> – There is a{" "}
                        <strong>Continuation Period of 180 days</strong>, which
                        means the broker may still be entitled to compensation
                        if you buy a property introduced during the agreement
                        period, up to 180 days after the agreement ends.
                        <br />
                        <strong>F</strong> – Cancellation Rights: 1 day after
                        receipt. You have the right to cancel this exclusive
                        agreement by giving written notice. The contract will
                        end 1 day after receipt.
                      </p>

                      <p>
                        This agreement outlines the key terms of your
                        relationship with your broker/agent, including their
                        duties to you, how they're paid, and your rights as a
                        buyer. Understanding these points ensures clarity and
                        sets proper expectations for both sides.
                      </p>

                      <p>
                        For a full description of the entire Buyer
                        Representation and Broker Compensation Agreement, please
                        see the attached document. For a video explanation,
                        please{" "}
                        <a
                          href="https://www.youtube.com/watch?v=-Az2GY6bta4"
                          target="_blank"
                          style={{ color: "blue", textDecoration: "underline" }}
                        >
                          click here
                        </a>
                        .
                      </p>
                    </div>
                  </div>

                  <div className="flex justify-end space-x-3 mt-8">
                    <Button variant="outline" onClick={handleClose}>
                      Cancel
                    </Button>
                    <Button
                      onClick={() => {
                        setShowKeyTermsSummaryPage(false);
                        setShowAgreementTermsPage(true);
                      }}
                    >
                      Agree
                    </Button>
                  </div>
                </div>
              </div>
            ) :  showAgreementTermsPage ? (
              <div className="flex-grow p-6 overflow-y-auto">
                <div className="max-w-3xl mx-auto">
                  <div className="mb-6">
                    <h2 className="text-2xl font-bold text-gray-900 mb-4">
                      Agreement Terms
                    </h2>
                    <p className="text-gray-600 mb-4">
                      Before proceeding to view and sign the Buyer
                      Representation and Broker Compensation Agreement, please
                      review the following important terms and disclosures:
                    </p>

                    <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
                      <h3 className="text-lg font-medium text-gray-900 mb-3">
                        REALVetted - BUYER REPRESENTATION AND BROKER
                        COMPENSATION AGREEMENT and Disclosure Packet
                      </h3>

                      <p className="text-gray-700 mb-4">
                        This document contains mandatory disclosures and
                        agreements required by California law when working with
                        a real estate broker. By signing this agreement, you
                        acknowledge and accept the terms contained in all the
                        following documents:
                      </p>

                      <div className="border-t border-gray-200 pt-3 mb-2">
                        <h4 className="font-medium text-gray-900 mb-2">
                          Summary of Documents:
                        </h4>
                        <ol className="list-decimal ml-5 space-y-2 text-gray-700">
                          <li>
                            <strong>
                              DISCLOSURE REGARDING REAL ESTATE AGENCY
                              RELATIONSHIP (C.A.R. Form AD)
                            </strong>{" "}
                            - Explains the legal relationship between you and
                            the real estate agent/broker.
                          </li>
                          <li>
                            <strong>
                              BUYER REPRESENTATION AND BROKER COMPENSATION
                              AGREEMENT (C.A.R. Form BRBC)
                            </strong>{" "}
                            - Outlines the terms of your representation and how
                            your broker will be compensated.
                          </li>
                          <li>
                            <strong>
                              BROKER COMPENSATION ADVISORY (C.A.R. Form BCA,
                              7/24)
                            </strong>{" "}
                            - Details how brokers are compensated and recent
                            changes in industry practices.
                          </li>
                          <li>
                            <strong>
                              BUYER'S INVESTIGATION ADVISORY (C.A.R. Form BIA)
                            </strong>{" "}
                            - Informs you of your responsibility to investigate
                            properties.
                          </li>
                          <li>
                            <strong>
                              POSSIBLE REPRESENTATION OF MORE THAN ONE BUYER OR
                              SELLER (C.A.R. Form PRBS)
                            </strong>{" "}
                            - Discloses that your broker may represent multiple
                            clients.
                          </li>
                          <li>
                            <strong>
                              CALIFORNIA CONSUMER PRIVACY ACT (CCPA) ADVISORY
                            </strong>{" "}
                            - Explains your privacy rights under California law.
                          </li>
                        </ol>
                      </div>

                      {true && (
                        <div className="mt-4 border-t border-gray-200 pt-4 text-sm text-gray-700 space-y-4">
                          <div>
                            <h5 className="font-semibold mb-1">
                              DISCLOSURE REGARDING REAL ESTATE AGENCY
                              RELATIONSHIP (C.A.R. Form AD)
                            </h5>
                            <p>
                              This mandatory disclosure explains that a real
                              estate agent can represent a buyer, a seller, or
                              both in a transaction. It details the fiduciary
                              duties owed to you as a client, including loyalty,
                              confidentiality, and full disclosure.
                            </p>
                          </div>

                          <div>
                            <h5 className="font-semibold mb-1">
                              BUYER REPRESENTATION AND BROKER COMPENSATION
                              AGREEMENT (C.A.R. Form BRBC)
                            </h5>
                            <p>
                              This agreement establishes the professional
                              relationship between you (the buyer) and the
                              broker. It creates a legal obligation for the
                              broker to represent your best interests while
                              searching for and purchasing property. The
                              agreement also specifies:
                            </p>
                            <ul className="list-disc ml-5 mt-1">
                              <li>
                                The duration of the representation (typically 90
                                days)
                              </li>
                              <li>The geographic area covered</li>
                              <li>Property types you're interested in</li>
                              <li>How the broker will be compensated</li>
                              <li>Your obligations as a client</li>
                            </ul>
                          </div>

                          <div>
                            <h5 className="font-semibold mb-1">
                              BROKER COMPENSATION ADVISORY (C.A.R. Form BCA,
                              7/24)
                            </h5>
                            <p>
                              This document explains how real estate brokers are
                              compensated and the changes in compensation
                              practices following recent legal settlements. It
                              clarifies that:
                            </p>
                            <ul className="list-disc ml-5 mt-1">
                              <li>Commission rates are negotiable</li>
                              <li>
                                Buyers may be responsible for paying some or all
                                of their broker's commission
                              </li>
                              <li>
                                Different types of listing agreements and their
                                compensation implications
                              </li>
                            </ul>
                          </div>

                          <div>
                            <h5 className="font-semibold mb-1">
                              BUYER'S INVESTIGATION ADVISORY (C.A.R. Form BIA)
                            </h5>
                            <p>
                              This advisory emphasizes your responsibility to
                              thoroughly investigate the property before
                              completing the purchase. It recommends:
                            </p>
                            <ul className="list-disc ml-5 mt-1">
                              <li>Hiring professional inspectors</li>
                              <li>Researching neighborhood conditions</li>
                              <li>Checking public records</li>
                              <li>Investigating natural hazards</li>
                            </ul>
                          </div>

                          <div>
                            <h5 className="font-semibold mb-1">
                              POSSIBLE REPRESENTATION OF MORE THAN ONE BUYER OR
                              SELLER (C.A.R. Form PRBS)
                            </h5>
                            <p>
                              This disclosure informs you that your broker may
                              represent multiple buyers interested in the same
                              properties or may represent both buyers and
                              sellers in different transactions. It explains how
                              the broker will handle potential conflicts of
                              interest.
                            </p>
                          </div>

                          <div>
                            <h5 className="font-semibold mb-1">
                              CALIFORNIA CONSUMER PRIVACY ACT (CCPA) ADVISORY
                            </h5>
                            <p>
                              This advisory explains your rights under
                              California's privacy laws, including:
                            </p>
                            <ul className="list-disc ml-5 mt-1">
                              <li>
                                Right to know what personal information is
                                collected
                              </li>
                              <li>Right to delete personal information</li>
                              <li>
                                Right to opt-out of the sale of personal
                                information
                              </li>
                              <li>
                                Right to non-discrimination for exercising these
                                rights
                              </li>
                            </ul>
                          </div>
                        </div>
                      )}

                      <div className="flex items-center mt-6 mb-1">
                        <input
                          id="terms-agreement"
                          type="checkbox"
                          className="h-5 w-5 rounded border-gray-300 text-primary focus:ring-primary"
                          checked={termsAgreed}
                          onChange={(e) => setTermsAgreed(e.target.checked)}
                        />
                        <label
                          htmlFor="terms-agreement"
                          className="ml-2 block text-gray-700"
                        >
                          I have read and understand the Agreement Terms and all
                          associated disclosures, and I agree to the terms
                          outlined in these documents.
                        </label>
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end space-x-3 mt-8">
                    <Button variant="outline" onClick={handleClose}>
                      Cancel
                    </Button>
                    <Button
                      onClick={() => {
                        setShowAgreementTermsPage(false);
                        setShowVideoPage(true);
                      }}
                      disabled={!termsAgreed}
                    >
                      Continue to Agreement
                    </Button>
                  </div>
                </div>
              </div>
            ) : showVideoPage ? (
              <div className="flex-grow p-6 overflow-y-auto">
                <div className="max-w-8xl mx-auto">
                  <div className="mb-6">
                    <h2 className="text-2xl font-bold text-gray-900 mb-4">
                      Understanding Your Agreement
                    </h2>
                    <p className="text-gray-600 mb-6">
                      Please watch this short video explaining the key aspects of the Buyer Representation Agreement:
                    </p>
                    
                    <div className="aspect-video mb-8">
                      <iframe
                        width="100%"
                        height="100%"
                        src="https://www.youtube.com/embed/-Az2GY6bta4"
                        title="Buyer Representation Agreement Explanation"
                        frameBorder="0"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                      ></iframe>
                    </div>
                  </div>

                  <div className="flex justify-end space-x-3 mt-8">
                    <Button variant="outline" onClick={handleClose}>
                      Cancel
                    </Button>
                    <Button
                      onClick={() => {
                        setShowVideoPage(false);
                        setVideoWatched(true);
                        setIsSigning(true);
                      }}
                    >
                      I Have Watched the Video
                    </Button>
                  </div>
                </div>
              </div>
            ) :(
              /* PDF Viewer - Only shown after terms agreement */
              <div
                className={`flex-grow ${isSigning ? "w-3/4" : "w-full"} overflow-hidden relative`}
              >
                {isLoading && (
                  <div className="absolute inset-0 flex items-center justify-center bg-gray-100 bg-opacity-70 z-10">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                )}
                <iframe
                  ref={iframeRef}
                  src={pdfUrl}
                  className="w-full h-full border-0"
                  onLoad={() => {
                    handlePdfLoad();
                    // After loading, try to capture form field values after a delay to ensure form is ready
                    setTimeout(captureFormValues, 500);
                  }}
                  onError={handlePdfError}
                ></iframe>
              </div>
            )}
            {/* Signature Panel (only visible when signing) */}
            {!showKeyTermsSummaryPage && !showAgreementTermsPage && !showVideoPage && (
              <div className="w-full md:w-1/3 border-l border-gray-200 flex flex-col">
                <Tabs
                  value={activeTab}
                  onValueChange={(newTab) => {
                    // Save current signature and form values before switching tabs
                    saveCurrentSignature();
                    captureFormValues();
                    // Update active tab
                    setActiveTab(newTab);
                    // Restore signature for the new tab
                    restoreSignaturesOnTabLoad(newTab);
                  }}
                  className="flex-grow flex flex-col"
                >
                  {/* Main tabs for Buyer 1 and Buyer 2 */}
                  <TabsList className="w-full grid grid-cols-2">
                    <TabsTrigger
                      value="buyer1-signature"
                      className="flex items-center"
                    >
                      <User className="mr-2 h-4 w-4" />
                      Buyer 1
                    </TabsTrigger>
                    <TabsTrigger
                      value="buyer2-signature"
                      className="flex items-center"
                    >
                      <UserPlus className="mr-2 h-4 w-4" />
                      Buyer 2
                    </TabsTrigger>
                  </TabsList>

                  {/* Buyer 1 Tab Content */}
                  <TabsContent
                    value="buyer1-signature"
                    className="flex-grow flex flex-col space-y-6"
                  >
                    {/* Buyer 1 Signature Section */}
                    <div>
                      {/* Buyer 1 Information Fields */}
                      <div className="space-y-3">
                        <div className="flex flex-col">
                          <label className="text-sm font-medium mb-1 text-gray-700">
                            Full Name:
                          </label>
                          <input
                            type="text"
                            className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm"
                            placeholder="Full Name"
                            value={
                              formFields.buyer1 ||
                              (user?.firstName && user?.lastName
                                ? `${user.firstName} ${user.lastName}`.trim()
                                : "")
                            }
                            onChange={(e) => {
                              const updatedFields = {
                                ...formFields,
                                buyer1: e.target.value,
                              };
                              setFormFields(updatedFields);
                            }}
                          />
                        </div>
                      </div>

                      <div className="flex justify-between items-center mt-4">
                        <h4 className="font-medium">
                          Signature - full signature
                        </h4>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => clearSignature("primary")}
                            disabled={signatureIsEmpty}
                            className="h-8 px-2 py-0"
                          >
                            Clear
                          </Button>
                        </div>
                      </div>
                      <div className="border border-gray-300 rounded-md flex-grow bg-white h-32">
                        <SignatureCanvas
                          ref={signatureRef}
                          canvasProps={{
                            className: "w-full h-full signature-canvas",
                            onMouseUp: checkSignature,
                            onTouchEnd: checkSignature,
                          }}
                          onEnd={checkSignature}
                        />
                      </div>

                      {/* Buyer 1 Initials Section */}
                      <div className="flex justify-between items-center">
                        <h4 className="font-medium">
                          Initials - short signature
                        </h4>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => clearSignature("initials")}
                          disabled={initialsIsEmpty}
                          className="h-8 px-2 py-0"
                        >
                          Clear
                        </Button>
                      </div>
                      <div className="border border-gray-300 rounded-md flex-grow bg-white h-24 w-1/2">
                        <SignatureCanvas
                          ref={initialsRef}
                          canvasProps={{
                            className: "w-full h-full signature-canvas",
                            onMouseUp: checkSignature,
                            onTouchEnd: checkSignature,
                          }}
                          onEnd={checkSignature}
                        />
                      </div>
                    </div>
                  </TabsContent>

                  {/* Buyer 2 Tab Content */}
                  <TabsContent
                    value="buyer2-signature"
                    className="flex-grow flex flex-col space-y-6"
                  >
                    {/* Buyer 2 Signature Section */}
                    <div>
                      {/* Buyer 2 Information Fields - Only Name */}
                      <div className="">
                        <div className="flex flex-col">
                          <label className="text-sm font-medium text-gray-700">
                            Full Name:
                          </label>
                          <input
                            type="text"
                            className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm"
                            placeholder="Full Name (Co-Buyer)"
                            value={formFields.buyer2 || ""}
                            onChange={(e) => {
                              const updatedFields = {
                                ...formFields,
                                buyer2: e.target.value,
                              };
                              setFormFields(updatedFields);
                            }}
                          />
                        </div>
                      </div>

                      <div className="flex justify-between items-center">
                        <h4 className="font-medium">
                          Signature - Full Signature
                        </h4>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => clearSignature("buyer2Primary")}
                          disabled={buyer2SignatureIsEmpty}
                          className="h-8 px-2 py-0"
                        >
                          Clear
                        </Button>
                      </div>
                      <div className="border border-gray-300 rounded-md lex-grow bg-white h-32">
                        <SignatureCanvas
                          ref={buyer2SignatureRef}
                          canvasProps={{
                            className: "w-full h-full signature-canvas",
                            onMouseUp: checkSignature,
                            onTouchEnd: checkSignature,
                          }}
                          onEnd={checkSignature}
                        />
                      </div>

                      {/* Buyer 2 Initials Section */}
                      <div className="flex justify-between items-center">
                        <h4 className="font-medium">
                          Initials - Short Signature
                        </h4>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => clearSignature("buyer2Initials")}
                          disabled={buyer2InitialsIsEmpty}
                          className="h-8 px-2 py-0"
                        >
                          Clear
                        </Button>
                      </div>
                      <div className="border border-gray-300 rounded-md flex-grow bg-white h-24 w-1/2">
                        <SignatureCanvas
                          ref={buyer2InitialsRef}
                          canvasProps={{
                            className: "w-full h-full signature-canvas",
                            onMouseUp: checkSignature,
                            onTouchEnd: checkSignature,
                          }}
                          onEnd={checkSignature}
                        />
                      </div>
                    </div>
                  </TabsContent>

                  <div className="flex justify-end items-center">
                    <Button
                      onClick={() => {
                        if (!hasPreviewedOnce) {
                          // If not previewed yet, show preview
                          previewSignedPdf();
                        } else {
                          // If already previewed, handle submit
                          if (signatureRef.current) {
                            setSignatureIsEmpty(signatureRef.current.isEmpty());
                          }
                          if (initialsRef.current) {
                            setInitialsIsEmpty(initialsRef.current.isEmpty());
                          }

                          setTimeout(() => {
                            handleSubmitSignature();
                          }, 50);
                        }
                      }}
                      disabled={
                        isSubmitting ||
                        isPreviewing ||
                        (!savedSignatures.primary && signatureIsEmpty) ||
                        (!savedSignatures.initials && initialsIsEmpty) ||
                        !termsAgreed
                      }
                      className="w-48"
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Submitting...
                        </>
                      ) : isPreviewing ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Previewing...
                        </>
                      ) : !hasPreviewedOnce ? (
                        <>
                          <Eye className="mr-2 h-4 w-4" />
                          Preview Agreement
                        </>
                      ) : (
                        "Submit Agreement"
                      )}
                    </Button>
                  </div>
                </Tabs>
              </div>
            )}
          </div>

          <DialogFooter className="p-4 border-t flex flex-col sm:flex-row justify-between items-center gap-2">

          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showSubmitConfirm} onOpenChange={setShowSubmitConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Submission</AlertDialogTitle>
            <AlertDialogDescription>
              Please review the document with your signatures above. Are you
              sure you want to submit this agreement?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmAndSubmitSignature}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Submitting...
                </>
              ) : (
                "Submit Agreement"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
