/**
 * Test script for the enhanced property data normalization using Lodash
 * 
 * This tests the normalizePropertyData function to ensure it properly:
 * - Converts string values to numbers
 * - Handles null and undefined values
 * - Preserves already numeric values
 * - Deals with edge cases like empty strings, currency symbols, commas, etc.
 */

import _ from 'lodash';

// Mock PropertyAIData object for testing
function normalizePropertyData(propertyData) {
  // Create a deep clone of the object to avoid mutation
  const normalizedData = _.cloneDeep(propertyData);

  // Define fields that should be treated as numeric
  const numericFields = [
    "bedrooms",
    "bathrooms",
    "squareFeet",
    "yearBuilt",
    "price",
  ];

  // Process each numeric field
  numericFields.forEach((field) => {
    const value = _.get(normalizedData, field);
    
    // Handle empty values
    if (_.isEmpty(value) && !_.isNumber(value)) {
      _.set(normalizedData, field, null);
      return;
    }
    
    // Skip if already a number
    if (_.isNumber(value)) {
      return;
    }
    
    // Convert string values to numbers
    if (_.isString(value)) {
      let cleanedValue;
      
      // Use specific cleaning pattern based on field type
      if (field === "price" || field === "squareFeet") {
        // For monetary or measurement values, keep decimal points but remove currency symbols, commas, etc.
        cleanedValue = value.replace(/[^0-9.]/g, "");
      } else if (field === "bathrooms") {
        // Special handling for bathrooms which might be in format like "2 1/2"
        if (value.includes("/")) {
          // Handle fractions like "2 1/2" baths
          const match = value.match(/(\d+)\s*(\d+)\/(\d+)/);
          if (match) {
            const whole = parseInt(match[1]);
            const numerator = parseInt(match[2]);
            const denominator = parseInt(match[3]);
            if (denominator > 0) {
              return parseFloat(whole + (numerator / denominator));
            }
          }
        }
        // Standard decimal handling
        cleanedValue = value.replace(/[^0-9.]/g, "");
      } else {
        // For integer values like bedrooms, etc.
        cleanedValue = value.replace(/[^0-9]/g, "");
      }
      
      // Convert to number if it's a valid numeric string
      if (cleanedValue) {
        const numericValue = parseFloat(cleanedValue);
        if (!isNaN(numericValue)) {
          _.set(normalizedData, field, numericValue);
        } else {
          _.set(normalizedData, field, null);
        }
      } else {
        _.set(normalizedData, field, null);
      }
    }
  });

  return normalizedData;
}

// Test functions
function runTests() {
  console.log("Testing enhanced property data normalization with Lodash...\n");

  // Test Case 1: Strings to numbers, handling currency symbols and commas
  const test1 = {
    address: "123 Main St",
    bedrooms: "3",
    bathrooms: "2.5",
    price: "$750,000",
    squareFeet: "1,500",
    yearBuilt: "2005"
  };

  const result1 = normalizePropertyData(test1);
  console.log("Test Case 1: Converting strings to numbers");
  console.log(`Bedrooms: ${result1.bedrooms} (${typeof result1.bedrooms})`);
  console.log(`Bathrooms: ${result1.bathrooms} (${typeof result1.bathrooms})`);
  console.log(`Price: ${result1.price} (${typeof result1.price})`);
  console.log(`Square Feet: ${result1.squareFeet} (${typeof result1.squareFeet})`);
  console.log(`Year Built: ${result1.yearBuilt} (${typeof result1.yearBuilt})`);
  console.log();

  // Test Case 2: Handling empty or invalid values
  const test2 = {
    address: "456 Oak Ave",
    bedrooms: "",
    bathrooms: null,
    price: "Contact for price",
    squareFeet: "N/A",
    yearBuilt: undefined
  };

  const result2 = normalizePropertyData(test2);
  console.log("Test Case 2: Handling empty or invalid values");
  console.log(`Bedrooms: ${result2.bedrooms}`);
  console.log(`Bathrooms: ${result2.bathrooms}`);
  console.log(`Price: ${result2.price}`);
  console.log(`Square Feet: ${result2.squareFeet}`);
  console.log(`Year Built: ${result2.yearBuilt}`);
  console.log();

  // Test Case 3: Already numeric values
  const test3 = {
    address: "789 Pine St",
    bedrooms: 4,
    bathrooms: 3.5,
    price: 950000,
    squareFeet: 2200,
    yearBuilt: 2015
  };

  const result3 = normalizePropertyData(test3);
  console.log("Test Case 3: Already numeric values remain unchanged");
  console.log(`Bedrooms: ${result3.bedrooms} (${typeof result3.bedrooms})`);
  console.log(`Bathrooms: ${result3.bathrooms} (${typeof result3.bathrooms})`);
  console.log(`Price: ${result3.price} (${typeof result3.price})`);
  console.log(`Square Feet: ${result3.squareFeet} (${typeof result3.squareFeet})`);
  console.log(`Year Built: ${result3.yearBuilt} (${typeof result3.yearBuilt})`);
  console.log();

  // Test Case 4: Edge cases
  const test4 = {
    address: "101 Edge Case Ln",
    bedrooms: "Studio",
    bathrooms: "2 1/2",
    price: "Price upon request",
    squareFeet: "Approx. 1,750 sq ft",
    yearBuilt: "Built in 2010"
  };

  const result4 = normalizePropertyData(test4);
  console.log("Test Case 4: Handling edge cases and complex strings");
  console.log(`Bedrooms: ${result4.bedrooms}`);
  console.log(`Bathrooms: ${result4.bathrooms}`);
  console.log(`Price: ${result4.price}`);
  console.log(`Square Feet: ${result4.squareFeet}`);
  console.log(`Year Built: ${result4.yearBuilt}`);
  console.log();

  console.log("All tests completed!");
}

// Run tests
runTests();