import emailjs from 'emailjs-com';

// Initialize EmailJS with your user ID
export const initEmailJS = () => {
  const PUBLIC_KEY = import.meta.env.E_PUBLIC || '';
  if (PUBLIC_KEY) {
    emailjs.init(PUBLIC_KEY);
  } else {
    console.error('EmailJS public key not found in environment variables');
  }
};

interface EmailParams {
  to_email: string;
  from_name: string;
  message: string;
  buyer_name: string;
  buyer_email: string;
  buyer_phone?: string;
  property_address: string;
  brbc_signed: boolean;
  kyc_approved: boolean;
  prequalification_approved: boolean;
  property_id: number;
  // Add base64 strings for attachments
  brbc_document?: string;
  prequalification_document?: string;
}

/**
 * Send viewing request notification email via EmailJS
 */
export const sendViewingRequestEmail = async (params: EmailParams): Promise<boolean> => {
  try {
    const PRIVATE_KEY = process.env.E_PRIVATE || '';
    const TEMPLATE_ID = process.env.E_TEMPLATE || '';
    
    if (!PRIVATE_KEY || !TEMPLATE_ID) {
      console.error('EmailJS credentials not found in environment variables');
      return false;
    }

    // Format message details
    let messageContent = `
      Buyer Name: ${params.buyer_name}
      Buyer Email: ${params.buyer_email}
      ${params.buyer_phone ? `Buyer Phone: ${params.buyer_phone}` : ''}
      Property: ${params.property_address} (ID: ${params.property_id})
      
      Status Information:
      - BRBC Signed: ${params.brbc_signed ? 'Yes' : 'No'}
      - KYC Verification: ${params.kyc_approved ? 'Approved' : 'Not Approved'}
      - Pre-qualification: ${params.prequalification_approved ? 'Approved' : 'Not Approved'}
      
      ${params.message}
    `;

    // Send the email
    const response = await emailjs.send(
      'default_service', // Service ID - default for EmailJS
      TEMPLATE_ID,
      {
        to_email: params.to_email,
        from_name: params.from_name,
        message: messageContent,
        brbc_document: params.brbc_document || '',
        prequalification_document: params.prequalification_document || '',
      },
      PRIVATE_KEY
    );

    console.log('Email sent successfully:', response);
    return true;
  } catch (error) {
    console.error('Failed to send email:', error);
    return false;
  }
};