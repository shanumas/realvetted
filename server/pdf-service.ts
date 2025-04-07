import {
  PDFDocument,
  rgb,
  StandardFonts,
  PDFForm,
  PDFCheckBox,
  PDFTextField,
  PDFButton,
  PDFName,
  PDFNumber,
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

export interface AgentReferralFormData {
  agentName?: string;
  licenseNumber?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  agentSignature?: string;
  date?: string;
  isEditable?: boolean;
  
  // New fields for the enhanced referral form
  brokerageName?: string;
  phoneNumber?: string;
  email?: string;
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
  formData: AgencyDisclosureFormData,
  existingPdfBuffer?: Buffer, // Add parameter for existing PDF content
): Promise<Buffer> {
  let pdfBuffer;

  // If existing PDF buffer is provided, use it instead of loading the template
  if (existingPdfBuffer) {
    console.log("Using existing PDF buffer from database");
    pdfBuffer = existingPdfBuffer;
  } else {
    // Load the template PDF
    console.log("Loading template PDF from file system");
    const templatePath = path.join(process.cwd(), "uploads", "pdf", "brbc.pdf");
    
    try {
      pdfBuffer = fs.readFileSync(templatePath);
    } catch (error) {
      console.error("Error reading agency disclosure template PDF:", error);
      throw new Error("Could not read agency disclosure template PDF");
    }
  }

  // First, try to replace placeholder "1" with "uma" as requested
  try {
    pdfBuffer = await replacePlaceholderInPdf(pdfBuffer, "1", "uma");
    console.log('Successfully applied text replacement for placeholder "1"');
  } catch (error: any) {
    console.log(
      'Text replacement for placeholder "1" failed:',
      error.message || "Unknown error",
    );
  }

  // Load the PDF document
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  const form = pdfDoc.getForm();
  
  // Handle the editable flag
  if (formData.isEditable === true) {
    console.log('Keeping form fields editable as requested');
    // For editable PDFs, we keep the form fields as is (not flattened)
  } else {
    // For non-editable PDFs, flatten the form fields
    try {
      form.flatten();
      console.log('Flattened form fields (non-editable PDF)');
    } catch (error) {
      console.warn('Could not flatten form fields:', error);
    }
  }

  // Save the document with appropriate options
  const modifiedPdfBytes = await pdfDoc.save({
    updateFieldAppearances: true // This updates the visual appearance of form fields
  });

  return Buffer.from(modifiedPdfBytes);
}

/**
 * Fills out the agent referral fee agreement with the provided data
 *
 * @param formData Data to fill into the form fields
 * @returns Buffer containing the filled PDF document
 */
export async function fillAgentReferralForm(
  formData: AgentReferralFormData,
  existingPdfBuffer?: Buffer,
): Promise<Buffer> {
  let pdfBuffer;

  // If existing PDF buffer is provided, use it
  if (existingPdfBuffer) {
    console.log("Using existing PDF buffer for agent referral agreement");
    pdfBuffer = existingPdfBuffer;
  } else {
    // Load the template PDF
    console.log("Loading agent referral agreement template from file system");
    const templatePath = path.join(process.cwd(), "uploads", "pdf", "agent_referral_agreement.pdf");
    
    try {
      pdfBuffer = fs.readFileSync(templatePath);
    } catch (error) {
      console.error("Error reading agent referral agreement template PDF:", error);
      throw new Error("Could not read agent referral agreement template PDF");
    }
  }

  // Load the PDF document
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  const form = pdfDoc.getForm();
  
  // Fill in form fields
  try {
    // Agent Name - fill in both 'agent_name' (for backward compatibility) and 'agent' (new field)
    if (formData.agentName) {
      try {
        form.getTextField('agent_name').setText(formData.agentName);
      } catch (error) {
        console.warn("Could not set agent_name field:", error);
      }
      
      try {
        form.getTextField('agent').setText(formData.agentName);
      } catch (error) {
        console.warn("Could not set agent field:", error);
      }
    }
    
    // License Number
    if (formData.licenseNumber) {
      try {
        form.getTextField('license_number').setText(formData.licenseNumber);
      } catch (error) {
        console.warn("Could not set license_number field:", error);
      }
    }
    
    // Brokerage Name
    if (formData.brokerageName) {
      try {
        form.getTextField('firm').setText(formData.brokerageName);
      } catch (error) {
        console.warn("Could not set firm field:", error);
      }
    }
    
    // Phone Number
    if (formData.phoneNumber) {
      try {
        form.getTextField('agentPhone').setText(formData.phoneNumber);
      } catch (error) {
        console.warn("Could not set agentPhone field:", error);
      }
    }
    
    // Email
    if (formData.email) {
      try {
        form.getTextField('agentEmail').setText(formData.email);
      } catch (error) {
        console.warn("Could not set agentEmail field:", error);
      }
    }
    
    // Address
    if (formData.address) {
      try {
        form.getTextField('address').setText(formData.address);
      } catch (error) {
        console.warn("Could not set address field:", error);
      }
    }
    
    // City
    if (formData.city) {
      try {
        form.getTextField('city').setText(formData.city);
      } catch (error) {
        console.warn("Could not set city field:", error);
      }
    }
    
    // State
    if (formData.state) {
      try {
        form.getTextField('state').setText(formData.state);
      } catch (error) {
        console.warn("Could not set state field:", error);
      }
    }
    
    // Zip
    if (formData.zip) {
      try {
        form.getTextField('zip').setText(formData.zip);
      } catch (error) {
        console.warn("Could not set zip field:", error);
      }
    }
    
    // Date - fill in both 'date' (for backward compatibility) and 'today' (new field)
    if (formData.date) {
      try {
        form.getTextField('date').setText(formData.date);
      } catch (error) {
        console.warn("Could not set date field:", error);
      }
      
      try {
        form.getTextField('today').setText(formData.date);
      } catch (error) {
        console.warn("Could not set today field:", error);
      }
    }
    
    // Agent Signature - if there's a signature provided, set it in the 'agentSign' field
    if (formData.agentSignature) {
      try {
        form.getTextField('agentSign').setText(formData.agentSignature);
      } catch (error) {
        console.warn("Could not set agentSign field:", error);
      }
    }
  } catch (error) {
    console.error("Error filling agent referral form fields:", error);
  }

  // Handle the editable flag
  if (formData.isEditable === true) {
    console.log('Keeping form fields editable as requested');
    // For editable PDFs, we keep the form fields as is (not flattened)
  } else {
    // For non-editable PDFs, flatten the form fields
    try {
      form.flatten();
      console.log('Flattened form fields (non-editable PDF)');
    } catch (error) {
      console.warn('Could not flatten form fields:', error);
    }
  }

  // Save the document with appropriate options
  const modifiedPdfBytes = await pdfDoc.save({
    updateFieldAppearances: true // This updates the visual appearance of form fields
  });

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
  title: string,
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
