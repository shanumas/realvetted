// Simple test for license number cleaning function

function cleanLicenseNumber(licenseNo) {
  if (!licenseNo) return licenseNo;
  
  // Remove any prefix like "DRE", "DRE #", "CalDRE", etc. and keep only the numbers and letters
  return licenseNo.replace(/^(DRE\s*#?|CalDRE\s*#?|Lic\.|License|BRE\s*#?)\s*/i, "").trim();
}

// Test the function with different license number formats
const licenseTests = [
  "DRE #01234567",
  "DRE#01234567",
  "CalDRE #01234567",
  "CalDRE#01234567",
  "BRE #01234567", 
  "Lic. 01234567",
  "License 01234567",
  "01234567", // Already clean
  null, // Edge case - null
  undefined, // Edge case - undefined
  "", // Edge case - empty string
  "  DRE #01234567  " // With extra spaces
];

console.log("Testing license number cleaning function:\n");

licenseTests.forEach(license => {
  const cleaned = cleanLicenseNumber(license);
  console.log(`Original: "${license || "null/undefined"}"`);
  console.log(`Cleaned:  "${cleaned || "null/undefined"}"`);
  console.log("---");
});