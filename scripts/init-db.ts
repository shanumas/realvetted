#!/usr/bin/env tsx

import 'dotenv/config';
import { initializeDatabase } from '../server/database-init';

async function main() {
  console.log('🚀 Starting database initialization...');
  await initializeDatabase();
  console.log('✅ Database initialization completed!');
  process.exit(0);
}

main().catch((error) => {
  console.error('❌ Database initialization failed:', error);
  process.exit(1);
});