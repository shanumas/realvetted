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
