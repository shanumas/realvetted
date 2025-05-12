#!/usr/bin/env node
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

console.log('🚀 Starting minimal frontend build process...');

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

// Create special build config for minimal frontend
const tempConfigPath = path.join(process.cwd(), 'vite.minimal.config.ts');

// Create minimal config file
console.log('📝 Creating minimal build configuration...');
const minimalConfig = `
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// Extremely minimized build config for deployment only
export default defineConfig({
  plugins: [react({ babel: { plugins: [] } })],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    target: 'es2020',
    minify: 'esbuild',
    cssMinify: true,
    cssCodeSplit: true,
    sourcemap: false,
    reportCompressedSize: false,
    chunkSizeWarningLimit: 5000,
    // Extremely optimized build settings
    rollupOptions: {
      treeshake: 'recommended',
      output: {
        manualChunks(id) {
          // Put everything from node_modules into a single vendor chunk
          if (id.includes('node_modules')) {
            return 'vendor';
          }
        },
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]'
      }
    }
  },
  esbuild: {
    legalComments: 'none',
    target: 'es2020',
    drop: ['console', 'debugger'],
    pure: ['console.log', 'console.debug', 'console.info', 'console.warn', 'console.error'],
  },
});
`;

try {
  fs.writeFileSync(tempConfigPath, minimalConfig);
  console.log('✅ Created minimal build configuration');
} catch (error) {
  console.error('❌ Failed to create minimal build configuration:', error);
  process.exit(1);
}

// Build frontend with minimal config
console.log('📦 Building frontend with minimal configuration...');
try {
  execSync('vite build --config vite.minimal.config.ts', { stdio: 'inherit' });
  console.log('✅ Frontend build completed successfully');
} catch (error) {
  console.error('❌ Frontend build failed:', error);
  process.exit(1);
} finally {
  // Clean up temporary config file
  if (fs.existsSync(tempConfigPath)) {
    fs.unlinkSync(tempConfigPath);
  }
}

// Verify build artifacts
if (!fs.existsSync(publicFolder) || !fs.existsSync(path.join(publicFolder, 'index.html'))) {
  console.error('❌ Frontend build verification failed');
  process.exit(1);
}

console.log('✅ Frontend build verification completed');
console.log('🎉 Minimal frontend build process completed successfully!');