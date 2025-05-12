#!/usr/bin/env node
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

console.log('🔍 Verifying deployment build...');

const distFolder = path.join(process.cwd(), 'dist');
const publicFolder = path.join(distFolder, 'public');

// Check if dist directory exists
if (!fs.existsSync(distFolder)) {
  console.error('❌ Dist folder does not exist! Run node deployment-fix.js to create it.');
  process.exit(1);
}

// Check if backend file exists
if (!fs.existsSync(path.join(distFolder, 'index.js'))) {
  console.error('❌ Backend bundle does not exist! Run node build-backend.js to create it.');
  process.exit(1);
}

// Check if public folder exists
if (!fs.existsSync(publicFolder)) {
  console.error('❌ Public folder does not exist! Run node deployment-fix.js to create it.');
  process.exit(1);
}

// Check if index.html exists
if (!fs.existsSync(path.join(publicFolder, 'index.html'))) {
  console.error('❌ index.html does not exist! Run node deployment-fix.js to create it.');
  process.exit(1);
}

console.log('✅ Basic deployment structure verified');
console.log('');
console.log('Deployment files:');
console.log('- Backend: ' + path.join(distFolder, 'index.js') + ' (' + (fs.statSync(path.join(distFolder, 'index.js')).size / 1024).toFixed(2) + ' KB)');
console.log('- Frontend: ' + path.join(publicFolder, 'index.html') + ' (' + (fs.statSync(path.join(publicFolder, 'index.html')).size / 1024).toFixed(2) + ' KB)');

// Check assets directory
const assetsDir = path.join(publicFolder, 'assets');
if (fs.existsSync(assetsDir)) {
  const assetFiles = fs.readdirSync(assetsDir);
  console.log('- Assets: ' + assetsDir + ' (' + assetFiles.length + ' files)');
}

console.log('');
console.log('🎉 Your application appears ready for deployment!');
console.log('');
console.log('To deploy:');
console.log('1. Click the "Deploy" button in Replit');
console.log('2. After deployment, you may need to rebuild components for full functionality');
console.log('   - Use "node build-backend.js" and "node build-frontend-minimal.js"');
console.log('3. Refer to DEPLOYMENT.md for more details');