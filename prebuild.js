#!/usr/bin/env node
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

console.log('🚀 Starting prebuild process...');

// Create prebuilt directory if it doesn't exist
const prebuiltDir = path.join(process.cwd(), 'prebuilt');
if (!fs.existsSync(prebuiltDir)) {
  fs.mkdirSync(prebuiltDir, { recursive: true });
}

// Try to build frontend
try {
  console.log('🏗️ Building frontend for caching...');
  execSync('node build-frontend.js', { stdio: 'inherit' });
  
  // Copy frontend build to prebuilt directory
  console.log('📦 Copying frontend build to prebuilt cache...');
  const distPublicPath = path.join(process.cwd(), 'dist/public');
  const prebuiltPublicPath = path.join(prebuiltDir, 'public');
  
  // Remove old prebuilt frontend if exists
  if (fs.existsSync(prebuiltPublicPath)) {
    execSync(`rm -rf ${prebuiltPublicPath}`, { stdio: 'inherit' });
  }
  
  // Copy frontend build to prebuilt
  if (fs.existsSync(distPublicPath)) {
    execSync(`cp -r ${distPublicPath} ${prebuiltDir}/`, { stdio: 'inherit' });
    console.log('✅ Frontend prebuild completed successfully');
  }
} catch (error) {
  console.error('❌ Frontend prebuild failed:', error);
  // Continue to backend build even if frontend fails
}

// Try to build backend
try {
  console.log('🏗️ Building backend for caching...');
  execSync('node build-backend.js', { stdio: 'inherit' });
  
  // Copy backend build to prebuilt directory
  console.log('📦 Copying backend build to prebuilt cache...');
  const distIndexPath = path.join(process.cwd(), 'dist/index.js');
  const prebuiltIndexPath = path.join(prebuiltDir, 'index.js');
  
  // Remove old prebuilt backend if exists
  if (fs.existsSync(prebuiltIndexPath)) {
    fs.unlinkSync(prebuiltIndexPath);
  }
  
  // Copy backend build to prebuilt
  if (fs.existsSync(distIndexPath)) {
    fs.copyFileSync(distIndexPath, prebuiltIndexPath);
    console.log('✅ Backend prebuild completed successfully');
  }
} catch (error) {
  console.error('❌ Backend prebuild failed:', error);
}

console.log('🎉 Prebuild process completed!');