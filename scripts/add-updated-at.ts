import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import 'dotenv/config';

const sql = neon(process.env.DATABASE_URL!);
const db = drizzle(sql);

async function addUpdatedAtColumn() {
  try {
    // Add updated_at column to users table
    await sql`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
    `;
    
    console.log('Successfully added updated_at column to users table');
  } catch (error) {
    console.error('Error adding updated_at column:', error);
    throw error;
  }
}

addUpdatedAtColumn()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Migration failed:', error);
    process.exit(1);
  }); 