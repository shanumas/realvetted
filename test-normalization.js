// Simple test for the data normalization function

// Mock property data with string values
const testProperty = {
  address: "123 Main St",
  city: "San Francisco",
  state: "CA",
  zip: "94103",
  propertyType: "Single Family",
  // String values that should be converted to numbers
  bedrooms: "3",
  bathrooms: "2.5",
  squareFeet: "1,500",
  price: "$750,000",
  yearBuilt: "1985",
  // Other fields that should remain as strings
  description: "Beautiful home in a great location",
  features: ["Hardwood floors", "Updated kitchen"],
  listingAgentName: "John Smith",
  listingAgentPhone: "555-1234",
  propertyUrl: "https://example.com/property/123"
};

// Empty string fields that should be converted to null
const emptyFieldsProperty = {
  address: "123 Main St",
  bedrooms: "",
  bathrooms: "",
  squareFeet: "",
  price: "",
  yearBuilt: ""
};

// Already numeric values that should remain unchanged
const numericFieldsProperty = {
  address: "123 Main St",
  bedrooms: 4,
  bathrooms: 3.5,
  squareFeet: 2000,
  price: 850000,
  yearBuilt: 1995
};

// Mock the normalizePropertyData function from extraction.ts
function normalizePropertyData(propertyData) {
  const normalizedData = { ...propertyData };
  
  // Convert numeric fields from strings to numbers if needed
  const numericFields = ['bedrooms', 'bathrooms', 'squareFeet', 'yearBuilt', 'price'];
  
  numericFields.forEach(field => {
    // Only convert if the field exists and is a string
    if (normalizedData[field] !== undefined && normalizedData[field] !== null) {
      if (typeof normalizedData[field] === 'string') {
        // Extract only numeric characters (and decimal point for price)
        let value = normalizedData[field];
        
        // Remove non-numeric characters (except decimal point for numbers that might have decimals)
        if (field === 'price' || field === 'squareFeet') {
          // For price and square feet, keep decimal points but remove currency symbols, commas, etc.
          value = value.replace(/[^0-9.]/g, '');
        } else {
          // For other fields like bedrooms, just keep integers
          value = value.replace(/[^0-9]/g, '');
        }
        
        // Convert to number if there's a value, otherwise use null
        if (value) {
          normalizedData[field] = Number(value);
        } else {
          normalizedData[field] = null;
        }
      }
    } else {
      // Set to null if undefined or empty string
      if (normalizedData[field] === "" || normalizedData[field] === undefined) {
        normalizedData[field] = null;
      }
    }
  });
  
  return normalizedData;
}

// Run the tests
console.log("Testing property data normalization...\n");

// Test case 1: String values to numbers
console.log("Test Case 1: Convert string values to numbers");
const normalized1 = normalizePropertyData(testProperty);
console.log("Original bedrooms (string):", testProperty.bedrooms, typeof testProperty.bedrooms);
console.log("Normalized bedrooms (number):", normalized1.bedrooms, typeof normalized1.bedrooms);
console.log("Original price (string with $ and commas):", testProperty.price, typeof testProperty.price);
console.log("Normalized price (number):", normalized1.price, typeof normalized1.price);
console.log("Original squareFeet (string with commas):", testProperty.squareFeet, typeof testProperty.squareFeet);
console.log("Normalized squareFeet (number):", normalized1.squareFeet, typeof normalized1.squareFeet);

// Test case 2: Empty strings to null
console.log("\nTest Case 2: Convert empty strings to null");
const normalized2 = normalizePropertyData(emptyFieldsProperty);
console.log("Original bedrooms (empty string):", emptyFieldsProperty.bedrooms === "" ? '""' : emptyFieldsProperty.bedrooms, typeof emptyFieldsProperty.bedrooms);
console.log("Normalized bedrooms (null):", normalized2.bedrooms, typeof normalized2.bedrooms);

// Test case 3: Already numeric values
console.log("\nTest Case 3: Already numeric values remain unchanged");
const normalized3 = normalizePropertyData(numericFieldsProperty);
console.log("Original bedrooms (number):", numericFieldsProperty.bedrooms, typeof numericFieldsProperty.bedrooms);
console.log("Normalized bedrooms (number):", normalized3.bedrooms, typeof normalized3.bedrooms);
console.log("Original price (number):", numericFieldsProperty.price, typeof numericFieldsProperty.price);
console.log("Normalized price (number):", normalized3.price, typeof normalized3.price);

console.log("\nAll tests completed!");