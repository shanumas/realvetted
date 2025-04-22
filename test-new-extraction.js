// Test script for new property extraction functionality
import axios from 'axios';

// Test URL - a popular real estate listing
const testUrl = 'https://www.realtor.com/realestateandhomes-detail/1257-Fulton-St_San-Francisco_CA_94117_M13170-40455';

async function login() {
  try {
    // Login as a buyer to get authentication cookie
    const loginResponse = await axios.post('http://localhost:5000/api/auth/login', {
      email: '76@0.com',
      password: 'password'
    }, {
      withCredentials: true
    });
    
    const cookies = loginResponse.headers['set-cookie'];
    return cookies ? cookies.join('; ') : null;
  } catch (error) {
    console.error('Login failed:', error.message);
    return null;
  }
}

async function testExtraction() {
  console.log('Testing new property extraction with URL:', testUrl);
  
  try {
    // First login to get the session cookie
    const cookies = await login();
    if (!cookies) {
      throw new Error('Cannot proceed with testing without authentication');
    }
    
    console.log('Authentication successful, proceeding with property extraction test');
    
    // Now make the API call with cookies
    const response = await axios.post('http://localhost:5000/api/ai/extract-property-from-url', {
      url: testUrl
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Cookie': cookies
      }
    });
    
    console.log('Extraction successful!');
    console.log('Extracted property data:');
    console.log(JSON.stringify(response.data, null, 2));
    
    // Check if we have the crucial fields
    const data = response.data;
    console.log('\nExtraction quality check:');
    console.log('- Address:', data.address ? '✓' : '✗');
    console.log('- Price:', data.price ? '✓' : '✗');
    console.log('- Bedrooms:', data.bedrooms ? '✓' : '✗');
    console.log('- Bathrooms:', data.bathrooms ? '✓' : '✗');
    console.log('- Agent Name:', data.listingAgentName ? '✓' : '✗');
    console.log('- Agent Email:', data.listingAgentEmail ? '✓' : '✗');
    
  } catch (error) {
    console.error('Error testing property extraction:');
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Response:', error.response.data);
    } else {
      console.error(error.message);
    }
  }
}

// Run the test
testExtraction();