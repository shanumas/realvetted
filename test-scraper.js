import fetch from 'node-fetch';

const testPropertyUrl = 'https://www.zillow.com/homedetails/1257-Fulton-St-San-Francisco-CA-94117/2082658425_zpid/';
const testEmail = '76@0.com';     // Test user email from the logs
const testPassword = 'password';  // Assuming a simple test password

async function login() {
  console.log('Logging in with test account...');
  
  try {
    const loginResponse = await fetch('http://localhost:5000/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        email: testEmail, 
        password: testPassword 
      }),
      credentials: 'include'
    });
    
    if (!loginResponse.ok) {
      throw new Error(`Login failed! status: ${loginResponse.status}`);
    }
    
    const cookies = loginResponse.headers.get('set-cookie');
    console.log('Login successful!');
    return cookies;
  } catch (error) {
    console.error('Login error:', error);
    return null;
  }
}

async function testScraper() {
  console.log('Testing property extraction from URL:', testPropertyUrl);
  
  try {
    // First login to get the session cookie
    const cookies = await login();
    if (!cookies) {
      throw new Error('Cannot proceed with testing without authentication');
    }
    
    // Now make the API call with cookies
    const response = await fetch('http://localhost:5000/api/ai/extract-property-from-url', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': cookies
      },
      body: JSON.stringify({ url: testPropertyUrl }),
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    console.log('Extraction successful!');
    console.log('Extracted property data:', JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Error testing property extraction:', error);
  }
}

testScraper();