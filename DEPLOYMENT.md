# Deployment Guide

## Overview
This guide explains how to deploy the Real Estate Platform on Replit.

## Deployment Process

The project includes special deployment scripts to handle the large codebase without timing out during deployment.

### Step 1: Deploy Using The Deployment Stub

We've created a deployment stub that will deploy successfully without timing out, using the following files:
- `dist/index.js` - The backend server
- `dist/public/index.html` - A temporary loading page
- `dist/public/assets/index-stub.css` - Minimal CSS for the loading page

**To deploy with the stub:**

1. Make sure the `dist` directory contains all the necessary files (run `node deployment-fix.js` if needed)
2. Click the "Deploy" button in Replit
3. Wait for the deployment to complete

### Step 2: Rebuild the Full Application After Deployment

After the initial deployment succeeds, you can rebuild the full application component by component:

1. **Build Backend**:
   ```
   node build-backend.js
   ```

2. **Build Frontend** (in separate steps to avoid timeout):
   ```
   node build-frontend-minimal.js
   ```

## Troubleshooting

If deployment fails:

1. Check that the `dist` directory contains all necessary files
2. Run `node deployment-fix.js` to recreate the deployment stub
3. Try deploying again

## Full Build Process (For Reference)

The full build process is split into multiple scripts to prevent timeout:

- `build-backend.js` - Builds only the backend
- `build-frontend.js` - Builds the frontend with chunking optimization
- `build-frontend-minimal.js` - Builds a minimal frontend
- `deployment-fix.js` - Creates a minimal deployment stub
- `deploy-helper.js` - Main deployment script that coordinates the build process

## Notes

- The deployment stub shows a loading page that automatically refreshes every 30 seconds
- You may need to manually run the build scripts after deployment to get the full application running