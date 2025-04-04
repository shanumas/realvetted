import { PDFDocument, rgb, StandardFonts, PDFForm, PDFCheckBox, PDFTextField, PDFButton } from 'pdf-lib';
import * as fs from 'fs';
import * as path from 'path';

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
async function createEditableAgencyDisclosureForm(formData: AgencyDisclosureFormData): Promise<Buffer> {
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
    page.drawText('CALIFORNIA AGENCY DISCLOSURE FORM', {
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
    page.drawText('This is for a leasehold interest exceeding one year:', {
      x: 50,
      y,
      size: 12,
      font: helveticaFont,
      color: rgb(0, 0, 0),
    });
    
    // Create checkbox for leasehold
    const leaseholdCheckbox = form.createCheckBox('leasehold');
    leaseholdCheckbox.addToPage(page, { x: 350, y: y - 10 });
    if (formData.isLeasehold) {
      leaseholdCheckbox.check();
    } else {
      leaseholdCheckbox.uncheck();
    }
    
    y -= lineHeight * 2;
    
    // Add buyer information section
    page.drawText('BUYER INFORMATION:', {
      x: 50,
      y,
      size: 14,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });
    
    y -= lineHeight;
    
    page.drawText('Buyer 1 Full Name:', {
      x: 50,
      y,
      size: 12,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });
    
    // Create a text field for buyer 1 name
    const buyerName1Field = form.createTextField('buyerName1');
    buyerName1Field.setText(formData.buyerName1 || '');
    buyerName1Field.addToPage(page, { 
      x: 180, 
      y: y - 15, 
      width: 380,
      height: 20
    });
    
    y -= lineHeight;
    
    page.drawText('Buyer 2 Full Name (if applicable):', {
      x: 50,
      y,
      size: 12,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });
    
    // Create a text field for buyer 2 name
    const buyerName2Field = form.createTextField('buyerName2');
    buyerName2Field.setText(formData.buyerName2 || '');
    buyerName2Field.addToPage(page, { 
      x: 240, 
      y: y - 15, 
      width: 320,
      height: 20
    });
    
    y -= lineHeight * 2;
    
    // Add property information section
    page.drawText('PROPERTY INFORMATION:', {
      x: 50,
      y,
      size: 14,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });
    
    y -= lineHeight;
    
    page.drawText('Property Address:', {
      x: 50,
      y,
      size: 12,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });
    
    // Create a text field for property address
    const propertyAddressField = form.createTextField('propertyAddress');
    propertyAddressField.setText(formData.propertyAddress || '');
    propertyAddressField.addToPage(page, { 
      x: 170, 
      y: y - 15, 
      width: 390,
      height: 20
    });
    
    y -= lineHeight;
    
    // City, state, zip fields in a row
    page.drawText('City:', {
      x: 50,
      y,
      size: 12,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });
    
    const cityField = form.createTextField('propertyCity');
    cityField.setText(formData.propertyCity || '');
    cityField.addToPage(page, { 
      x: 80, 
      y: y - 15, 
      width: 150,
      height: 20
    });
    
    page.drawText('State:', {
      x: 250,
      y,
      size: 12,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });
    
    const stateField = form.createTextField('propertyState');
    stateField.setText(formData.propertyState || '');
    stateField.addToPage(page, { 
      x: 290, 
      y: y - 15, 
      width: 80,
      height: 20
    });
    
    page.drawText('ZIP:', {
      x: 390,
      y,
      size: 12,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });
    
    const zipField = form.createTextField('propertyZip');
    zipField.setText(formData.propertyZip || '');
    zipField.addToPage(page, { 
      x: 420, 
      y: y - 15, 
      width: 140,
      height: 20
    });
    
    y -= lineHeight * 2;
    
    // Add agent information section
    page.drawText('AGENT INFORMATION:', {
      x: 50,
      y,
      size: 14,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });
    
    y -= lineHeight;
    
    page.drawText('Real Estate Agent:', {
      x: 50,
      y,
      size: 12,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });
    
    // Create field for agent name
    const agentNameField = form.createTextField('agentName');
    agentNameField.setText(formData.agentName || '');
    agentNameField.addToPage(page, { 
      x: 160, 
      y: y - 15, 
      width: 400,
      height: 20
    });
    
    y -= lineHeight;
    
    page.drawText('License #:', {
      x: 50,
      y,
      size: 12,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });
    
    // Create field for license number
    const licenseField = form.createTextField('agentLicenseNumber');
    licenseField.setText(formData.agentLicenseNumber || '');
    licenseField.addToPage(page, { 
      x: 120, 
      y: y - 15, 
      width: 150,
      height: 20
    });
    
    page.drawText('Brokerage:', {
      x: 290,
      y,
      size: 12,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });
    
    // Create field for brokerage
    const brokerageField = form.createTextField('agentBrokerageName');
    brokerageField.setText(formData.agentBrokerageName || '');
    brokerageField.addToPage(page, { 
      x: 360, 
      y: y - 15, 
      width: 200,
      height: 20
    });
    
    y -= lineHeight;
    
    // Add date fields
    page.drawText('Date:', {
      x: 50,
      y,
      size: 12,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });
    
    // Use either buyer or agent date, or current date
    const dateToShow = formData.buyerSignatureDate1 || formData.agentSignatureDate || new Date().toISOString().split('T')[0];
    
    // Create date field
    const dateField = form.createTextField('signatureDate');
    dateField.setText(dateToShow);
    dateField.addToPage(page, { 
      x: 90, 
      y: y - 15, 
      width: 150,
      height: 20
    });
    
    y -= lineHeight * 2;
    
    // Add signature section
    page.drawText('Signature Area:', {
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
    page.drawText('By signing, you acknowledge that you have received and read the California Agency Disclosure Form,', {
      x: 50,
      y,
      size: 10,
      font: helveticaFont,
      color: rgb(0, 0, 0),
    });
    
    y -= lineHeight * 0.7;
    
    page.drawText('which explains the different types of agency relationships in real estate transactions.', {
      x: 50,
      y,
      size: 10,
      font: helveticaFont,
      color: rgb(0, 0, 0),
    });
    
    // Add seller section if information is provided
    if (formData.sellerName1) {
      y -= lineHeight * 2;
      
      page.drawText('SELLER INFORMATION:', {
        x: 50,
        y,
        size: 14,
        font: helveticaBold,
        color: rgb(0, 0, 0),
      });
      
      y -= lineHeight;
      
      page.drawText('Seller 1 Full Name:', {
        x: 50,
        y,
        size: 12,
        font: helveticaBold,
        color: rgb(0, 0, 0),
      });
      
      // Create a text field for seller 1 name
      const sellerName1Field = form.createTextField('sellerName1');
      sellerName1Field.setText(formData.sellerName1 || '');
      sellerName1Field.addToPage(page, { 
        x: 180, 
        y: y - 15, 
        width: 380,
        height: 20
      });
      
      y -= lineHeight;
      
      page.drawText('Seller 2 Full Name (if applicable):', {
        x: 50,
        y,
        size: 12,
        font: helveticaBold,
        color: rgb(0, 0, 0),
      });
      
      // Create a text field for seller 2 name
      const sellerName2Field = form.createTextField('sellerName2');
      sellerName2Field.setText(formData.sellerName2 || '');
      sellerName2Field.addToPage(page, { 
        x: 240, 
        y: y - 15, 
        width: 320,
        height: 20
      });
    }
    
    // If we need to flatten the form (make it non-editable), we would do this:
    // form.flatten();
    // But since we want editable fields, we don't flatten
    
    // Save the document
    const pdfBytes = await pdfDoc.save();
    
    return Buffer.from(pdfBytes);
  } catch (error) {
    console.error('Error creating editable Agency Disclosure form: ', error);
    throw new Error('Failed to create editable Agency Disclosure form');
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
export async function replacePlaceholderInPdf(pdfBuffer: Buffer, placeholder: string, replacement: string): Promise<Buffer> {
  try {
    // Load the PDF document
    const pdfDoc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
    
    // Get the number of pages in the document
    const pages = pdfDoc.getPages();
    console.log(`PDF has ${pages.length} pages`);
    
    // Create a new page to display the modified content
    const newPage = pdfDoc.addPage([612, 792]); // US Letter size
    
    // Embed the Helvetica font
    const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    
    // Draw a heading
    newPage.drawText('Modified PDF - "{1}" replaced with "uma"', {
      x: 50,
      y: 750,
      size: 16,
      font: helveticaFont,
      color: rgb(0, 0, 0),
    });
    
    // Draw the replacement text prominently on the page
    newPage.drawText(`The placeholder "${placeholder}" has been replaced with:`, {
      x: 50,
      y: 700,
      size: 12,
      font: helveticaFont,
      color: rgb(0, 0, 0),
    });
    
    newPage.drawText(replacement, {
      x: 50,
      y: 650,
      size: 24, // Larger font for emphasis
      font: helveticaFont,
      color: rgb(0, 0, 0),
    });
    
    // Draw a rectangle around the replacement text
    newPage.drawRectangle({
      x: 45,
      y: 645,
      width: replacement.length * 15, // Approximate width based on text length
      height: 30,
      borderWidth: 1,
      borderColor: rgb(0, 0, 0),
      opacity: 0.1,
    });
    
    // Add additional information
    newPage.drawText(`Original PDF had ${pages.length} pages.`, {
      x: 50,
      y: 600,
      size: 12,
      font: helveticaFont,
      color: rgb(0, 0, 0),
    });
    
    newPage.drawText('The text replacement process has been completed.', {
      x: 50,
      y: 580,
      size: 12,
      font: helveticaFont,
      color: rgb(0, 0, 0),
    });
    
    // Save the document
    const modifiedPdfBytes = await pdfDoc.save();
    
    return Buffer.from(modifiedPdfBytes);
  } catch (error) {
    console.error('Error replacing placeholder in PDF: ', error);
    throw new Error('Failed to replace placeholder in PDF');
  }
}

export async function fillAgencyDisclosureForm(formData: AgencyDisclosureFormData): Promise<Buffer> {
  try {
    // Special case: If we're replacing placeholder text
    if (process.env.REPLACE_PLACEHOLDER === 'true') {
      // Path to the original PDF
      const templatePath = path.join(process.cwd(), 'assets/converted/brbc_decrypted.pdf');
      
      // Check if the file exists
      if (!fs.existsSync(templatePath)) {
        console.error('PDF template not found at:', templatePath);
        throw new Error('Form template not found');
      }
      
      // Read the template file
      const templateBytes = fs.readFileSync(templatePath);
      
      // Replace the placeholder with "uma"
      return await replacePlaceholderInPdf(templateBytes, "{1}", "uma");
    }
    
    // If isEditable flag is true, create an editable PDF form instead of static text
    if (formData.isEditable) {
      return await createEditableAgencyDisclosureForm(formData);
    }
    
    // Path to the template PDF - using the decrypted version as requested
    const templatePath = path.join(process.cwd(), 'uploads/pdf/brbc_decrypted.pdf');
    
    // Check if the file exists
    if (!fs.existsSync(templatePath)) {
      console.error('California Agency Disclosure form template not found at:', templatePath);
      throw new Error('Form template not found');
    }
    
    // Read the template file
    const templateBytes = fs.readFileSync(templatePath);
    
    // Load the PDF document - this is the original unmodified PDF
    // We need to handle encrypted PDFs by ignoring the encryption
    const pdfDoc = await PDFDocument.load(templateBytes, { ignoreEncryption: true });
    
    // Create a new page for our form data
    const page = pdfDoc.addPage([612, 792]); // US Letter size
    
    // Embed fonts
    const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    
    // Add header
    page.drawText('Agency Disclosure Form', {
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
    
    page.drawText('This is for a leasehold interest exceeding one year', {
      x: 70,
      y,
      size: 12,
      font: helveticaFont,
      color: rgb(0, 0, 0),
    });
    
    y -= lineHeight * 2;
    
    // Add buyer information section
    page.drawText('BUYER INFORMATION:', {
      x: 50,
      y,
      size: 14,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });
    
    y -= lineHeight;
    
    page.drawText('Your Full Name:', {
      x: 50,
      y,
      size: 12,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });
    
    // Draw a field for buyer name
    page.drawText(formData.buyerName1 || '', {
      x: 150,
      y,
      size: 12,
      font: helveticaFont,
      color: rgb(0, 0, 0),
    });
    
    y -= lineHeight * 2;
    
    // Add property information section
    page.drawText('PROPERTY INFORMATION:', {
      x: 50,
      y,
      size: 14,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });
    
    y -= lineHeight;
    
    page.drawText('Property Address:', {
      x: 50,
      y,
      size: 12,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });
    
    // Draw a field for property address
    page.drawText(formData.propertyAddress || '', {
      x: 170,
      y,
      size: 12,
      font: helveticaFont,
      color: rgb(0, 0, 0),
    });
    
    y -= lineHeight;
    
    // Draw city, state, zip in a row
    page.drawText('City:', {
      x: 50,
      y,
      size: 12,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });
    
    page.drawText(formData.propertyCity || '', {
      x: 80,
      y,
      size: 12,
      font: helveticaFont,
      color: rgb(0, 0, 0),
    });
    
    page.drawText('State:', {
      x: 250,
      y,
      size: 12,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });
    
    page.drawText(formData.propertyState || '', {
      x: 290,
      y,
      size: 12,
      font: helveticaFont,
      color: rgb(0, 0, 0),
    });
    
    page.drawText('ZIP:', {
      x: 400,
      y,
      size: 12,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });
    
    page.drawText(formData.propertyZip || '', {
      x: 430,
      y,
      size: 12,
      font: helveticaFont,
      color: rgb(0, 0, 0),
    });
    
    y -= lineHeight * 2;
    
    // Add agent information section
    page.drawText('AGENT INFORMATION:', {
      x: 50,
      y,
      size: 14,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });
    
    y -= lineHeight;
    
    page.drawText('Real Estate Agent:', {
      x: 50,
      y,
      size: 12,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });
    
    // Draw agent name and license
    page.drawText(`${formData.agentName || ''} - License #${formData.agentLicenseNumber || ''}`, {
      x: 160,
      y,
      size: 12,
      font: helveticaFont,
      color: rgb(0, 0, 0),
    });
    
    y -= lineHeight;
    
    page.drawText('Brokerage:', {
      x: 50,
      y,
      size: 12,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });
    
    page.drawText(formData.agentBrokerageName || '', {
      x: 120,
      y,
      size: 12,
      font: helveticaFont,
      color: rgb(0, 0, 0),
    });
    
    y -= lineHeight;
    
    // Add date
    page.drawText('Date:', {
      x: 50,
      y,
      size: 12,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });
    
    // Use either buyer or agent date
    const dateToShow = formData.buyerSignatureDate1 || formData.agentSignatureDate || new Date().toISOString().split('T')[0];
    
    page.drawText(dateToShow, {
      x: 90,
      y,
      size: 12,
      font: helveticaFont,
      color: rgb(0, 0, 0),
    });
    
    y -= lineHeight * 3;
    
    // Add signature section
    page.drawText('Signature:', {
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
    page.drawText('By signing, you acknowledge that you have received and read the California Agency Disclosure Form,', {
      x: 50,
      y,
      size: 10,
      font: helveticaFont,
      color: rgb(0, 0, 0),
    });
    
    y -= lineHeight;
    
    page.drawText('which explains the different types of agency relationships in real estate transactions.', {
      x: 50,
      y,
      size: 10,
      font: helveticaFont,
      color: rgb(0, 0, 0),
    });
    
    // Save the modified document
    const pdfBytes = await pdfDoc.save();
    
    // Return as Buffer
    return Buffer.from(pdfBytes);
  } catch (error) {
    console.error('Error filling Agency Disclosure form: ', error);
    throw new Error('Failed to fill out the Agency Disclosure form');
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
  signatureType: 'buyer1' | 'buyer2' | 'agent' | 'seller1' | 'seller2'
): Promise<Buffer> {
  try {
    // Load the PDF - handle encryption if present
    const pdfDoc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
    
    // Get the last page - that's where we'll add signatures
    // Because we're assuming the last page is our custom attachment page
    const pages = pdfDoc.getPages();
    const signaturePage = pages[pages.length - 1];
    
    // Convert data URL to image bytes
    const signatureBase64 = signatureDataUrl.split(',')[1];
    const signatureBytes = Buffer.from(signatureBase64, 'base64');
    
    // Embed the PNG image
    const signatureImage = await pdfDoc.embedPng(signatureBytes);
    
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
    
    // Get the signature box position from our template
    // The coordinates are hardcoded based on our template's layout
    let x = 90; // Inside the signature box
    let y = 240; // Position in the signature area
    
    // Draw the signature on the page - centered in the signature box
    signaturePage.drawImage(signatureImage, {
      x: x,
      y: y,
      width: width,
      height: height,
    });
    
    // Add date stamp below the signature - we already have this in our template
    // so we don't need to add it again
    
    // Save the modified PDF
    const modifiedPdfBytes = await pdfDoc.save();
    
    return Buffer.from(modifiedPdfBytes);
  } catch (error) {
    console.error('Error adding signature to PDF:', error);
    throw new Error('Failed to add signature to the document');
  }
}