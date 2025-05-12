
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
