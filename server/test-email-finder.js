// Test script for email finding function
// This directly tests the agent email finder functionality
import axios from 'axios';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Simple function to find agent email
async function findAgentEmail(agentName, agentCompany, listingAgentPhone, listingAgentLicenseNo) {
  try {
    console.log(
      "Finding agent email using SerpAPI for:",
      agentName,
      agentCompany,
      listingAgentPhone,
      listingAgentLicenseNo
    );
    
    // Craft a specific search query to find the agent's email
    const searchQuery = `${agentName} ${agentCompany} ${listingAgentPhone || ''} ${listingAgentLicenseNo || ''} real estate agent email contact`;
    console.log("Search query:", searchQuery);

    // Make the SerpAPI request
    const response = await axios.get("https://serpapi.com/search.json", {
      params: {
        engine: "google",
        q: searchQuery,
        api_key: process.env.SERPAPI_KEY,
        num: 10, // Increase number of results for better chances
      },
    });

    console.log("SerpAPI response received");
    
    // Extract and log the relevant information from the search results
    const organicResults = response.data.organic_results || [];
    console.log(`Found ${organicResults.length} organic results`);
    
    // Log detailed information about each result
    organicResults.forEach((result, index) => {
      console.log(`\nResult #${index + 1}:`);
      console.log(`Title: ${result.title || 'N/A'}`);
      console.log(`Link: ${result.link || 'N/A'}`);
      console.log(`Snippet: ${result.snippet || 'N/A'}`);
    });
    
    // Combine all snippets for email extraction
    const allText = organicResults
      .map(r => `${r.title || ''} ${r.snippet || ''}`)
      .join(" ");
    
    console.log("\nSearching for emails in combined text...");
    
    // Use a regex pattern to find email addresses in the text
    const emailPattern = /[\w.+-]+@[\w.-]+\.\w+/g;
    const emailMatches = allText.match(emailPattern) || [];
    
    console.log("Emails found:", emailMatches);
    
    // Return the first found email, or empty string if none found
    return emailMatches.length > 0 ? emailMatches[0] : "";
  } catch (error) {
    console.error("Agent email search failed:", error.message);
    console.error("Stack trace:", error.stack);
    return ""; // Return empty string on error
  }
}

// Test the function with some sample data
async function runTest() {
  console.log("Starting agent email finder test");
  
  // Example data for a real estate agent
  const testCases = [
    {
      name: "Test Case 1",
      agentName: "John Smith",
      agentCompany: "Keller Williams",
      agentPhone: "415-555-1234",
      agentLicense: "01234567"
    },
    {
      name: "Test Case 2",
      agentName: "Jennifer Wong",
      agentCompany: "Compass",
      agentPhone: "628-555-9876",
      agentLicense: "DRE 02121234"
    }
  ];
  
  for (const test of testCases) {
    console.log(`\n--- Running ${test.name} ---`);
    const email = await findAgentEmail(
      test.agentName,
      test.agentCompany,
      test.agentPhone,
      test.agentLicense
    );
    
    console.log(`\nResult for ${test.name}:`);
    console.log(`Agent: ${test.agentName}, ${test.agentCompany}`);
    console.log(`Email found: ${email || 'No email found'}`);
    console.log("-----------------------------------");
  }
}

// Run the test
runTest().catch(error => {
  console.error("Test failed:", error);
});