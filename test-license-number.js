// Test script for license number cleaning

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
  
  // Look for State format (e.g., S.0123456 for Nevada)
  const stateFormatMatch = licenseNo.match(/\b([A-Z]\.\d{5,})\b/i);
  if (stateFormatMatch && stateFormatMatch[1]) {
    return stateFormatMatch[1].replace('.', '');
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
  { input: "DRE #01234567", expected: "01234567" },
  { input: "CalDRE #01234567", expected: "01234567" },
  { input: "License #01234567", expected: "01234567" },
  { input: "Lic. 01234567", expected: "01234567" },
  { input: "#01234567", expected: "01234567" },
  { input: "01234567", expected: "01234567" },
  { input: "John Doe (License #01234567)", expected: "01234567" },
  { input: "John Doe, #01234567", expected: "01234567" },
  { input: "Jane Smith, CALBRE: 01234567", expected: "01234567" },
  { input: "John Doe, Lic. Number: 01234567", expected: "01234567" },
  { input: "DRE: 01234567", expected: "01234567" },
  { input: "California Real Estate License: 01234567", expected: "01234567" },
  { input: "01234567 (Active)", expected: "01234567" },
  { input: "License Number 01234567", expected: "01234567" },
  { input: "License: 01234567", expected: "01234567" },
  { input: "CA #01234567", expected: "01234567" },
  { input: "CalBRE #01234567", expected: "01234567" },
  { input: "DRE # 01234567", expected: "01234567" },
  { input: "Real Estate Broker (DRE #01234567)", expected: "01234567" },
  { input: "Broker (01234567)", expected: "01234567" },
  { input: "S.0123456", expected: "S0123456" },  // Nevada format
  { input: "Jane Smith (S.0123456)", expected: "S0123456" },
  // Add more complex test cases as needed
];

// Run tests
console.log("Testing license number cleaning:");
let passCount = 0;
let failCount = 0;

testCases.forEach((testCase, index) => {
  const result = cleanLicenseNumber(testCase.input);
  const passed = result === testCase.expected;
  
  if (passed) {
    passCount++;
    console.log(`✅ Test ${index + 1} passed: "${testCase.input}" → "${result}"`);
  } else {
    failCount++;
    console.log(`❌ Test ${index + 1} failed: "${testCase.input}" → "${result}" (expected "${testCase.expected}")`);
  }
});

console.log(`\nResults: ${passCount} passed, ${failCount} failed (${Math.round(passCount / testCases.length * 100)}% success rate)`);