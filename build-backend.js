#!/usr/bin/env node
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

console.log('🚀 Starting optimized backend build process...');

// Create dist directory if it doesn't exist
const distFolder = path.join(process.cwd(), 'dist');
if (!fs.existsSync(distFolder)) {
  fs.mkdirSync(distFolder, { recursive: true });
}

// Build backend with optimized settings
console.log('📦 Building backend with optimized settings...');
try {
  // Optimize esbuild for faster builds
  execSync('esbuild server/index.ts --platform=node --packages=external --bundle --format=esm --outdir=dist --minify --target=node16', 
    { stdio: 'inherit' });
  console.log('✅ Backend build completed successfully');
} catch (error) {
  console.error('❌ Backend build failed:', error);
  process.exit(1);
}

// Verify build artifacts
if (!fs.existsSync(path.join(distFolder, 'index.js'))) {
  console.error('❌ Backend bundle does not exist');
  process.exit(1);
}

console.log('✅ Backend build verification completed');
console.log('🎉 Backend build process completed successfully!');