import pdfParse from 'pdf-parse';
import fs from 'fs';

/**
 * A wrapper for pdf-parse that handles errors and provides fallback
 * for problematic PDF files
 * 
 * @param filePathOrBuffer Either a file path or Buffer containing the PDF data
 * @returns Extracted text from the PDF
 */
export async function extractPdfText(filePathOrBuffer: string | Buffer): Promise<string> {
  try {
    // If a file path is provided, read the file into a buffer
    let buffer: Buffer;
    if (typeof filePathOrBuffer === 'string') {
      buffer = fs.readFileSync(filePathOrBuffer);
    } else {
      buffer = filePathOrBuffer;
    }
    
    // Try to parse the PDF
    try {
      const data = await pdfParse(buffer);
      return data.text;
    } catch (pdfError) {
      console.error('PDF parsing error:', pdfError);
      
      // Fall back to basic text extraction
      const text = buffer.toString('utf-8');
      return text.replace(/[\x00-\x09\x0B\x0C\x0E-\x1F\x7F]/g, ' ')
        .substring(0, 1000);
    }
  } catch (error) {
    console.error('Error processing PDF:', error);
    return '';
  }
}