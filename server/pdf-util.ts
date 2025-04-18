import fs from 'fs';

/**
 * Extract text content from a file (PDF or other text-based file)
 * Uses a simple approach that works with basic text-based files
 * 
 * @param filePath Path to the file
 * @returns Extracted text content (limited to first 1000 characters)
 */
export async function extractTextFromPdf(filePath: string): Promise<string> {
  try {
    // First, check if file exists
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }
    
    // Read the file buffer
    const fileBuffer = fs.readFileSync(filePath);
    
    // Check if it's a PDF by looking at the magic number (%PDF-)
    const isPdf = fileBuffer.slice(0, 5).toString('ascii') === '%PDF-';
    
    // Try to extract some text content from the file
    let extractedText = '';
    try {
      // For any file (PDF or not), try to extract readable text
      const rawText = fileBuffer.toString('utf8');
      
      // If it's a PDF, we may only get partial text, but it's better than nothing
      if (isPdf) {
        console.log('File is PDF, using basic text extraction');
      } else {
        console.log('File is not a PDF, reading as text');
      }
      
      // Clean up the text: remove null bytes and other non-printable characters
      extractedText = rawText.replace(/[\x00-\x09\x0B\x0C\x0E-\x1F\x7F]/g, ' ');
      
      // Calculate the percentage of readable text (helps for diagnostics)
      const readableChars = extractedText.replace(/[^\x20-\x7E]/g, '').length;
      const ratio = readableChars / extractedText.length;
      console.log(`Text extraction: ${Math.round(ratio * 100)}% readable characters`);
      
      // If we couldn't extract much readable text, provide a helpful message
      if (ratio < 0.1 && extractedText.length > 100) {
        console.log('Low readable text ratio, file might be binary or encoded');
        return 'This document appears to be in a binary or encoded format and cannot be read as text. Please upload a text-based document.';
      }
      
      // Limit to first 1000 characters as per requirements
      return extractedText.substring(0, 1000);
    } catch (textError) {
      console.error("Error extracting text:", textError);
      
      // If text extraction fails, return an informative message
      if (isPdf) {
        return 'Unable to extract text from this PDF file. The file may be scanned, encrypted, or contain only images.';
      } else {
        return 'Unable to read this file as text. Please upload a text-based document.';
      }
    }
  } catch (error) {
    console.error("File extraction error:", error);
    throw error;
  }
}