import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Generate Agent Referral Agreement PDF template
 * This creates a fillable PDF with form fields for the agent referral agreement
 */
async function generateAgentReferralAgreementTemplate() {
  try {
    // Create a new PDF document
    const pdfDoc = await PDFDocument.create();
    
    // Add a single page
    const page = pdfDoc.addPage([612, 792]); // Letter size
    
    // Get fonts
    const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const helveticaBoldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    
    // Get the form
    const form = pdfDoc.getForm();
    
    // Set page margins
    const margin = 50;
    const width = page.getWidth() - 2 * margin;
    
    // Add title
    page.drawText('AGENT REFERRAL FEE AGREEMENT', {
      x: margin + 120,
      y: 730,
      size: 16,
      font: helveticaBoldFont,
      color: rgb(0, 0, 0),
    });
    
    // Add introduction text
    page.drawText('This Agent Referral Fee Agreement ("Agreement") is entered into between:', {
      x: margin,
      y: 680,
      size: 12,
      font: helveticaFont,
      color: rgb(0, 0, 0),
    });
    
    // Agent information section
    page.drawText('Agent Name:', {
      x: margin,
      y: 640,
      size: 12,
      font: helveticaFont,
      color: rgb(0, 0, 0),
    });
    
    // This field will be used for the agent's name (agent)
    const agentNameField = form.createTextField('agent');
    agentNameField.addToPage(page, {
      x: margin + 100,
      y: 635,
      width: 300,
      height: 20,
    });
    
    page.drawText('License Number:', {
      x: margin,
      y: 610,
      size: 12,
      font: helveticaFont,
      color: rgb(0, 0, 0),
    });
    
    const licenseNumberField = form.createTextField('license_number');
    licenseNumberField.addToPage(page, {
      x: margin + 100,
      y: 605,
      width: 300,
      height: 20,
    });
    
    // Add brokerage firm name
    page.drawText('Brokerage Firm:', {
      x: margin,
      y: 580,
      size: 12,
      font: helveticaFont,
      color: rgb(0, 0, 0),
    });
    
    // This field will be used for the brokerage firm name (firm)
    const brokerageField = form.createTextField('firm');
    brokerageField.addToPage(page, {
      x: margin + 100,
      y: 575,
      width: 300,
      height: 20,
    });
    
    // Add phone number
    page.drawText('Phone Number:', {
      x: margin,
      y: 550,
      size: 12,
      font: helveticaFont,
      color: rgb(0, 0, 0),
    });
    
    // This field will be used for the agent's phone number (agentPhone)
    const phoneField = form.createTextField('agentPhone');
    phoneField.addToPage(page, {
      x: margin + 100,
      y: 545,
      width: 150,
      height: 20,
    });
    
    // Add email
    page.drawText('Email:', {
      x: margin,
      y: 520,
      size: 12,
      font: helveticaFont,
      color: rgb(0, 0, 0),
    });
    
    // This field will be used for the agent's email (agentEmail)
    const emailField = form.createTextField('agentEmail');
    emailField.addToPage(page, {
      x: margin + 100,
      y: 515,
      width: 300,
      height: 20,
    });
    
    page.drawText('Address:', {
      x: margin,
      y: 490,
      size: 12,
      font: helveticaFont,
      color: rgb(0, 0, 0),
    });
    
    const addressField = form.createTextField('address');
    addressField.addToPage(page, {
      x: margin + 100,
      y: 485,
      width: 300,
      height: 20,
    });
    
    // City, State, Zip in one row
    page.drawText('City:', {
      x: margin,
      y: 460,
      size: 12,
      font: helveticaFont,
      color: rgb(0, 0, 0),
    });
    
    const cityField = form.createTextField('city');
    cityField.addToPage(page, {
      x: margin + 50,
      y: 455,
      width: 150,
      height: 20,
    });
    
    page.drawText('State:', {
      x: margin + 210,
      y: 460,
      size: 12,
      font: helveticaFont,
      color: rgb(0, 0, 0),
    });
    
    const stateField = form.createTextField('state');
    stateField.addToPage(page, {
      x: margin + 250,
      y: 455,
      width: 60,
      height: 20,
    });
    
    page.drawText('Zip:', {
      x: margin + 320,
      y: 460,
      size: 12,
      font: helveticaFont,
      color: rgb(0, 0, 0),
    });
    
    const zipField = form.createTextField('zip');
    zipField.addToPage(page, {
      x: margin + 350,
      y: 455,
      width: 80,
      height: 20,
    });
    
    page.drawText('And', {
      x: margin,
      y: 430,
      size: 12,
      font: helveticaFont,
      color: rgb(0, 0, 0),
    });
    
    page.drawText('Randy Brummett ("Referral Party")', {
      x: margin,
      y: 400,
      size: 12,
      font: helveticaFont,
      color: rgb(0, 0, 0),
    });
    
    // Agreement terms
    page.drawText('1. REFERRAL FEE', {
      x: margin,
      y: 440,
      size: 12,
      font: helveticaBoldFont,
      color: rgb(0, 0, 0),
    });
    
    page.drawText(
      'Agent agrees to pay Referral Party a referral fee of twenty-five percent (25%) of the Agent\'s\n' +
      'commission from any real estate transaction that results from a lead or referral provided through\n' +
      'the platform.',
      {
        x: margin,
        y: 420,
        size: 11,
        font: helveticaFont,
        color: rgb(0, 0, 0),
        lineHeight: 15,
      }
    );
    
    page.drawText('2. TERM', {
      x: margin,
      y: 370,
      size: 12,
      font: helveticaBoldFont,
      color: rgb(0, 0, 0),
    });
    
    page.drawText(
      'This Agreement shall remain in effect for all transactions that originate from leads or referrals\n' +
      'provided through the platform during the Agent\'s participation on the platform.',
      {
        x: margin,
        y: 350,
        size: 11,
        font: helveticaFont,
        color: rgb(0, 0, 0),
        lineHeight: 15,
      }
    );
    
    page.drawText('3. PAYMENT', {
      x: margin,
      y: 310,
      size: 12,
      font: helveticaBoldFont,
      color: rgb(0, 0, 0),
    });
    
    page.drawText(
      'Payment of the referral fee shall be made within fourteen (14) days of Agent\'s receipt of\n' +
      'commission from a qualifying transaction.',
      {
        x: margin,
        y: 290,
        size: 11,
        font: helveticaFont,
        color: rgb(0, 0, 0),
        lineHeight: 15,
      }
    );
    
    page.drawText('4. AGREEMENT', {
      x: margin,
      y: 250,
      size: 12,
      font: helveticaBoldFont,
      color: rgb(0, 0, 0),
    });
    
    page.drawText(
      'By signing below, Agent acknowledges acceptance of these terms and conditions.',
      {
        x: margin,
        y: 230,
        size: 11,
        font: helveticaFont,
        color: rgb(0, 0, 0),
      }
    );
    
    // Signature fields
    page.drawText('Agent Signature:', {
      x: margin,
      y: 180,
      size: 12,
      font: helveticaFont,
      color: rgb(0, 0, 0),
    });
    
    // Create signature field (both with old name for backward compatibility and new name as requested)
    const agentSignatureField = form.createTextField('agent_signature');
    agentSignatureField.addToPage(page, {
      x: margin + 120,
      y: 175,
      width: 200,
      height: 20,
    });
    
    // Create the agentSign field as requested
    const agentSignField = form.createTextField('agentSign');
    agentSignField.addToPage(page, {
      x: margin + 120,
      y: 150,
      width: 200,
      height: 20,
    });
    
    page.drawText('Date:', {
      x: margin + 330,
      y: 180,
      size: 12,
      font: helveticaFont,
      color: rgb(0, 0, 0),
    });
    
    // Today's date field
    const dateField = form.createTextField('date');
    dateField.addToPage(page, {
      x: margin + 370,
      y: 175,
      width: 100,
      height: 20,
    });
    
    // Create today field as requested
    const todayField = form.createTextField('today');
    todayField.addToPage(page, {
      x: margin + 370,
      y: 150,
      width: 100,
      height: 20,
    });
    
    // Save the PDF
    const pdfBytes = await pdfDoc.save();
    
    // Create directory if it doesn't exist
    const dirPath = path.join(process.cwd(), 'uploads', 'pdf');
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
    
    // Write to file
    const filePath = path.join(dirPath, 'agent_referral_agreement.pdf');
    fs.writeFileSync(filePath, pdfBytes);
    
    console.log(`Agent Referral Agreement PDF template created at: ${filePath}`);
    return filePath;
  } catch (error) {
    console.error('Error generating Agent Referral Agreement PDF:', error);
    throw error;
  }
}

export default generateAgentReferralAgreementTemplate;

// Run this file directly to generate the PDF template
// For ESM compatibility
generateAgentReferralAgreementTemplate()
  .then(() => console.log('PDF template generated successfully'))
  .catch(error => console.error('Failed to generate PDF template:', error));