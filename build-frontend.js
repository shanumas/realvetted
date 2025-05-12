#!/usr/bin/env node
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

console.log('🚀 Starting optimized frontend build process...');

// Clean dist/public directory if it exists
console.log('🧹 Cleaning existing frontend build artifacts...');
const publicFolder = path.join(process.cwd(), 'dist/public');
if (fs.existsSync(publicFolder)) {
  try {
    execSync(`rm -rf ${publicFolder}`, { stdio: 'inherit' });
    console.log('✅ Successfully cleaned public directory');
  } catch (error) {
    console.error('⚠️ Warning: Failed to clean public directory:', error);
  }
}

// Create dist directory if it doesn't exist
const distFolder = path.join(process.cwd(), 'dist');
if (!fs.existsSync(distFolder)) {
  fs.mkdirSync(distFolder, { recursive: true });
}

// Build frontend with optimized config
console.log('📦 Building frontend with optimized configuration...');
try {
  execSync('vite build --config vite.build.config.ts', { stdio: 'inherit' });
  console.log('✅ Frontend build completed successfully');
} catch (error) {
  console.error('❌ Frontend build failed:', error);
  process.exit(1);
}

// Verify build artifacts
if (!fs.existsSync(publicFolder) || !fs.existsSync(path.join(publicFolder, 'index.html'))) {
  console.error('❌ Frontend build verification failed');
  process.exit(1);
}

console.log('✅ Frontend build verification completed');
console.log('🎉 Frontend build process completed successfully!');