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
    // Path to the new template PDF - using the decrypted version of brbc.pdf
    const templatePath = path.join(process.cwd(), 'uploads/pdf/brbc_decrypted.pdf');
    
    // Check if the file exists
    if (!fs.existsSync(templatePath)) {
      console.error('California Agency Disclosure form template not found at:', templatePath);
      throw new Error('Form template not found');
    }
    
    // Read the template file
    const templateBytes = fs.readFileSync(templatePath);
    
    // Load the PDF document
    const pdfDoc = await PDFDocument.load(templateBytes);
    
    // Create a new PDF document with just the first two pages from the original
    const newPdfDoc = await PDFDocument.create();
    const [page1, page2] = await newPdfDoc.copyPages(pdfDoc, [0, 1]);
    newPdfDoc.addPage(page1);
    newPdfDoc.addPage(page2);
    
    // We'll draw directly on the PDF with overlay text since the form doesn't have 
    // fillable fields or they might have different names than we expect
    
    // Get pages to write on
    const pages = newPdfDoc.getPages();
    const firstPage = pages[0];
    
    // Use a standard font
    const helveticaFont = await newPdfDoc.embedFont(StandardFonts.Helvetica);
    const helveticaBold = await newPdfDoc.embedFont(StandardFonts.HelveticaBold);
    
    // Draw leasehold checkbox (if applicable)
    if (formData.isLeasehold) {
      firstPage.drawText('✓', {
        x: 148,
        y: 767,
        size: 14,
        font: helveticaFont,
        color: rgb(0, 0, 0),
      });
    }
    
    // Draw buyer checkbox
    firstPage.drawText('✓', {
      x: 144,
      y: 464,
      size: 14,
      font: helveticaFont,
      color: rgb(0, 0, 0),
    });
    
    // Draw buyer name
    if (formData.buyerName1) {
      firstPage.drawText(formData.buyerName1, {
        x: 290,
        y: 464,
        size: 10,
        font: helveticaFont,
        color: rgb(0, 0, 0),
      });
    }
    
    // Draw buyer signature date
    if (formData.buyerSignatureDate1) {
      firstPage.drawText(formData.buyerSignatureDate1, {
        x: 728,
        y: 464,
        size: 10,
        font: helveticaFont,
        color: rgb(0, 0, 0),
      });
    }
    
    // Draw property address information (optional)
    if (formData.propertyAddress) {
      // This would be drawn as annotation at proper coordinates
      // These are just examples - you'll need to adjust coordinates
      const addressText = [
        formData.propertyAddress,
        [
          formData.propertyCity || '',
          formData.propertyState || '',
          formData.propertyZip || '',
        ].filter(Boolean).join(', '),
      ].filter(Boolean).join('\n');
      
      // We'll add this as an annotation on the side of the document
      firstPage.drawText('Property:', {
        x: 520,
        y: 720,
        size: 8,
        font: helveticaBold,
        color: rgb(0.3, 0.3, 0.3),
      });
      
      firstPage.drawText(addressText, {
        x: 520,
        y: 710,
        size: 8,
        font: helveticaFont,
        color: rgb(0.3, 0.3, 0.3),
      });
    }
    
    // Add agent information as an annotation
    if (formData.agentName) {
      // Agent data annotation
      const agentText = [
        `Agent: ${formData.agentName}`,
        `Brokerage: ${formData.agentBrokerageName || 'Coldwell Banker Grass Roots Realty'}`,
        `License: ${formData.agentLicenseNumber || '2244751'}`,
      ].join('\n');
      
      firstPage.drawText(agentText, {
        x: 520,
        y: 680,
        size: 8,
        font: helveticaFont,
        color: rgb(0.3, 0.3, 0.3),
      });
    }
    
    // Serialize the PDFDocument to bytes
    const pdfBytes = await newPdfDoc.save();
    
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
  // Load the PDF
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  
  // Get the first page (assuming signature is on first page)
  const pages = pdfDoc.getPages();
  const firstPage = pages[0];
  
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
  
  // Define signature positions based on type for the California Agency Disclosure Form
  let x = 0;
  let y = 0;
  
  switch (signatureType) {
    case 'buyer1':
      x = 220; // Position for buyer signature
      y = 464;
      break;
    case 'buyer2':
      x = 220;
      y = 444; // Second buyer signature position
      break;
    case 'seller1':
      x = 220;
      y = 424; // Seller signature position
      break;
    case 'seller2':
      x = 220;
      y = 404; // Second seller signature position
      break;
    case 'agent':
      x = 220;
      y = 380; // Agent signature position
      break;
  }
  
  // Draw the signature on the page
  firstPage.drawImage(signatureImage, {
    x: x,
    y: y,
    width: width,
    height: height,
  });
  
  // Save the modified PDF
  const modifiedPdfBytes = await pdfDoc.save();
  
  return Buffer.from(modifiedPdfBytes);
}