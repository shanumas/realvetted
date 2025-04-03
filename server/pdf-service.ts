import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
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
}

/**
 * Fills in the California Agency Disclosure form with provided data
 * 
 * @param formData Data to fill in the form
 * @returns The filled PDF as a Buffer
 */
export async function fillAgencyDisclosureForm(formData: AgencyDisclosureFormData): Promise<Buffer> {
  try {
    // Path to the original PDF template
    const templatePath = path.join(process.cwd(), 'uploads/pdf/brbc.pdf');
    
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
    
    // Get the form fields to check what's available
    const form = pdfDoc.getForm();
    
    // Now we can create a custom overlay on a separate page
    // that we'll attach at the end with property and agent information
    
    // Create a new page for our overlay information
    const page = pdfDoc.addPage([612, 792]); // US Letter size
    
    // Embed fonts
    const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    
    // Add a header to the new page
    page.drawText('ADDITIONAL PROPERTY & AGENT INFORMATION', {
      x: 50,
      y: 700,
      size: 14,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });
    
    // Set up coordinates for our content
    let y = 650;
    const lineHeight = 20;
    
    // Add property information
    if (formData.propertyAddress) {
      page.drawText('PROPERTY INFORMATION:', {
        x: 50,
        y,
        size: 12,
        font: helveticaBold,
        color: rgb(0, 0, 0),
      });
      
      y -= lineHeight;
      
      page.drawText(`Address: ${formData.propertyAddress}`, {
        x: 50,
        y,
        size: 11,
        font: helveticaFont,
        color: rgb(0, 0, 0),
      });
      
      y -= lineHeight;
      
      const cityStateZip = [
        formData.propertyCity || '',
        formData.propertyState || '',
        formData.propertyZip || ''
      ].filter(Boolean).join(', ');
      
      if (cityStateZip) {
        page.drawText(`City, State, ZIP: ${cityStateZip}`, {
          x: 50,
          y,
          size: 11,
          font: helveticaFont,
          color: rgb(0, 0, 0),
        });
        
        y -= lineHeight;
      }
    }
    
    // Add spacing
    y -= lineHeight;
    
    // Add agent information
    if (formData.agentName) {
      page.drawText('AGENT INFORMATION:', {
        x: 50,
        y,
        size: 12,
        font: helveticaBold,
        color: rgb(0, 0, 0),
      });
      
      y -= lineHeight;
      
      page.drawText(`Agent Name: ${formData.agentName}`, {
        x: 50,
        y,
        size: 11,
        font: helveticaFont,
        color: rgb(0, 0, 0),
      });
      
      y -= lineHeight;
      
      if (formData.agentBrokerageName) {
        page.drawText(`Brokerage: ${formData.agentBrokerageName}`, {
          x: 50,
          y,
          size: 11,
          font: helveticaFont,
          color: rgb(0, 0, 0),
        });
        
        y -= lineHeight;
      }
      
      if (formData.agentLicenseNumber) {
        page.drawText(`License Number: ${formData.agentLicenseNumber}`, {
          x: 50,
          y,
          size: 11,
          font: helveticaFont,
          color: rgb(0, 0, 0),
        });
        
        y -= lineHeight;
      }
    }
    
    // Add a note about buyer signature
    y -= lineHeight * 2;
    
    page.drawText('SIGNATURE INFORMATION:', {
      x: 50,
      y,
      size: 12,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });
    
    y -= lineHeight;
    
    // Add buyer information
    if (formData.buyerName1) {
      page.drawText(`Buyer Name: ${formData.buyerName1}`, {
        x: 50,
        y,
        size: 11,
        font: helveticaFont,
        color: rgb(0, 0, 0),
      });
      
      y -= lineHeight;
    }
    
    if (formData.buyerName2) {
      page.drawText(`Buyer 2 Name: ${formData.buyerName2}`, {
        x: 50,
        y,
        size: 11,
        font: helveticaFont,
        color: rgb(0, 0, 0),
      });
      
      y -= lineHeight;
    }
    
    if (formData.buyerSignatureDate1) {
      page.drawText(`Date: ${formData.buyerSignatureDate1}`, {
        x: 50,
        y,
        size: 11,
        font: helveticaFont,
        color: rgb(0, 0, 0),
      });
      
      y -= lineHeight;
    }
    
    // Add a note about the attachment
    y -= lineHeight * 2;
    
    page.drawText('Note: This is an attachment to the California Agency Disclosure Form (BRBC). The information', {
      x: 50,
      y,
      size: 10,
      font: helveticaFont,
      color: rgb(0, 0, 0),
    });
    
    y -= lineHeight;
    
    page.drawText('provided here supplements the main form and should be kept together with it.', {
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
    const maxWidth = 150;
    const maxHeight = 50;
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
    
    // Define signature positions for our attachment page
    let x = 250;
    let y = 0;
    
    switch (signatureType) {
      case 'buyer1':
        // Positioning for the custom last page
        y = 430; // Position for first buyer signature
        signaturePage.drawText('Buyer 1 Signature:', {
          x: 50,
          y: y + 15,
          size: 11,
          font: await pdfDoc.embedFont(StandardFonts.HelveticaBold),
          color: rgb(0, 0, 0),
        });
        break;
      case 'buyer2':
        y = 380; // Position for second buyer signature
        signaturePage.drawText('Buyer 2 Signature:', {
          x: 50,
          y: y + 15,
          size: 11,
          font: await pdfDoc.embedFont(StandardFonts.HelveticaBold),
          color: rgb(0, 0, 0),
        });
        break;
      case 'seller1':
        y = 330; // Position for first seller signature
        signaturePage.drawText('Seller 1 Signature:', {
          x: 50,
          y: y + 15,
          size: 11,
          font: await pdfDoc.embedFont(StandardFonts.HelveticaBold),
          color: rgb(0, 0, 0),
        });
        break;
      case 'seller2':
        y = 280; // Position for second seller signature
        signaturePage.drawText('Seller 2 Signature:', {
          x: 50,
          y: y + 15,
          size: 11,
          font: await pdfDoc.embedFont(StandardFonts.HelveticaBold),
          color: rgb(0, 0, 0),
        });
        break;
      case 'agent':
        y = 230; // Position for agent signature
        signaturePage.drawText('Agent Signature:', {
          x: 50,
          y: y + 15,
          size: 11,
          font: await pdfDoc.embedFont(StandardFonts.HelveticaBold),
          color: rgb(0, 0, 0),
        });
        break;
    }
    
    // Draw the signature on the page
    signaturePage.drawImage(signatureImage, {
      x: x,
      y: y,
      width: width,
      height: height,
    });
    
    // Add date stamp next to signature
    const today = new Date();
    const formattedDate = `${today.getMonth() + 1}/${today.getDate()}/${today.getFullYear()}`;
    
    signaturePage.drawText(`Date: ${formattedDate}`, {
      x: x + width + 20, // Position to the right of signature
      y: y + height / 2 - 5, // Center aligned with signature
      size: 10,
      font: await pdfDoc.embedFont(StandardFonts.Helvetica),
      color: rgb(0, 0, 0),
    });
    
    // Save the modified PDF
    const modifiedPdfBytes = await pdfDoc.save();
    
    return Buffer.from(modifiedPdfBytes);
  } catch (error) {
    console.error('Error adding signature to PDF:', error);
    throw new Error('Failed to add signature to the document');
  }
}