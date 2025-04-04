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

/**
 * Fills in the California Agency Disclosure form with provided data
 *
 * @param formData Data to fill in the form
 * @returns The filled PDF as a Buffer
 */
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
