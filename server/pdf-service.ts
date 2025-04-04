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
    console.log("replacePlaceholderInPdf called............");
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

    const fieldNames = form.getFields().map((f) => f.getName());
    if (!fieldNames.includes(placeholder)) {
      console.warn(
        `Field ${placeholder} not found in PDF .........................................`,
      );
      return pdfBuffer; // Return original buffer if field not found
    }

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

/**
 * Fills out the agency disclosure form with the provided data
 * 
 * @param formData Data to fill into the form fields
 * @returns Buffer containing the filled PDF document
 */
export async function fillAgencyDisclosureForm(
  formData: AgencyDisclosureFormData
): Promise<Buffer> {
  // Load the template PDF
  const templatePath = path.join(process.cwd(), 'uploads', 'pdf', 'brbc.pdf');
  let pdfBuffer;
  
  try {
    pdfBuffer = fs.readFileSync(templatePath);
  } catch (error) {
    console.error('Error reading agency disclosure template PDF:', error);
    throw new Error('Could not read agency disclosure template PDF');
  }
  
  // First, try to replace placeholder "1" with "uma" as requested
  try {
    pdfBuffer = await replacePlaceholderInPdf(pdfBuffer, "1", "uma");
    console.log('Successfully applied text replacement for placeholder "1"');
  } catch (error: any) {
    console.log('Text replacement for placeholder "1" failed:', error.message || 'Unknown error');
  }

  // Next, try to apply other replacements for our form fields
  const fieldMappings = {
    'buyer_name_1': formData.buyerName1,
    'buyer_name_2': formData.buyerName2,
    'buyer_date_1': formData.buyerSignatureDate1,
    'buyer_date_2': formData.buyerSignatureDate2,
    'seller_name_1': formData.sellerName1,
    'seller_name_2': formData.sellerName2,
    'seller_date_1': formData.sellerSignatureDate1,
    'seller_date_2': formData.sellerSignatureDate2,
    'agent_name': formData.agentName,
    'agent_brokerage': formData.agentBrokerageName,
    'agent_license': formData.agentLicenseNumber,
    'agent_date': formData.agentSignatureDate,
    'property_address': formData.propertyAddress,
    'property_city': formData.propertyCity,
    'property_state': formData.propertyState,
    'property_zip': formData.propertyZip
  };

  // Try to process each field through text replacement before loading the PDF
  for (const [field, value] of Object.entries(fieldMappings)) {
    if (value) {
      try {
        pdfBuffer = await replacePlaceholderInPdf(pdfBuffer, field, value);
        console.log(`Successfully applied text replacement for field "${field}"`);
      } catch (error: any) {
        // Continue if field replacement fails, we'll try form filling next
        console.log(`Field "${field}" not found for text replacement, will try form filling: ${error.message || 'Unknown error'}`);
      }
    }
  }
  
  // Now load the PDF document (after all text replacements have been attempted)
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  
  // Get the form from the document
  const form = pdfDoc.getForm();
  
  // Helper function to set field text if it exists
  const setFieldTextIfExists = (fieldName: string, value?: string) => {
    if (!value) return;
    
    try {
      form.getTextField(fieldName).setText(value);
    } catch (error: any) {
      console.warn(`Field '${fieldName}' doesn't exist, creating a sample field with text placeholder`);
      console.log(`Could not find field '${fieldName}' to replace with '${value}' through form fields: ${error.message || 'Unknown error'}`);
    }
  };
  
  // Set form fields - mapping form data to the actual field names in the PDF
  // Buyer information
  setFieldTextIfExists('buyer_name_1', formData.buyerName1);
  setFieldTextIfExists('buyer_name_2', formData.buyerName2);
  setFieldTextIfExists('buyer_date_1', formData.buyerSignatureDate1);
  setFieldTextIfExists('buyer_date_2', formData.buyerSignatureDate2);
  
  // Seller information
  setFieldTextIfExists('seller_name_1', formData.sellerName1);
  setFieldTextIfExists('seller_name_2', formData.sellerName2);
  setFieldTextIfExists('seller_date_1', formData.sellerSignatureDate1);
  setFieldTextIfExists('seller_date_2', formData.sellerSignatureDate2);
  
  // Agent information
  setFieldTextIfExists('agent_name', formData.agentName);
  setFieldTextIfExists('agent_brokerage', formData.agentBrokerageName);
  setFieldTextIfExists('agent_license', formData.agentLicenseNumber);
  setFieldTextIfExists('agent_date', formData.agentSignatureDate);
  
  // Property information
  setFieldTextIfExists('property_address', formData.propertyAddress);
  setFieldTextIfExists('property_city', formData.propertyCity);
  setFieldTextIfExists('property_state', formData.propertyState);
  setFieldTextIfExists('property_zip', formData.propertyZip);
  
  // If the form should be editable or not
  if (formData.isEditable !== true) {
    try {
      form.flatten();
    } catch (error: any) {
      console.warn('Could not flatten form, it will remain editable:', error.message || 'Unknown error');
    }
  }
  
  // Save the document
  const modifiedPdfBytes = await pdfDoc.save();
  
  return Buffer.from(modifiedPdfBytes);
}

/**
 * Creates a simple PDF document with a text field for testing replacements
 * 
 * @param text The text to display in the document
 * @param title The title of the document
 * @returns Buffer containing the created PDF document
 */
export async function createSimpleReplacementDocument(
  text: string,
  title: string
): Promise<Buffer> {
  // Create a new PDF document
  const pdfDoc = await PDFDocument.create();
  
  // Add a blank page to the document
  const page = pdfDoc.addPage([600, 400]);
  
  // Get the font
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  
  // Add the title text
  page.drawText(title, {
    x: 50,
    y: 350,
    size: 20,
    font,
    color: rgb(0, 0, 0),
  });
  
  // Add the body text
  page.drawText(text, {
    x: 50,
    y: 300,
    size: 12,
    font,
    color: rgb(0, 0, 0),
  });
  
  // Get the form
  const form = pdfDoc.getForm();
  
  // Create a text field named "1"
  const textField = form.createTextField("1");
  
  // Position the text field
  textField.addToPage(page, {
    x: 50,
    y: 200,
    width: 200,
    height: 30,
  });
  
  // Set some default text in the field
  textField.setText("This is field 1 - try to replace me");
  
  // Save the document
  const pdfBytes = await pdfDoc.save();
  
  return Buffer.from(pdfBytes);
}
