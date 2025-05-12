#!/usr/bin/env node
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

console.log('🚀 Starting optimized build process...');

// Step 0: Clean dist directory if it exists
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

// Step 1: Build frontend only with optimized config
console.log('📦 Building frontend with optimized configuration...');
try {
  execSync('vite build --config vite.build.config.ts', { stdio: 'inherit' });
  console.log('✅ Frontend build completed successfully');
} catch (error) {
  console.error('❌ Frontend build failed:', error);
  process.exit(1);
}

// Step 2: Build backend only with optimized settings
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

// Step 3: Verify build artifacts
console.log('🔍 Verifying build artifacts...');
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
console.log('🎉 Build process completed successfully! The app is ready to be deployed.');