import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import 'dotenv/config';

const sql = neon(process.env.DATABASE_URL!);
const db = drizzle(sql);

async function addAreaFields() {
  try {
    // Add the new columns
    await sql`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS geographical_area TEXT,
      ADD COLUMN IF NOT EXISTS service_area TEXT;
    `;
    
    console.log('Successfully added area fields to users table');
  } catch (error) {
    console.error('Error adding area fields:', error);
    throw error;
  }
}

addAreaFields()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Migration failed:', error);
    process.exit(1);
  }); 