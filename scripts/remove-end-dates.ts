import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import 'dotenv/config';

const sql = neon(process.env.DATABASE_URL!);
const db = drizzle(sql);

async function removeTourEndDates() {
  try {
    // Drop the end date columns
    await sql`
      ALTER TABLE viewing_requests 
      DROP COLUMN IF EXISTS requested_end_date,
      DROP COLUMN IF EXISTS confirmed_end_date;
    `;
    
    console.log('Successfully removed end date columns from viewing_requests table');
  } catch (error) {
    console.error('Error removing end date columns:', error);
    throw error;
  }
}

removeTourEndDates()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Migration failed:', error);
    process.exit(1);
  }); 