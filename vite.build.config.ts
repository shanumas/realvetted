import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import themePlugin from "@replit/vite-plugin-shadcn-theme-json";
import path from "path";

// This is an extremely optimized build configuration specifically for deployment
export default defineConfig({
  plugins: [
    react({
      // Disable React refresh for production builds
      babel: {
        plugins: [],
      },
    }),
    themePlugin(),
  ],
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
    // Optimize build for deployment
    target: 'es2020',
    minify: 'esbuild',
    cssMinify: true,
    // Reduce build time by setting a reasonable limit on CSS inlining
    cssCodeSplit: true,
    // Disable source maps for production
    sourcemap: false,
    // More aggressive settings to reduce build time
    reportCompressedSize: false,
    chunkSizeWarningLimit: 2000,
    // Use chunk splitting to drastically improve build performance
    rollupOptions: {
      output: {
        // Reduce the number of chunks
        manualChunks: {
          'vendor-react': ['react', 'react-dom'],
          'vendor-router': ['wouter'],
          'vendor-query': ['@tanstack/react-query'],
          'vendor-ui': [
            '@radix-ui/react-accordion',
            '@radix-ui/react-alert-dialog',
            '@radix-ui/react-aspect-ratio',
            '@radix-ui/react-avatar',
            '@radix-ui/react-checkbox',
            '@radix-ui/react-collapsible',
            '@radix-ui/react-context-menu',
            '@radix-ui/react-dialog',
            '@radix-ui/react-dropdown-menu',
            '@radix-ui/react-hover-card',
            '@radix-ui/react-label',
            '@radix-ui/react-menubar',
            '@radix-ui/react-navigation-menu',
            '@radix-ui/react-popover',
            '@radix-ui/react-progress',
            '@radix-ui/react-radio-group',
            '@radix-ui/react-scroll-area',
            '@radix-ui/react-select',
            '@radix-ui/react-separator',
            '@radix-ui/react-slider',
            '@radix-ui/react-slot',
            '@radix-ui/react-switch',
            '@radix-ui/react-tabs',
            '@radix-ui/react-toast',
            '@radix-ui/react-toggle',
            '@radix-ui/react-toggle-group',
            '@radix-ui/react-tooltip',
          ],
          // Separate lucide-react into its own chunk
          'icons': ['lucide-react']
        },
        // Further optimize output
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]'
      }
    }
  },
  // Speed up the build
  esbuild: {
    legalComments: 'none',
    target: 'es2020',
    // Drop console/debugger in production
    drop: ['console', 'debugger'],
    pure: ['console.log', 'console.debug', 'console.info', 'console.warn', 'console.error'],
  },
});