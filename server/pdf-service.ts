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
  // Path to the template PDF
  const templatePath = path.join(process.cwd(), 'uploads/pdf/agency_disclosure_template.pdf');
  
  // Read the template file
  const templateBytes = fs.readFileSync(templatePath);
  
  // Load the PDF document
  const pdfDoc = await PDFDocument.load(templateBytes);
  
  // Get the form
  const form = pdfDoc.getForm();
  
  // Fill in the form fields
  try {
    // Property address
    if (formData.propertyAddress) {
      const propertyAddressField = form.getTextField('propertyAddress');
      propertyAddressField.setText(formData.propertyAddress);
    }
    
    if (formData.propertyCity || formData.propertyState || formData.propertyZip) {
      const cityStateZipField = form.getTextField('propertyCity');
      const cityStateZip = [
        formData.propertyCity || '',
        formData.propertyState || '',
        formData.propertyZip || ''
      ].filter(Boolean).join(', ');
      cityStateZipField.setText(cityStateZip);
    }
    
    // Buyer names
    if (formData.buyerName1) {
      const buyerName1Field = form.getTextField('buyerName1');
      buyerName1Field.setText(formData.buyerName1);
    }
    
    if (formData.buyerName2) {
      const buyerName2Field = form.getTextField('buyerName2');
      buyerName2Field.setText(formData.buyerName2);
    }
    
    // Buyer signature dates
    if (formData.buyerSignatureDate1) {
      const date1Field = form.getTextField('buyerDate1');
      date1Field.setText(formData.buyerSignatureDate1);
    }
    
    if (formData.buyerSignatureDate2) {
      const date2Field = form.getTextField('buyerDate2');
      date2Field.setText(formData.buyerSignatureDate2);
    }
    
    // Seller names
    if (formData.sellerName1) {
      const sellerName1Field = form.getTextField('sellerName1');
      sellerName1Field.setText(formData.sellerName1);
    }
    
    if (formData.sellerName2) {
      const sellerName2Field = form.getTextField('sellerName2');
      sellerName2Field.setText(formData.sellerName2);
    }
    
    // Seller signature dates
    if (formData.sellerSignatureDate1) {
      const date1Field = form.getTextField('sellerDate1');
      date1Field.setText(formData.sellerSignatureDate1);
    }
    
    if (formData.sellerSignatureDate2) {
      const date2Field = form.getTextField('sellerDate2');
      date2Field.setText(formData.sellerSignatureDate2);
    }
    
    // Agent information
    if (formData.agentName) {
      const agentNameField = form.getTextField('agentName');
      agentNameField.setText(formData.agentName);
    }
    
    if (formData.agentBrokerageName) {
      const brokerageField = form.getTextField('brokerageName');
      brokerageField.setText(formData.agentBrokerageName);
    }
    
    if (formData.agentLicenseNumber) {
      const licenseField = form.getTextField('licenseNumber');
      licenseField.setText(formData.agentLicenseNumber);
    }
    
    if (formData.agentSignatureDate) {
      const dateField = form.getTextField('agentDate');
      dateField.setText(formData.agentSignatureDate);
    }
    
    // Handle checkboxes for leasehold
    if (formData.isLeasehold !== undefined) {
      const yesBox = form.getCheckBox('leaseholdYes');
      const noBox = form.getCheckBox('leaseholdNo');
      
      if (formData.isLeasehold) {
        yesBox.check();
        noBox.uncheck();
      } else {
        yesBox.uncheck();
        noBox.check();
      }
    }
    
    // Flatten the form (optional)
    form.flatten();
    
  } catch (error) {
    console.error('Error filling form: ', error);
    throw new Error('Failed to fill out the PDF form');
  }
  
  // Serialize the PDFDocument to bytes
  const pdfBytes = await pdfDoc.save();
  
  // Return as Buffer
  return Buffer.from(pdfBytes);
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
  
  // Define signature positions based on type
  let x = 0;
  let y = 0;
  
  switch (signatureType) {
    case 'buyer1':
      x = 150;
      y = 400;
      break;
    case 'buyer2':
      x = 150;
      y = 360;
      break;
    case 'seller1':
      x = 150;
      y = 300;
      break;
    case 'seller2':
      x = 150;
      y = 260;
      break;
    case 'agent':
      x = 150;
      y = 200;
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