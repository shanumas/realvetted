import {
  PDFDocument,
  rgb,
  StandardFonts,
  PDFForm,
  PDFCheckBox,
  PDFTextField,
  PDFButton,
} from "pdf-lib";
import * as fs from "fs";
import * as path from "path";

export interface AgencyDisclosureFormData {
  buyerName1?: string;
  buyerName2?: string;
  buyerSignature1?: string;
  buyerSignature2?: string;
  buyerSignatureDate1?: string;
  buyerSignatureDate2?: string;

  sellerName1?: string;
  sellerName2?: string;
  sellerSignature1?: string;
  sellerSignature2?: string;
  sellerSignatureDate1?: string;
  sellerSignatureDate2?: string;

  agentName?: string;
  agentBrokerageName?: string;
  agentLicenseNumber?: string;
  agentSignature?: string;
  agentSignatureDate?: string;

  propertyAddress?: string;
  propertyCity?: string;
  propertyState?: string;
  propertyZip?: string;

  isEditable?: boolean;
}

/**
 * Adds a signature image to a specific field in the PDF
 *
 * @param pdfBuffer The PDF buffer to add the signature to
 * @param signatureData Base64 encoded signature image data
 * @param signatureField Which signature field to add the signature to (buyer1, buyer2, seller1, seller2, agent)
 * @returns Modified PDF buffer with signature added
 */
export async function addSignatureToPdf(
  pdfBuffer: Buffer,
  signatureData: string,
  signatureField: "buyer1" | "buyer2" | "seller1" | "seller2" | "agent",
): Promise<Buffer> {
  try {
    // Load the PDF document
    const pdfDoc = await PDFDocument.load(pdfBuffer);

    // Remove the data URL prefix if present
    let imageData = signatureData;
    if (imageData.startsWith("data:image/png;base64,")) {
      imageData = imageData.substring("data:image/png;base64,".length);
    }

    // Convert base64 signature to Buffer
    const signatureBuffer = Buffer.from(imageData, "base64");

    // Embed the signature image
    const signatureImage = await pdfDoc.embedPng(signatureBuffer);

    // Get the signature field name based on the signatureField parameter
    let fieldName = "";
    switch (signatureField) {
      case "buyer1":
        fieldName = "buyer_signature_1";
        break;
      case "buyer2":
        fieldName = "buyer_signature_2";
        break;
      case "seller1":
        fieldName = "seller_signature_1";
        break;
      case "seller2":
        fieldName = "seller_signature_2";
        break;
      case "agent":
        fieldName = "agent_signature";
        break;
    }

    // Get the first page of the document
    const pages = pdfDoc.getPages();
    const firstPage = pages[0];

    // Get the form to find the signature field
    const form = pdfDoc.getForm();

    try {
      // Try to find the signature field
      const signatureTextField = form.getTextField(fieldName);

      // Try to get position and size from the text field
      // Note: Different versions of pdf-lib might have different APIs
      let x = 100,
        y = 100,
        width = 150,
        height = 50;

      try {
        // For PDF-lib v1.x
        const fieldRect = (signatureTextField as any).acroField.getRectangle();
        x = fieldRect.x;
        y = fieldRect.y;
        width = fieldRect.width;
        height = fieldRect.height;
      } catch (e) {
        try {
          // For other versions, try to access the field bounds
          const bounds = (signatureTextField as any).getBounds();
          if (bounds) {
            x = bounds.x;
            y = bounds.y;
            width = bounds.width;
            height = bounds.height;
          }
        } catch (e2) {
          console.warn(
            "Could not get signature field bounds, using default position",
          );
        }
      }

      // Draw the signature image at the field position
      firstPage.drawImage(signatureImage, {
        x,
        y,
        width,
        height,
      });

      // Clear the text field
      signatureTextField.setText("");

      // Try to flatten the field if the method exists
      try {
        (signatureTextField as any).flatten();
      } catch (e) {
        console.warn("Could not flatten text field, but image was drawn");
      }
    } catch (fieldError) {
      console.warn(
        `Signature field ${fieldName} not found. Using default placement.`,
      );
      // If field not found, add signature in a default position
      const { width, height } = firstPage.getSize();
      const sigWidth = 150;
      const sigHeight = 50;
      let sigX = 100;
      let sigY = 100;

      // Adjust position based on signature type
      switch (signatureField) {
        case "buyer1":
          sigX = width * 0.2;
          sigY = height * 0.3;
          break;
        case "buyer2":
          sigX = width * 0.2;
          sigY = height * 0.25;
          break;
        case "seller1":
          sigX = width * 0.6;
          sigY = height * 0.3;
          break;
        case "seller2":
          sigX = width * 0.6;
          sigY = height * 0.25;
          break;
        case "agent":
          sigX = width * 0.6;
          sigY = height * 0.15;
          break;
      }

      // Draw the signature image
      firstPage.drawImage(signatureImage, {
        x: sigX,
        y: sigY,
        width: sigWidth,
        height: sigHeight,
      });
    }

    // Save the document
    const modifiedPdfBytes = await pdfDoc.save();

    return Buffer.from(modifiedPdfBytes);
  } catch (error) {
    console.error(`Error adding ${signatureField} signature to PDF:`, error);
    throw error;
  }
}
/**
 * Replaces specified placeholder text in a PDF with the given replacement text
 *
 * @param pdfBuffer Original PDF buffer
 * @param placeholder Placeholder text to replace (e.g., "{1}")
 * @param replacement Text to replace the placeholder with
 * @returns Modified PDF as a Buffer
 */
export async function replacePlaceholderInPdf(
  pdfBuffer: Buffer,
  placeholder: string,
  replacement: string,
): Promise<Buffer> {
  try {
    // Try to load the PDF document with error handling
    let pdfDoc;
    try {
      pdfDoc = await PDFDocument.load(pdfBuffer, {
        ignoreEncryption: true,
      });
    } catch (loadError) {
      console.error(
        "Error loading PDF for placeholder replacement:",
        loadError,
      );
      throw new Error("Cannot load PDF document");
    }

    // Get the form from the document
    const form = pdfDoc.getForm();

    try {
      // Try to find a text field with the placeholder ID and set its text
      form.getTextField(placeholder).setText(replacement);
      console.log(
        `Successfully replaced field "${placeholder}" with "${replacement}" using form fields`,
      );
    } catch (fieldError) {
      console.warn(
        `No form field with ID "${placeholder}" found. Only updating existing fields as requested.`,
      );
      throw new Error(
        `Text field "${placeholder}" does not exist in the document`,
      );
    }

    // Save the document
    const modifiedPdfBytes = await pdfDoc.save();

    return Buffer.from(modifiedPdfBytes);
  } catch (error) {
    console.error("Error replacing placeholder in PDF: ", error);
    throw error;
  }
}
