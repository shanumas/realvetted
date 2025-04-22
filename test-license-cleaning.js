// Test the license number cleaning function
function cleanLicenseNumber(licenseNo) {
  if (!licenseNo) return licenseNo;
  
  // Look for patterns with colon that typically separate descriptive text from license numbers
  // Examples: "CALBRE: 01234567", "License: 01234567", "DRE: 01234567"
  const colonMatch = licenseNo.match(/(?::|#)\s*([A-Z0-9][\w.-]{4,})\b/i);
  if (colonMatch && colonMatch[1]) {
    return colonMatch[1];
  }
  
  // First, remove any prefix like "DRE", "DRE #", "CalDRE", etc.
  const prefixesPattern = /^(?:DRE\s*#?|CalDRE\s*#?|Lic\.\s*|License\s*#?|BRE\s*#?|CA\s*#?|CalBRE\s*#?|#)\s*/i;
  let cleaned = licenseNo.replace(prefixesPattern, "").trim();
  
  // Look for State format with letter and period (e.g., S.0123456 for Nevada)
  const stateFormatInText = licenseNo.match(/\b([A-Z]\.\d{5,})\b/i);
  if (stateFormatInText && stateFormatInText[1]) {
    return stateFormatInText[1].replace('.', '');
  }
  
  // Handle format where license number might be wrapped in parentheses
  // e.g., "John Doe (License #01234567)" or "Jane Smith (S.0123456)"
  const parenthesesMatch = cleaned.match(/\((?:[^\)]*?)(?:(?:([A-Z])\.(\d{5,}))|(?:(?:[^\d]*)(\d{5,})))(?:[^\d]*?)\)?/i);
  if (parenthesesMatch) {
    // Check for state code format (S.0123456)
    if (parenthesesMatch[1] && parenthesesMatch[2]) {
      return parenthesesMatch[1] + parenthesesMatch[2]; // Combine letter and number
    } 
    // Standard numeric format
    else if (parenthesesMatch[3]) {
      return parenthesesMatch[3];
    }
  }
  
  // If there's a comma followed by a pattern that looks like a license number, extract it
  // e.g., "John Doe, #01234567"
  const commaMatch = cleaned.match(/,\s*(?:#?\s*)([A-Z]?[\d]{5,})\b/i);
  if (commaMatch && commaMatch[1]) {
    return commaMatch[1];
  }
  
  // Plain license number without any text 
  // Avoid matching when there's extra non-numeric text
  const justNumber = /^\s*#?\s*(\d{5,}(?:-\w+)?)\s*(?:\(Active\))?$/i;
  const numberMatch = cleaned.match(justNumber);
  if (numberMatch && numberMatch[1]) {
    return numberMatch[1];
  }
  
  // Last resort for complex cases - find the first number sequence that could be a license
  const anyNumberMatch = licenseNo.match(/\b([A-Z]?\d{5,}(?:-\w+)?)\b/i);
  if (anyNumberMatch && anyNumberMatch[1]) {
    return anyNumberMatch[1];
  }
  
  // If no good pattern match, just remove non-alphanumeric chars (defensive fallback)
  cleaned = cleaned.replace(/[^A-Z0-9.-]/gi, "");
  
  // If the cleaned result is too long (likely it contains other text), 
  // find something that looks like a license number in it
  if (cleaned.length > 10) {
    const candidateMatch = cleaned.match(/([A-Z]?\d{5,}(?:-\w+)?)/i);
    if (candidateMatch && candidateMatch[1]) {
      return candidateMatch[1];
    }
  }
  
  return cleaned;
}

// Test cases
const testCases = [
  // Standard formats with explicit license indicator
  "DRE #01234567",
  "CalDRE #01234567",
  "License #01234567",
  "CA BRE# 01234567",
  "CA License #01234567",
  "License Number: 01234567",
  
  // Standard formats without explicit indicator but with clear license pattern
  "01234567",
  "#01234567",
  
  // Various state-specific formats
  "S.0123456", // Nevada format
  "S.0123456 (Active)",
  
  // Complex formats with name and license in same string
  "John Doe, License #01234567",
  "Jane Smith, DRE #01234567",
  "Bob Johnson, #01234567",
  "Alice Williams (DRE #01234567)",
  "Tom Miller (S.0123456)",
  "Susan Johnson (License #01234567)",
  
  // Complex formats with extra text
  "John Doe, Real Estate Agent, DRE #01234567",
  "Jane Smith (S.0123456) - Nevada Real Estate Agent",
  "Realtor Bob Johnson - License #01234567 - ABC Realty",
  "California Real Estate License: 01234567",
  
  // Challenging formats with parentheses and multiple text segments
  "Jane Smith (S.0123456)",
  "John Doe (License: 01234567)"
];

console.log("Testing license number cleaning function...");
console.log("=========================================");

testCases.forEach((testCase, index) => {
  const cleaned = cleanLicenseNumber(testCase);
  console.log(`Test Case ${index + 1}: "${testCase}"`);
  console.log(`Cleaned: "${cleaned}"`);
  console.log("----------------------------------------");
});