#!/usr/bin/env node
import { execSync } from 'child_process';
import { createClient } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import * as schema from './shared/schema.js';

console.log('🚀 Initializing database...');

// Get database URL from environment
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL environment variable is not set');
  process.exit(1);
}

console.log('📡 Attempting to connect to database...');
console.log('🔗 Database URL:', DATABASE_URL.replace(/\/\/.*@/, '//***:***@'));

// Create a client and attempt to connect
const client = createClient({
  connectionString: DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

try {
  await client.connect();
  console.log('✅ Database connection successful');
  
  // Test a simple query
  const result = await client.query('SELECT 1 as test');
  console.log('✅ Database query test successful');
  
  // Check if we need to push schema
  try {
    const tableCheck = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = 'users'
    `);
    
    if (tableCheck.rows.length === 0) {
      console.log('📦 Database tables not found, pushing schema...');
      await client.end();
      
      // Run drizzle push to create tables
      execSync('npm run db:push', { stdio: 'inherit' });
      console.log('✅ Database schema pushed successfully');
    } else {
      console.log('✅ Database tables already exist');
    }
  } catch (schemaError) {
    console.log('⚠️ Could not check schema, attempting to push:', schemaError.message);
    await client.end();
    
    try {
      execSync('npm run db:push', { stdio: 'inherit' });
      console.log('✅ Database schema pushed successfully');
    } catch (pushError) {
      console.error('❌ Failed to push database schema:', pushError.message);
    }
  }
  
  if (client.connected) {
    await client.end();
  }
  
  console.log('🎉 Database initialization completed successfully');
  
} catch (error) {
  console.error('❌ Database connection failed:', error.message);
  
  if (error.message.includes('endpoint is disabled')) {
    console.log('');
    console.log('🔄 The database endpoint appears to be disabled (likely due to inactivity).');
    console.log('This is common with Neon databases in the free tier.');
    console.log('');
    console.log('To resolve this issue:');
    console.log('1. The database should automatically reactivate when accessed');
    console.log('2. Try restarting the application');
    console.log('3. If the issue persists, contact support');
  }
  
  process.exit(1);
} finally {
  if (client.connected) {
    await client.end();
  }
}