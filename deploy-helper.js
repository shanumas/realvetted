#!/usr/bin/env node
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

console.log('🚀 Starting deployment helper...');

// Step 0: Clean the dist directory if it exists
console.log('🧹 Cleaning existing build artifacts...');
const distFolder = path.join(process.cwd(), 'dist');
if (fs.existsSync(distFolder)) {
  try {
    // On Unix systems, this is more efficient than recursive file deletion in JS
    execSync(`rm -rf ${distFolder}`, { stdio: 'inherit' });
    console.log('✅ Successfully cleaned dist directory');
  } catch (error) {
    console.error('⚠️ Warning: Failed to clean dist directory:', error);
    // Continue anyway, don't exit
  }
}

// Create dist directory
fs.mkdirSync(distFolder, { recursive: true });

// Step 1: Copy any pre-built assets if they exist (from previous builds)
console.log('📂 Checking for pre-built assets...');
const prebuiltFrontendPath = path.join(process.cwd(), 'prebuilt', 'public');
const prebuiltBackendPath = path.join(process.cwd(), 'prebuilt', 'index.js');

let frontendBuilt = false;
let backendBuilt = false;

// Check if we have prebuilt frontend assets
if (fs.existsSync(prebuiltFrontendPath)) {
  console.log('📋 Found prebuilt frontend, copying...');
  try {
    execSync(`cp -r ${prebuiltFrontendPath} ${distFolder}/`, { stdio: 'inherit' });
    console.log('✅ Successfully copied prebuilt frontend');
    frontendBuilt = true;
  } catch (error) {
    console.error('⚠️ Warning: Failed to copy prebuilt frontend:', error);
  }
}

// Check if we have prebuilt backend
if (fs.existsSync(prebuiltBackendPath)) {
  console.log('📋 Found prebuilt backend, copying...');
  try {
    execSync(`cp ${prebuiltBackendPath} ${distFolder}/`, { stdio: 'inherit' });
    console.log('✅ Successfully copied prebuilt backend');
    backendBuilt = true;
  } catch (error) {
    console.error('⚠️ Warning: Failed to copy prebuilt backend:', error);
  }
}

// Step 2: Build anything that wasn't prebuilt
if (!frontendBuilt) {
  console.log('🏗️ Building frontend...');
  try {
    execSync('node build-frontend.js', { stdio: 'inherit' });
    console.log('✅ Frontend built successfully');
  } catch (error) {
    console.error('❌ Frontend build failed');
    process.exit(1);
  }
}

if (!backendBuilt) {
  console.log('🏗️ Building backend...');
  try {
    execSync('node build-backend.js', { stdio: 'inherit' });
    console.log('✅ Backend built successfully');
  } catch (error) {
    console.error('❌ Backend build failed');
    process.exit(1);
  }
}

// Step 3: Final verification
console.log('🔍 Performing final verification...');
const publicFolder = path.join(distFolder, 'public');

if (!fs.existsSync(distFolder)) {
  console.error('❌ Dist folder does not exist');
  process.exit(1);
}

if (!fs.existsSync(path.join(distFolder, 'index.js'))) {
  console.error('❌ Backend bundle does not exist');
  process.exit(1);
}

if (!fs.existsSync(publicFolder) || !fs.existsSync(path.join(publicFolder, 'index.html'))) {
  console.error('❌ Frontend build does not exist');
  process.exit(1);
}

console.log('✅ Build verification completed');
console.log('🎉 Deployment preparation completed successfully! The app is ready to be deployed.');