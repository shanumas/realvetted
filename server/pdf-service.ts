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
  // Buyer information
  buyerName1: string;
  buyerName2?: string;
  buyerSignature1?: string;
  buyerSignature2?: string;
  buyerSignatureDate1?: string;
  buyerSignatureDate2?: string;

  // Seller information (if applicable)
  sellerName1?: string;
  sellerName2?: string;
  sellerSignature1?: string;
  sellerSignature2?: string;
  sellerSignatureDate1?: string;
  sellerSignatureDate2?: string;

  // Property information
  propertyAddress?: string;
  propertyCity?: string;
  propertyState?: string;
  propertyZip?: string;

  // Agent information
  agentName?: string;
  agentBrokerageName?: string;
  agentLicenseNumber?: string;
  agentSignature?: string;
  agentSignatureDate?: string;

  // Is this a leasehold exceeding one year?
  isLeasehold?: boolean;

  // Flag to determine if the form should be editable by the end user
  isEditable?: boolean;
}

/**
 * Creates an editable PDF form with fields that can be filled in by the user
 *
 * @param formData Initial data to pre-fill the form fields
 * @returns PDF document with editable form fields
 */
async function createEditableAgencyDisclosureForm(
  formData: AgencyDisclosureFormData,
): Promise<Buffer> {
  try {
    // Create a new PDF document
    const pdfDoc = await PDFDocument.create();

    // Add a page
    const page = pdfDoc.addPage([612, 792]); // US Letter size

    // Embed fonts
    const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    // Get the form instance
    const form = pdfDoc.getForm();

    // Add header
    page.drawText("CALIFORNIA AGENCY DISCLOSURE FORM", {
      x: 50,
      y: 750,
      size: 16,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });

    // Set up coordinates for our form content
    let y = 700;
    const lineHeight = 25;

    // Add leasehold checkbox
    page.drawText("This is for a leasehold interest exceeding one year:", {
      x: 50,
      y,
      size: 12,
      font: helveticaFont,
      color: rgb(0, 0, 0),
    });

    // Create checkbox for leasehold
    const leaseholdCheckbox = form.createCheckBox("leasehold");
    leaseholdCheckbox.addToPage(page, { x: 350, y: y - 10 });
    if (formData.isLeasehold) {
      leaseholdCheckbox.check();
    } else {
      leaseholdCheckbox.uncheck();
    }

    y -= lineHeight * 2;

    // Add buyer information section
    page.drawText("BUYER INFORMATION:", {
      x: 50,
      y,
      size: 14,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });

    y -= lineHeight;

    page.drawText("Buyer 1 Full Name:", {
      x: 50,
      y,
      size: 12,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });

    // Create a text field for buyer 1 name
    const buyerName1Field = form.createTextField("buyerName1");
    buyerName1Field.setText(formData.buyerName1 || "");
    buyerName1Field.addToPage(page, {
      x: 180,
      y: y - 15,
      width: 380,
      height: 20,
    });

    y -= lineHeight;

    page.drawText("Buyer 2 Full Name (if applicable):", {
      x: 50,
      y,
      size: 12,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });

    // Create a text field for buyer 2 name
    const buyerName2Field = form.createTextField("buyerName2");
    buyerName2Field.setText(formData.buyerName2 || "");
    buyerName2Field.addToPage(page, {
      x: 240,
      y: y - 15,
      width: 320,
      height: 20,
    });

    y -= lineHeight * 2;

    // Add property information section
    page.drawText("PROPERTY INFORMATION:", {
      x: 50,
      y,
      size: 14,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });

    y -= lineHeight;

    page.drawText("Property Address:", {
      x: 50,
      y,
      size: 12,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });

    // Create a text field for property address
    const propertyAddressField = form.createTextField("propertyAddress");
    propertyAddressField.setText(formData.propertyAddress || "");
    propertyAddressField.addToPage(page, {
      x: 170,
      y: y - 15,
      width: 390,
      height: 20,
    });

    y -= lineHeight;

    // City, state, zip fields in a row
    page.drawText("City:", {
      x: 50,
      y,
      size: 12,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });

    const cityField = form.createTextField("propertyCity");
    cityField.setText(formData.propertyCity || "");
    cityField.addToPage(page, {
      x: 80,
      y: y - 15,
      width: 150,
      height: 20,
    });

    page.drawText("State:", {
      x: 250,
      y,
      size: 12,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });

    const stateField = form.createTextField("propertyState");
    stateField.setText(formData.propertyState || "");
    stateField.addToPage(page, {
      x: 290,
      y: y - 15,
      width: 80,
      height: 20,
    });

    page.drawText("ZIP:", {
      x: 390,
      y,
      size: 12,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });

    const zipField = form.createTextField("propertyZip");
    zipField.setText(formData.propertyZip || "");
    zipField.addToPage(page, {
      x: 420,
      y: y - 15,
      width: 140,
      height: 20,
    });

    y -= lineHeight * 2;

    // Add agent information section
    page.drawText("AGENT INFORMATION:", {
      x: 50,
      y,
      size: 14,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });

    y -= lineHeight;

    page.drawText("Real Estate Agent:", {
      x: 50,
      y,
      size: 12,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });

    // Create field for agent name
    const agentNameField = form.createTextField("agentName");
    agentNameField.setText(formData.agentName || "");
    agentNameField.addToPage(page, {
      x: 160,
      y: y - 15,
      width: 400,
      height: 20,
    });

    y -= lineHeight;

    page.drawText("License #:", {
      x: 50,
      y,
      size: 12,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });

    // Create field for license number
    const licenseField = form.createTextField("agentLicenseNumber");
    licenseField.setText(formData.agentLicenseNumber || "");
    licenseField.addToPage(page, {
      x: 120,
      y: y - 15,
      width: 150,
      height: 20,
    });

    page.drawText("Brokerage:", {
      x: 290,
      y,
      size: 12,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });

    // Create field for brokerage
    const brokerageField = form.createTextField("agentBrokerageName");
    brokerageField.setText(formData.agentBrokerageName || "");
    brokerageField.addToPage(page, {
      x: 360,
      y: y - 15,
      width: 200,
      height: 20,
    });

    y -= lineHeight;

    // Add date fields
    page.drawText("Date:", {
      x: 50,
      y,
      size: 12,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });

    // Use either buyer or agent date, or current date
    const dateToShow =
      formData.buyerSignatureDate1 ||
      formData.agentSignatureDate ||
      new Date().toISOString().split("T")[0];

    // Create date field
    const dateField = form.createTextField("signatureDate");
    dateField.setText(dateToShow);
    dateField.addToPage(page, {
      x: 90,
      y: y - 15,
      width: 150,
      height: 20,
    });

    y -= lineHeight * 2;

    // Add signature section
    page.drawText("Signature Area:", {
      x: 50,
      y,
      size: 12,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });

    y -= lineHeight;

    // Add a signature box (we'll add the actual signature image separately)
    page.drawRectangle({
      x: 50,
      y: y - 100, // Height of signature box
      width: 300,
      height: 100,
      borderWidth: 1,
      borderColor: rgb(0.7, 0.7, 0.7),
      opacity: 0.3,
    });

    y -= 120; // Move below the signature box

    // Add a note about the form
    page.drawText(
      "By signing, you acknowledge that you have received and read the California Agency Disclosure Form,",
      {
        x: 50,
        y,
        size: 10,
        font: helveticaFont,
        color: rgb(0, 0, 0),
      },
    );

    y -= lineHeight * 0.7;

    page.drawText(
      "which explains the different types of agency relationships in real estate transactions.",
      {
        x: 50,
        y,
        size: 10,
        font: helveticaFont,
        color: rgb(0, 0, 0),
      },
    );

    // Add seller section if information is provided
    if (formData.sellerName1) {
      y -= lineHeight * 2;

      page.drawText("SELLER INFORMATION:", {
        x: 50,
        y,
        size: 14,
        font: helveticaBold,
        color: rgb(0, 0, 0),
      });

      y -= lineHeight;

      page.drawText("Seller 1 Full Name:", {
        x: 50,
        y,
        size: 12,
        font: helveticaBold,
        color: rgb(0, 0, 0),
      });

      // Create a text field for seller 1 name
      const sellerName1Field = form.createTextField("sellerName1");
      sellerName1Field.setText(formData.sellerName1 || "");
      sellerName1Field.addToPage(page, {
        x: 180,
        y: y - 15,
        width: 380,
        height: 20,
      });

      y -= lineHeight;

      page.drawText("Seller 2 Full Name (if applicable):", {
        x: 50,
        y,
        size: 12,
        font: helveticaBold,
        color: rgb(0, 0, 0),
      });

      // Create a text field for seller 2 name
      const sellerName2Field = form.createTextField("sellerName2");
      sellerName2Field.setText(formData.sellerName2 || "");
      sellerName2Field.addToPage(page, {
        x: 240,
        y: y - 15,
        width: 320,
        height: 20,
      });
    }

    // If we need to flatten the form (make it non-editable), we would do this:
    // form.flatten();
    // But since we want editable fields, we don't flatten

    // Save the document
    const pdfBytes = await pdfDoc.save();

    return Buffer.from(pdfBytes);
  } catch (error) {
    console.error("Error creating editable Agency Disclosure form: ", error);
    throw new Error("Failed to create editable Agency Disclosure form");
  }
}

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
      console.error("Error loading PDF for placeholder replacement:", loadError);
      
      // Create a new PDF as fallback
      console.warn("Creating a new PDF document as fallback for placeholder replacement");
      pdfDoc = await PDFDocument.create();
      pdfDoc.addPage([612, 792]); // US Letter size
    }

    // Get the first page where we'll add the text replacement
    const pages = pdfDoc.getPages();
    if (pages.length === 0) {
      // Add a page if the document doesn't have any
      pdfDoc.addPage([612, 792]); // US Letter size
    }
    
    // Get the form from the document
    const form = pdfDoc.getForm();
    
    try {
      // Try to find a text field with the placeholder ID
      form.getTextField(placeholder).setText(replacement);
      console.log(`Successfully replaced field "${placeholder}" with "${replacement}" using form fields`);
    } catch (fieldError) {
      console.warn(`No form field with ID "${placeholder}" found. Creating a new field.`, fieldError);
      
      // Get the first page
      const firstPage = pages[0];
      const pageHeight = firstPage.getHeight();
      const pageWidth = firstPage.getWidth();
      
      // Create a new text field with the placeholder as the name
      const textField = form.createTextField(placeholder);
      textField.setText(replacement);
      textField.addToPage(firstPage, {
        x: 60,
        y: pageHeight - 100,
        width: pageWidth - 120,
        height: 30,
      });
      
      // Add a label above the field
      firstPage.drawText(`Field for "${placeholder}":`, {
        x: 60,
        y: pageHeight - 70,
        size: 12,
      });
    }
    
    // Save the document
    const modifiedPdfBytes = await pdfDoc.save();
    
    return Buffer.from(modifiedPdfBytes);
  } catch (error) {
    console.error("Error replacing placeholder in PDF: ", error);
    
    // Create a very simple fallback document that just shows the replacement
    try {
      console.warn("Creating a minimal fallback document for placeholder replacement");
      const fallbackDoc = await PDFDocument.create();
      const page = fallbackDoc.addPage([612, 792]);
      const form = fallbackDoc.getForm();
      
      // Embed fonts
      const helveticaBold = await fallbackDoc.embedFont(StandardFonts.HelveticaBold);
      
      // Add a title
      const { width, height } = page.getSize();
      page.drawText("Text Replacement - Fallback Document", {
        x: 50,
        y: height - 50,
        size: 16,
        font: helveticaBold,
      });
      
      // Create a text field for the replacement
      const replacementField = form.createTextField(placeholder);
      replacementField.setText(replacement);
      replacementField.addToPage(page, {
        x: 50,
        y: height - 120,
        width: width - 100,
        height: 30,
      });
      
      // Add explanatory text
      page.drawText(`This field replaces "${placeholder}" with:`, {
        x: 50,
        y: height - 90,
        size: 12,
      });
      
      const fallbackBytes = await fallbackDoc.save();
      return Buffer.from(fallbackBytes);
    } catch (fallbackError) {
      console.error("Even fallback document creation failed:", fallbackError);
      throw new Error(`Failed to replace placeholder in PDF: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

export async function fillAgencyDisclosureForm(
  formData: AgencyDisclosureFormData,
): Promise<Buffer> {
  try {
    // Special case: If we're replacing placeholder text
    if (process.env.REPLACE_PLACEHOLDER === "true") {
      // Path to the original PDF
      const templatePath = path.join(process.cwd(), "uploads/pdf/brbc.pdf");

      // Check if the file exists
      if (!fs.existsSync(templatePath)) {
        console.error("PDF template not found at:", templatePath);
        
        // Try the alternative location in attached_assets
        const altTemplatePath = path.join(process.cwd(), "attached_assets/brbc.pdf");
        
        if (!fs.existsSync(altTemplatePath)) {
          console.error("PDF template not found at alternative location either:", altTemplatePath);
          // Instead of throwing error, just create a simple replacement document
          return await createSimpleReplacementDocument("1", "uma");
        }
        
        // If found in attached_assets, copy it to uploads/pdf
        const uploadsDir = path.join(process.cwd(), "uploads/pdf");
        
        // Create directory if it doesn't exist
        if (!fs.existsSync(uploadsDir)) {
          fs.mkdirSync(uploadsDir, { recursive: true });
        }
        
        // Copy the file
        fs.copyFileSync(altTemplatePath, templatePath);
        console.log("Copied PDF template from attached_assets to uploads/pdf");
      }

      // Read the template file
      const templateBytes = fs.readFileSync(templatePath);

      // Replace the placeholder with "uma"
      return await replacePlaceholderInPdf(templateBytes, "1", "uma");
    }

    // If isEditable flag is true, create an editable PDF form instead of static text
    if (formData.isEditable) {
      return await createEditableAgencyDisclosureForm(formData);
    }

    // Path to the template PDF - using the decrypted version as requested
    const templatePath = path.join(process.cwd(), "uploads/pdf/brbc.pdf");

    // Check if the file exists
    if (!fs.existsSync(templatePath)) {
      console.error(
        "California Agency Disclosure form template not found at:",
        templatePath,
      );
      
      // Try the alternative location in attached_assets
      const altTemplatePath = path.join(process.cwd(), "attached_assets/brbc.pdf");
      
      if (!fs.existsSync(altTemplatePath)) {
        console.error("PDF template not found at alternative location either:", altTemplatePath);
        // Fall back to creating a new PDF without a template
        return await createBlankAgencyDisclosureForm(formData);
      }
      
      // If found in attached_assets, copy it to uploads/pdf
      const uploadsDir = path.join(process.cwd(), "uploads/pdf");
      
      // Create directory if it doesn't exist
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }
      
      // Copy the file
      fs.copyFileSync(altTemplatePath, templatePath);
      console.log("Copied PDF template from attached_assets to uploads/pdf");
    }

    // Read the template file
    const templateBytes = fs.readFileSync(templatePath);

    // Try to load the PDF document with robust error handling
    let pdfDoc;
    try {
      // Load the PDF document - this is the original unmodified PDF
      // We need to handle encrypted PDFs by ignoring the encryption
      pdfDoc = await PDFDocument.load(templateBytes, {
        ignoreEncryption: true,
      });
    } catch (loadError) {
      console.error("Error loading the existing PDF template:", loadError);
      // Fall back to a blank form
      return await createBlankAgencyDisclosureForm(formData);
    }

    // Create a new page for our form data
    const page = pdfDoc.addPage([612, 792]); // US Letter size

    // Embed fonts
    const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    // Add header
    page.drawText("Agency Disclosure Form", {
      x: 50,
      y: 750,
      size: 20,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });

    // Set up coordinates for our form content
    let y = 700;
    const lineHeight = 20;

    // Add leasehold checkbox - using rectangle for compatibility with standard fonts
    if (formData.isLeasehold) {
      // Draw a filled checkbox
      page.drawRectangle({
        x: 50,
        y: y - 10,
        width: 14,
        height: 14,
        borderWidth: 1,
        borderColor: rgb(0, 0, 0),
        color: rgb(0.7, 0.7, 0.7), // Gray fill to indicate checked
      });
      // Add an X mark inside
      page.drawLine({
        start: { x: 50, y: y - 10 },
        end: { x: 64, y: y + 4 },
        thickness: 1,
        color: rgb(0, 0, 0),
      });
      page.drawLine({
        start: { x: 64, y: y - 10 },
        end: { x: 50, y: y + 4 },
        thickness: 1,
        color: rgb(0, 0, 0),
      });
    } else {
      // Draw an empty checkbox
      page.drawRectangle({
        x: 50,
        y: y - 10,
        width: 14,
        height: 14,
        borderWidth: 1,
        borderColor: rgb(0, 0, 0),
        color: rgb(1, 1, 1), // White fill (unchecked)
        opacity: 0,
      });
    }

    page.drawText("This is for a leasehold interest exceeding one year", {
      x: 70,
      y,
      size: 12,
      font: helveticaFont,
      color: rgb(0, 0, 0),
    });

    y -= lineHeight * 2;

    // Add buyer information section
    page.drawText("BUYER INFORMATION:", {
      x: 50,
      y,
      size: 14,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });

    y -= lineHeight;

    page.drawText("Your Full Name:", {
      x: 50,
      y,
      size: 12,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });

    // Draw a field for buyer name
    page.drawText(formData.buyerName1 || "", {
      x: 150,
      y,
      size: 12,
      font: helveticaFont,
      color: rgb(0, 0, 0),
    });

    y -= lineHeight * 2;

    // Add property information section
    page.drawText("PROPERTY INFORMATION:", {
      x: 50,
      y,
      size: 14,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });

    y -= lineHeight;

    page.drawText("Property Address:", {
      x: 50,
      y,
      size: 12,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });

    // Draw a field for property address
    page.drawText(formData.propertyAddress || "", {
      x: 170,
      y,
      size: 12,
      font: helveticaFont,
      color: rgb(0, 0, 0),
    });

    y -= lineHeight;

    // Draw city, state, zip in a row
    page.drawText("City:", {
      x: 50,
      y,
      size: 12,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });

    page.drawText(formData.propertyCity || "", {
      x: 80,
      y,
      size: 12,
      font: helveticaFont,
      color: rgb(0, 0, 0),
    });

    page.drawText("State:", {
      x: 250,
      y,
      size: 12,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });

    page.drawText(formData.propertyState || "", {
      x: 290,
      y,
      size: 12,
      font: helveticaFont,
      color: rgb(0, 0, 0),
    });

    page.drawText("ZIP:", {
      x: 400,
      y,
      size: 12,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });

    page.drawText(formData.propertyZip || "", {
      x: 430,
      y,
      size: 12,
      font: helveticaFont,
      color: rgb(0, 0, 0),
    });

    y -= lineHeight * 2;

    // Add agent information section
    page.drawText("AGENT INFORMATION:", {
      x: 50,
      y,
      size: 14,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });

    y -= lineHeight;

    page.drawText("Real Estate Agent:", {
      x: 50,
      y,
      size: 12,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });

    // Draw agent name and license
    page.drawText(
      `${formData.agentName || ""} - License #${formData.agentLicenseNumber || ""}`,
      {
        x: 160,
        y,
        size: 12,
        font: helveticaFont,
        color: rgb(0, 0, 0),
      },
    );

    y -= lineHeight;

    page.drawText("Brokerage:", {
      x: 50,
      y,
      size: 12,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });

    page.drawText(formData.agentBrokerageName || "", {
      x: 120,
      y,
      size: 12,
      font: helveticaFont,
      color: rgb(0, 0, 0),
    });

    y -= lineHeight;

    // Add date
    page.drawText("Date:", {
      x: 50,
      y,
      size: 12,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });

    // Use either buyer or agent date
    const dateToShow =
      formData.buyerSignatureDate1 ||
      formData.agentSignatureDate ||
      new Date().toISOString().split("T")[0];

    page.drawText(dateToShow, {
      x: 90,
      y,
      size: 12,
      font: helveticaFont,
      color: rgb(0, 0, 0),
    });

    y -= lineHeight * 3;

    // Add signature section
    page.drawText("Signature:", {
      x: 50,
      y,
      size: 12,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });

    y -= lineHeight;

    // Add a signature box (we'll add the actual signature image later)
    page.drawRectangle({
      x: 50,
      y: y - 100, // Height of signature box
      width: 300,
      height: 100,
      borderWidth: 1,
      borderColor: rgb(0.7, 0.7, 0.7),
      color: rgb(0.95, 0.95, 0.95),
      opacity: 0.3,
    });

    y -= 120; // Move below the signature box

    // Add a note about the form
    page.drawText(
      "By signing, you acknowledge that you have received and read the California Agency Disclosure Form,",
      {
        x: 50,
        y,
        size: 10,
        font: helveticaFont,
        color: rgb(0, 0, 0),
      },
    );

    y -= lineHeight;

    page.drawText(
      "which explains the different types of agency relationships in real estate transactions.",
      {
        x: 50,
        y,
        size: 10,
        font: helveticaFont,
        color: rgb(0, 0, 0),
      },
    );

    try {
      // Save the modified document
      const pdfBytes = await pdfDoc.save();
      
      // Return as Buffer
      return Buffer.from(pdfBytes);
    } catch (saveError) {
      console.error("Error saving PDF:", saveError);
      // Fall back to a blank form
      return await createBlankAgencyDisclosureForm(formData);
    }
  } catch (error) {
    console.error("Error filling Agency Disclosure form: ", error);
    // Instead of throwing an error, create a blank fallback form
    try {
      return await createBlankAgencyDisclosureForm(formData);
    } catch (fallbackError) {
      console.error("Even fallback form creation failed:", fallbackError);
      throw new Error("Failed to create any valid PDF document");
    }
  }
}

// Helper function to create a simple text replacement document
export async function createSimpleReplacementDocument(placeholder: string, replacement: string): Promise<Buffer> {
  try {
    const doc = await PDFDocument.create();
    const page = doc.addPage([612, 792]); // US Letter size
    
    // Embed fonts
    const helveticaBold = await doc.embedFont(StandardFonts.HelveticaBold);
    const helvetica = await doc.embedFont(StandardFonts.Helvetica);
    
    // Add a title
    const { width, height } = page.getSize();
    page.drawText("Text Replacement Example", {
      x: 50,
      y: height - 50,
      size: 20,
      font: helveticaBold,
    });
    
    // Show the replacement text
    page.drawText(`This document demonstrates text replacement.`, {
      x: 50, 
      y: height - 100,
      size: 14,
      font: helvetica,
    });
    
    page.drawText(`Original text: "${placeholder}"`, {
      x: 50,
      y: height - 140,
      size: 14,
      font: helvetica,
    });
    
    page.drawText(`Replaced with: "${replacement}"`, {
      x: 50,
      y: height - 170,
      size: 14,
      font: helvetica,
    });
    
    // Draw a box to highlight the replacement
    page.drawRectangle({
      x: 50,
      y: height - 220,
      width: width - 100,
      height: 40,
      borderWidth: 1,
      borderColor: rgb(0, 0, 0),
      color: rgb(0.95, 0.95, 0.95),
      opacity: 0.3,
    });
    
    page.drawText(`"${placeholder}" → "${replacement}"`, {
      x: width / 2 - 50,
      y: height - 200,
      size: 18,
      font: helveticaBold,
    });
    
    const pdfBytes = await doc.save();
    return Buffer.from(pdfBytes);
  } catch (error) {
    console.error("Error creating simple replacement document:", error);
    throw new Error("Failed to create replacement document");
  }
}

// Helper function to create a blank agency disclosure form
async function createBlankAgencyDisclosureForm(formData: AgencyDisclosureFormData): Promise<Buffer> {
  try {
    console.warn("Creating a blank agency disclosure form as fallback");
    
    // Create a new PDF document
    const doc = await PDFDocument.create();
    const page = doc.addPage([612, 792]); // US Letter size
    
    // Embed fonts
    const helveticaFont = await doc.embedFont(StandardFonts.Helvetica);
    const helveticaBold = await doc.embedFont(StandardFonts.HelveticaBold);
    
    // Add a title with warning
    const { width, height } = page.getSize();
    page.drawText("Agency Disclosure Form (Generated)", {
      x: 50,
      y: height - 50,
      size: 20,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });
    
    page.drawText("This is a fallback form created when the original template could not be loaded.", {
      x: 50,
      y: height - 80,
      size: 10,
      font: helveticaFont,
      color: rgb(0.5, 0, 0),
    });
    
    // Set up coordinates for content
    let y = height - 120;
    const lineHeight = 20;
    
    // Buyer Information
    page.drawText("BUYER:", {
      x: 50,
      y,
      size: 12,
      font: helveticaBold,
    });
    
    page.drawText(formData.buyerName1 || "Not specified", {
      x: 150,
      y,
      size: 12,
      font: helveticaFont,
    });
    
    y -= lineHeight * 2;
    
    // Property Information
    page.drawText("PROPERTY:", {
      x: 50,
      y,
      size: 12,
      font: helveticaBold,
    });
    
    page.drawText(formData.propertyAddress || "Not specified", {
      x: 150,
      y,
      size: 12,
      font: helveticaFont,
    });
    
    y -= lineHeight;
    
    if (formData.propertyCity || formData.propertyState || formData.propertyZip) {
      const location = [
        formData.propertyCity || "",
        formData.propertyState || "",
        formData.propertyZip || ""
      ].filter(Boolean).join(", ");
      
      page.drawText(location, {
        x: 150,
        y,
        size: 12,
        font: helveticaFont,
      });
    }
    
    y -= lineHeight * 2;
    
    // Agent Information
    page.drawText("AGENT:", {
      x: 50,
      y,
      size: 12,
      font: helveticaBold,
    });
    
    page.drawText(formData.agentName || "Not specified", {
      x: 150,
      y,
      size: 12,
      font: helveticaFont,
    });
    
    y -= lineHeight;
    
    if (formData.agentBrokerageName) {
      page.drawText(`Brokerage: ${formData.agentBrokerageName}`, {
        x: 150,
        y,
        size: 12,
        font: helveticaFont,
      });
      
      y -= lineHeight;
    }
    
    if (formData.agentLicenseNumber) {
      page.drawText(`License: ${formData.agentLicenseNumber}`, {
        x: 150,
        y,
        size: 12,
        font: helveticaFont,
      });
      
      y -= lineHeight;
    }
    
    y -= lineHeight;
    
    // Date
    const dateToShow = formData.buyerSignatureDate1 || 
                       formData.agentSignatureDate || 
                       new Date().toISOString().split("T")[0];
    
    page.drawText(`Date: ${dateToShow}`, {
      x: 50,
      y,
      size: 12,
      font: helveticaBold,
    });
    
    y -= lineHeight * 3;
    
    // Legal disclaimer
    page.drawText("CALIFORNIA AGENCY DISCLOSURE NOTICE", {
      x: 50,
      y,
      size: 14,
      font: helveticaBold,
    });
    
    y -= lineHeight;
    
    const disclaimer = "This form discloses the agency relationship in a real estate transaction as required by California Civil Code. " +
                       "Before you enter into a real estate transaction, you should read and understand this disclosure.";
    
    // Draw multiline text
    const words = disclaimer.split(" ");
    let line = "";
    const maxLineWidth = width - 100;
    
    for (const word of words) {
      const testLine = line ? `${line} ${word}` : word;
      const textWidth = helveticaFont.widthOfTextAtSize(testLine, 10);
      
      if (textWidth > maxLineWidth) {
        page.drawText(line, {
          x: 50,
          y,
          size: 10,
          font: helveticaFont,
        });
        
        y -= lineHeight * 0.8;
        line = word;
      } else {
        line = testLine;
      }
    }
    
    if (line) {
      page.drawText(line, {
        x: 50,
        y,
        size: 10,
        font: helveticaFont,
      });
    }
    
    // Save and return
    const pdfBytes = await doc.save();
    return Buffer.from(pdfBytes);
  } catch (error) {
    console.error("Error creating blank agency disclosure form:", error);
    throw new Error("Failed to create blank agency disclosure form");
  }
}

/**
 * Takes a filled in PDF and adds a signature image to it
 *
 * @param pdfBuffer The filled PDF buffer
 * @param signatureDataUrl The signature as a data URL
 * @param signatureType Type of signature (buyer1, buyer2, agent, seller1, seller2)
 */
export async function addSignatureToPdf(
  pdfBuffer: Buffer,
  signatureDataUrl: string,
  signatureType: "buyer1" | "buyer2" | "agent" | "seller1" | "seller2",
): Promise<Buffer> {
  try {
    // First, try to load the PDF using standard method with ignoreEncryption
    let pdfDoc;
    try {
      // Use ignoreEncryption to handle encrypted PDFs
      pdfDoc = await PDFDocument.load(pdfBuffer, {
        ignoreEncryption: true,
      });
    } catch (loadError) {
      console.error("Error loading PDF for signature (primary method):", loadError);
      
      // Second attempt with different options
      try {
        // Try with different loading options
        pdfDoc = await PDFDocument.load(pdfBuffer);
      } catch (secondLoadError) {
        console.error("Error loading PDF for signature (secondary method):", secondLoadError);
        
        // If the original PDF is corrupted, create a new PDF document
        console.warn("Creating a new PDF document as fallback for signature");
        pdfDoc = await PDFDocument.create();
        
        // Add a page to the new document
        const page = pdfDoc.addPage([612, 792]); // US Letter size
        
        // Add title and explanation
        const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
        const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
        
        page.drawText("Agency Disclosure Form - Signature Page", {
          x: 50, 
          y: 750,
          size: 18,
          font: helveticaBold,
        });
        
        page.drawText("This page contains the signature for the Agency Disclosure Form.", {
          x: 50,
          y: 720,
          size: 12,
          font: helvetica,
        });
        
        page.drawText("The original PDF could not be loaded due to file format issues.", {
          x: 50,
          y: 700,
          size: 12,
          font: helvetica,
        });
      }
    }

    // Get the last page - that's where we'll add signatures
    const pages = pdfDoc.getPages();
    if (pages.length === 0) {
      // Add a page if the document doesn't have any
      pdfDoc.addPage([612, 792]); // US Letter size
    }
    
    // Get updated pages after potentially adding a page
    const updatedPages = pdfDoc.getPages();
    const signaturePage = updatedPages[updatedPages.length - 1];

    try {
      // Validate signature data URL format
      if (!signatureDataUrl || !signatureDataUrl.startsWith('data:image/')) {
        throw new Error("Invalid signature data URL format");
      }
      
      // Convert data URL to image bytes
      const signatureBase64 = signatureDataUrl.split(",")[1];
      if (!signatureBase64) {
        throw new Error("Could not extract base64 data from signature");
      }
      
      const signatureBytes = Buffer.from(signatureBase64, "base64");

      // Embed the PNG image with error handling
      let signatureImage;
      try {
        signatureImage = await pdfDoc.embedPng(signatureBytes);
      } catch (embedError) {
        console.error("Error embedding PNG signature:", embedError);
        
        // Draw a placeholder instead
        const { width, height } = signaturePage.getSize();
        signaturePage.drawText("*SIGNATURE UNAVAILABLE*", {
          x: 50,
          y: 240,
          size: 14,
          color: rgb(0.7, 0, 0),
        });
        
        // Early return with the modified PDF
        const pdfBytesWithError = await pdfDoc.save();
        return Buffer.from(pdfBytesWithError);
      }

      // Get the dimensions of the signature
      const imgWidth = signatureImage.width;
      const imgHeight = signatureImage.height;

      // Scale down if needed
      const maxWidth = 280;
      const maxHeight = 90;
      let width = imgWidth;
      let height = imgHeight;

      if (width > maxWidth) {
        const scaleFactor = maxWidth / width;
        width = maxWidth;
        height = height * scaleFactor;
      }

      if (height > maxHeight) {
        const scaleFactor = maxHeight / height;
        height = maxHeight;
        width = width * scaleFactor;
      }

      // Determine signature position based on type
      let x = 90; // Default - inside the signature box
      let y = 240; // Default position in the signature area
      
      // Adjust position based on signature type if needed
      switch (signatureType) {
        case "buyer1":
          // Use defaults
          break;
        case "buyer2":
          y -= 40; // Place below buyer1
          break;
        case "agent":
          y -= 80; // Place below buyers
          break;
        case "seller1":
          x += 300; // Place to the right
          break;
        case "seller2":
          x += 300; // Place to the right
          y -= 40; // Place below seller1
          break;
      }

      // Draw the signature on the page
      signaturePage.drawImage(signatureImage, {
        x: x,
        y: y,
        width: width,
        height: height,
      });
      
      // Add a timestamp below the signature
      const currentDate = new Date().toISOString().split('T')[0];
      signaturePage.drawText(`Signed: ${currentDate}`, {
        x: x,
        y: y - 15,
        size: 8,
        color: rgb(0.4, 0.4, 0.4),
      });
    } catch (signatureError) {
      console.error("Error processing signature:", signatureError);
      
      // Draw error text instead of signature
      signaturePage.drawText("Error processing signature", {
        x: 90,
        y: 240,
        size: 12,
        color: rgb(0.7, 0, 0),
      });
    }

    try {
      // Save the modified PDF
      const modifiedPdfBytes = await pdfDoc.save();
      return Buffer.from(modifiedPdfBytes);
    } catch (saveError) {
      console.error("Error saving PDF with signature:", saveError);
      
      // Last resort: create a completely new minimal PDF
      const fallbackDoc = await PDFDocument.create();
      const page = fallbackDoc.addPage([612, 792]);
      
      const helveticaBold = await fallbackDoc.embedFont(StandardFonts.HelveticaBold);
      
      page.drawText("Signature Page (Error Recovery Document)", {
        x: 50,
        y: 750,
        size: 16,
        font: helveticaBold,
      });
      
      page.drawText("The original document could not be processed.", {
        x: 50,
        y: 720,
        size: 12,
      });
      
      const fallbackBytes = await fallbackDoc.save();
      return Buffer.from(fallbackBytes);
    }
  } catch (error) {
    console.error("Critical error adding signature to PDF:", error);
    // Return a document with just the signature as a fallback
    try {
      // Create a minimal document with just the signature
      const fallbackDoc = await PDFDocument.create();
      const page = fallbackDoc.addPage([612, 792]);
      
      // Add a message explaining the fallback
      const { width, height } = page.getSize();
      page.drawText("Signature Only (Fallback Document)", {
        x: 50,
        y: height - 50,
        size: 16
      });
      
      // Convert signature to image
      const signatureBase64 = signatureDataUrl.split(",")[1];
      const signatureBytes = Buffer.from(signatureBase64, "base64");
      const signatureImage = await fallbackDoc.embedPng(signatureBytes);
      
      // Draw signature centered on page
      page.drawImage(signatureImage, {
        x: (width - 300) / 2,
        y: (height - 100) / 2,
        width: 300,
        height: 100,
      });
      
      const fallbackBytes = await fallbackDoc.save();
      console.log("Generated fallback signature document");
      return Buffer.from(fallbackBytes);
    } catch (fallbackError) {
      console.error("Even fallback PDF creation failed:", fallbackError);
      throw new Error("Failed to add signature to the document");
    }
  }
}
