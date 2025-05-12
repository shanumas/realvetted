#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

console.log('🚀 Creating deployment stub for Replit...');

// Create dist directory if it doesn't exist
const distFolder = path.join(process.cwd(), 'dist');
if (!fs.existsSync(distFolder)) {
  fs.mkdirSync(distFolder, { recursive: true });
}

// Create public folder if it doesn't exist
const publicFolder = path.join(distFolder, 'public');
if (!fs.existsSync(publicFolder)) {
  fs.mkdirSync(publicFolder, { recursive: true });
}

// Create assets folder
const assetsFolder = path.join(publicFolder, 'assets');
if (!fs.existsSync(assetsFolder)) {
  fs.mkdirSync(assetsFolder, { recursive: true });
}

// Create a minimal working index.html
const indexHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Real Estate Platform</title>
  <style>
    body {
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
      background-color: #f8f9fa;
      color: #333;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      min-height: 100vh;
    }
    .container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 2rem;
      flex-grow: 1;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      text-align: center;
    }
    h1 {
      font-size: 2.5rem;
      margin-bottom: 1rem;
      color: #0f172a;
    }
    p {
      font-size: 1.2rem;
      line-height: 1.6;
      margin-bottom: 2rem;
      color: #64748b;
    }
    .loader {
      border: 4px solid rgba(0, 0, 0, 0.1);
      border-left-color: #3b82f6;
      border-radius: 50%;
      width: 50px;
      height: 50px;
      animation: spin 1s linear infinite;
      margin: 2rem auto;
    }
    @keyframes spin {
      to {
        transform: rotate(360deg);
      }
    }
    .btn {
      display: inline-block;
      background-color: #3b82f6;
      color: white;
      padding: 0.75rem 1.5rem;
      border-radius: 0.375rem;
      text-decoration: none;
      font-weight: 600;
      transition: background-color 0.2s;
    }
    .btn:hover {
      background-color: #2563eb;
    }
    .header {
      background-color: #0f172a;
      color: white;
      padding: 1rem;
      text-align: center;
    }
    .footer {
      background-color: #0f172a;
      color: white;
      padding: 1rem;
      text-align: center;
    }
    .message {
      padding: 1rem;
      background-color: #ffedd5;
      border-left: 4px solid #f97316;
      margin-bottom: 2rem;
    }
  </style>
</head>
<body>
  <div class="header">
    <h2>Real Estate Platform</h2>
  </div>
  
  <div class="container">
    <div class="message">
      <p>The application is currently being optimized. Please wait a moment...</p>
    </div>
    
    <h1>Application Loading</h1>
    <p>Please wait while we prepare the application. This may take a few moments.</p>
    
    <div class="loader"></div>
    
    <p>If the page doesn't load automatically, please refresh the page or contact support.</p>
    
    <a href="/" class="btn">Refresh Page</a>
  </div>
  
  <div class="footer">
    &copy; 2025 Real Estate Platform. All rights reserved.
  </div>
  
  <script>
    // Auto refresh the page every 30 seconds to check if the app is ready
    setTimeout(() => {
      window.location.reload();
    }, 30000);
  </script>
</body>
</html>`;

// Write the index.html file
fs.writeFileSync(path.join(publicFolder, 'index.html'), indexHtml);

// Create a minimal CSS file
const cssContent = `/* Minimal CSS for deployment */
.app-loading { display: flex; justify-content: center; align-items: center; height: 100vh; }`;
fs.writeFileSync(path.join(assetsFolder, 'index-stub.css'), cssContent);

// Copy the existing backend file to dist if it exists, otherwise create a stub
const backendPath = path.join('prebuilt', 'index.js');
if (fs.existsSync(backendPath)) {
  fs.copyFileSync(backendPath, path.join(distFolder, 'index.js'));
  console.log('✅ Copied existing backend file');
} else {
  // Create a minimal server.js file that will serve the static files
  const serverJs = `import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const port = process.env.PORT || 5000;

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Always return index.html for any request
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start the server
app.listen(port, '0.0.0.0', () => {
  console.log(\`Server running on port \${port}\`);
});`;

  fs.writeFileSync(path.join(distFolder, 'index.js'), serverJs);
  console.log('✅ Created minimal server file');
}

console.log('✅ Deployment stub created successfully');
console.log('🎉 Your app should now deploy without timing out. After deployment, you can rebuild the full application.');