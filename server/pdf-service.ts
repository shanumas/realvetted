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
 * Fills in the California Agency Disclosure form with provided data
 *
 * @param formData Data to fill in the form
 * @returns The filled PDF as a Buffer
 */
export async function fillAgencyDisclosureForm(formData: AgencyDisclosureFormData): Promise<Buffer> {
  try {
    // Read the PDF template
    const templatePath = path.join(process.cwd(), 'uploads', 'pdf', 'brbc.pdf');
    const templateBuffer = fs.readFileSync(templatePath);
    
    // Load the PDF document
    const pdfDoc = await PDFDocument.load(templateBuffer, {
      ignoreEncryption: true,
    });
    
    // Get the form from the document
    const form = pdfDoc.getForm();
    
    // Create a new form field with ID "1" if it doesn't exist
    try {
      // Try to get the existing field first
      form.getTextField("1");
    } catch (fieldError) {
      console.log("Field '1' doesn't exist, creating a sample field with text placeholder");
      
      // Create a page for demonstration purposes
      const pages = pdfDoc.getPages();
      const firstPage = pages[0];
      const { width, height } = firstPage.getSize();
      
      // Add text directly to the page since we can't create form fields dynamically
      firstPage.drawText("Field 1: uma", {
        x: 50,
        y: height - 50,
        size: 12,
        color: rgb(0, 0, 0),
      });
    }
    
    // Check if we can replace the field "1" with "uma" (if it exists)
    try {
      form.getTextField("1").setText("uma");
      console.log("Successfully replaced field '1' with 'uma'");
    } catch (fieldError) {
      console.warn("Could not find field '1' to replace with 'uma' through form fields");
    }
    
    // Now fill the rest of the fields
    // Property information
    if (formData.propertyAddress) {
      try { form.getTextField("property_address").setText(formData.propertyAddress); } catch (e) {}
    }
    if (formData.propertyCity) {
      try { form.getTextField("property_city").setText(formData.propertyCity); } catch (e) {}
    }
    if (formData.propertyState) {
      try { form.getTextField("property_state").setText(formData.propertyState); } catch (e) {}
    }
    if (formData.propertyZip) {
      try { form.getTextField("property_zip").setText(formData.propertyZip); } catch (e) {}
    }
    
    // Buyer information
    if (formData.buyerName1) {
      try { form.getTextField("buyer_name_1").setText(formData.buyerName1); } catch (e) {}
    }
    if (formData.buyerName2) {
      try { form.getTextField("buyer_name_2").setText(formData.buyerName2); } catch (e) {}
    }
    if (formData.buyerSignatureDate1) {
      try { form.getTextField("buyer_date_1").setText(formData.buyerSignatureDate1); } catch (e) {}
    }
    if (formData.buyerSignatureDate2) {
      try { form.getTextField("buyer_date_2").setText(formData.buyerSignatureDate2); } catch (e) {}
    }
    
    // Seller information
    if (formData.sellerName1) {
      try { form.getTextField("seller_name_1").setText(formData.sellerName1); } catch (e) {}
    }
    if (formData.sellerName2) {
      try { form.getTextField("seller_name_2").setText(formData.sellerName2); } catch (e) {}
    }
    if (formData.sellerSignatureDate1) {
      try { form.getTextField("seller_date_1").setText(formData.sellerSignatureDate1); } catch (e) {}
    }
    if (formData.sellerSignatureDate2) {
      try { form.getTextField("seller_date_2").setText(formData.sellerSignatureDate2); } catch (e) {}
    }
    
    // Agent information
    if (formData.agentName) {
      try { form.getTextField("agent_name").setText(formData.agentName); } catch (e) {}
    }
    if (formData.agentBrokerageName) {
      try { form.getTextField("agent_brokerage").setText(formData.agentBrokerageName); } catch (e) {}
    }
    if (formData.agentLicenseNumber) {
      try { form.getTextField("agent_license").setText(formData.agentLicenseNumber); } catch (e) {}
    }
    if (formData.agentSignatureDate) {
      try { form.getTextField("agent_date").setText(formData.agentSignatureDate); } catch (e) {}
    }
    
    // If not editable, flatten the form (lock it from further editing)
    if (!formData.isEditable) {
      form.flatten();
    }
    
    // Save the document
    const pdfBytes = await pdfDoc.save();
    
    return Buffer.from(pdfBytes);
  } catch (error) {
    console.error("Error filling agency disclosure form:", error);
    throw error;
  }
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
  signatureField: 'buyer1' | 'buyer2' | 'seller1' | 'seller2' | 'agent'
): Promise<Buffer> {
  try {
    // Load the PDF document
    const pdfDoc = await PDFDocument.load(pdfBuffer);
    
    // Remove the data URL prefix if present
    let imageData = signatureData;
    if (imageData.startsWith('data:image/png;base64,')) {
      imageData = imageData.substring('data:image/png;base64,'.length);
    }
    
    // Convert base64 signature to Buffer
    const signatureBuffer = Buffer.from(imageData, 'base64');
    
    // Embed the signature image
    const signatureImage = await pdfDoc.embedPng(signatureBuffer);
    
    // Get the signature field name based on the signatureField parameter
    let fieldName = '';
    switch (signatureField) {
      case 'buyer1':
        fieldName = 'buyer_signature_1';
        break;
      case 'buyer2':
        fieldName = 'buyer_signature_2';
        break;
      case 'seller1':
        fieldName = 'seller_signature_1';
        break;
      case 'seller2':
        fieldName = 'seller_signature_2';
        break;
      case 'agent':
        fieldName = 'agent_signature';
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
      let x = 100, y = 100, width = 150, height = 50;
      
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
          console.warn('Could not get signature field bounds, using default position');
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
      signatureTextField.setText('');
      
      // Try to flatten the field if the method exists
      try {
        (signatureTextField as any).flatten();
      } catch (e) {
        console.warn('Could not flatten text field, but image was drawn');
      }
    } catch (fieldError) {
      console.warn(`Signature field ${fieldName} not found. Using default placement.`);
      // If field not found, add signature in a default position
      const { width, height } = firstPage.getSize();
      const sigWidth = 150;
      const sigHeight = 50;
      let sigX = 100;
      let sigY = 100;
      
      // Adjust position based on signature type
      switch (signatureField) {
        case 'buyer1':
          sigX = width * 0.2;
          sigY = height * 0.3;
          break;
        case 'buyer2':
          sigX = width * 0.2;
          sigY = height * 0.25;
          break;
        case 'seller1':
          sigX = width * 0.6;
          sigY = height * 0.3;
          break;
        case 'seller2':
          sigX = width * 0.6;
          sigY = height * 0.25;
          break;
        case 'agent':
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
 * Creates a simple document with replacement text
 * 
 * @param text The text to include in the document
 * @param title Optional title for the document
 * @returns Buffer containing the PDF
 */
export async function createSimpleReplacementDocument(text: string, title?: string): Promise<Buffer> {
  try {
    // Create a new PDF document
    const pdfDoc = await PDFDocument.create();
    
    // Add a page
    const page = pdfDoc.addPage();
    
    // Get the font
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    
    // Get the page dimensions
    const { width, height } = page.getSize();
    
    // Add the title
    const documentTitle = title || 'Document';
    page.drawText(documentTitle, {
      x: 50,
      y: height - 50,
      size: 16,
      font: boldFont,
      color: rgb(0, 0, 0),
    });
    
    // Add the text
    page.drawText(text, {
      x: 50,
      y: height - 100,
      size: 12,
      font: font,
      color: rgb(0, 0, 0),
      maxWidth: width - 100,
      lineHeight: 16,
    });
    
    // Create a form with a text field with ID "1"
    const form = pdfDoc.getForm();
    
    // Create a text field named "1"
    const textField = form.createTextField('1');
    
    // Set the position and appearance of the field
    textField.addToPage(page, {
      x: 50,
      y: height - 200,
      width: 200,
      height: 30,
      borderWidth: 1,
      borderColor: rgb(0, 0, 0),
    });
    
    // Set initial value for demonstration
    textField.setText('Replace this with "uma"');
    
    // Save the document
    const pdfBytes = await pdfDoc.save();
    
    return Buffer.from(pdfBytes);
  } catch (error) {
    console.error('Error creating simple replacement document:', error);
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
