import axios from 'axios';
import * as cheerio from 'cheerio';

/**
 * Fetch agent details from the California DRE website by license number
 * @param licenseNumber The real estate license number to search for
 * @returns An object with the agent's details (name, etc.)
 */
export async function lookupCaliforniaLicense(licenseNumber: string): Promise<{
  firstName?: string;
  lastName?: string;
  fullName?: string;
  licenseNumber?: string;
  licenseType?: string;
  expirationDate?: string;
  status?: string;
}> {
  try {
    // Make the request to the California DRE website
    const response = await axios.get(
      `https://www2.dre.ca.gov/PublicASP/pplinfo.asp?License_id=${licenseNumber}`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        },
        timeout: 10000, // 10 second timeout
      }
    );

    // Parse the HTML response
    const $ = cheerio.load(response.data);
    
    // Extract the agent's name - this selector needs to be adjusted based on the actual page structure
    // Typically, the information is in tables or specific HTML elements
    let fullName = '';
    let firstName = '';
    let lastName = '';
    
    // Find the name field, usually in a table row or specific element
    // This is an example selector, will need to be adjusted based on the actual page structure
    $('table tr').each((i: number, elem: any) => {
      const rowText = $(elem).text().trim();
      if (rowText.includes('Name:')) {
        fullName = rowText.replace('Name:', '').trim();
        
        // Try to split the name into first and last
        const nameParts = fullName.split(' ');
        if (nameParts.length >= 2) {
          firstName = nameParts[0];
          lastName = nameParts.slice(1).join(' ');
        }
      }
    });

    // Extract other useful information
    let licenseType = '';
    let expirationDate = '';
    let status = '';

    $('table tr').each((i: number, elem: any) => {
      const rowText = $(elem).text().trim();
      if (rowText.includes('License Type:')) {
        licenseType = rowText.replace('License Type:', '').trim();
      }
      if (rowText.includes('Expiration Date:')) {
        expirationDate = rowText.replace('Expiration Date:', '').trim();
      }
      if (rowText.includes('License Status:')) {
        status = rowText.replace('License Status:', '').trim();
      }
    });

    return {
      firstName,
      lastName,
      fullName,
      licenseNumber,
      licenseType,
      expirationDate,
      status
    };
  } catch (error) {
    console.error('Error looking up license:', error);
    return {}; // Return empty object if there's an error
  }
}