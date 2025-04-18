// Quick script to add the new prequalification columns to the user table
import pg from 'pg';
import dotenv from 'dotenv';

const { Pool } = pg;
dotenv.config();

async function runMigration() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    console.log('Running migration to add prequalification tracking columns');
    
    // Check if column exists
    const checkColumn = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'users' AND column_name = 'prequalification_attempts'
    `);
    
    if (checkColumn.rows.length === 0) {
      // Add prequalification_attempts column
      await pool.query(`
        ALTER TABLE users 
        ADD COLUMN prequalification_attempts INTEGER DEFAULT 0
      `);
      console.log('Added prequalification_attempts column');
    } else {
      console.log('prequalification_attempts column already exists');
    }
    
    // Check if failed_prequalification_urls column exists
    const checkUrlsColumn = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'users' AND column_name = 'failed_prequalification_urls'
    `);
    
    if (checkUrlsColumn.rows.length === 0) {
      // Add failed_prequalification_urls column
      await pool.query(`
        ALTER TABLE users 
        ADD COLUMN failed_prequalification_urls TEXT[]
      `);
      console.log('Added failed_prequalification_urls column');
    } else {
      console.log('failed_prequalification_urls column already exists');
    }
    
    console.log('Migration completed successfully');
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await pool.end();
  }
}

runMigration();