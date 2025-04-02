// Function to create a base64 string from a File
export async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const base64String = reader.result as string;
      // Extract the base64 part after the data URL prefix
      const base64 = base64String.split(',')[1];
      resolve(base64);
    };
    reader.onerror = error => reject(error);
  });
}

// Interface for extracted KYC data
export interface KYCExtractedData {
  firstName?: string;
  lastName?: string;
  dateOfBirth?: string; // In YYYY-MM-DD format
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  zip?: string;
  idNumber?: string;
  expirationDate?: string;
}

// Extract information from ID document images using OpenAI
export async function extractDataFromID(idFront: File, idBack: File): Promise<KYCExtractedData> {
  try {
    const frontBase64 = await fileToBase64(idFront);
    const backBase64 = await fileToBase64(idBack);
    
    // Call the OpenAI extraction endpoint
    const response = await fetch('/api/ai/extract-id-data', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        idFrontBase64: frontBase64,
        idBackBase64: backBase64,
      }),
      credentials: 'include'
    });
    
    if (!response.ok) {
      throw new Error('Failed to extract data from ID documents');
    }
    
    const result = await response.json();
    return result.data;
  } catch (error) {
    console.error('Error extracting data from ID documents:', error);
    // Return empty object rather than throwing, so form can still be filled manually
    return {};
  }
}

// Upload ID documents for KYC verification
export async function uploadIDDocuments(idFront: File, idBack: File): Promise<{idFrontUrl: string, idBackUrl: string}> {
  try {
    const formData = new FormData();
    formData.append('idFront', idFront);
    formData.append('idBack', idBack);
    
    const response = await fetch('/api/uploads/id-documents', {
      method: 'POST',
      body: formData,
      credentials: 'include'
    });
    
    if (!response.ok) {
      throw new Error('Failed to upload documents');
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error uploading ID documents:', error);
    throw error;
  }
}
