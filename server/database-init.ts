import { neon } from '@neondatabase/serverless';

export async function initializeDatabase() {
  const databaseUrl = process.env.DATABASE_URL;
  
  if (!databaseUrl) {
    console.warn('DATABASE_URL not found, skipping database initialization');
    return;
  }

  try {
    // Create connection using neon (same as the existing storage)
    const connection = neon(databaseUrl);

    console.log('🔄 Initializing database tables...');

    // Create tables if they don't exist
    await connection(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        first_name TEXT,
        last_name TEXT,
        phone TEXT,
        role TEXT NOT NULL,
        profile_status TEXT NOT NULL DEFAULT 'pending',
        address_line1 TEXT,
        address_line2 TEXT,
        city TEXT,
        state TEXT,
        zip TEXT,
        date_of_birth TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        id_front_url TEXT,
        id_back_url TEXT,
        profile_photo_url TEXT,
        license_number TEXT,
        brokerage_name TEXT,
        is_blocked BOOLEAN DEFAULT FALSE,
        verification_method TEXT,
        prequalification_doc_url TEXT,
        prequalification_validated BOOLEAN DEFAULT FALSE,
        prequalification_data JSON,
        prequalification_message TEXT,
        manual_approval_requested BOOLEAN DEFAULT FALSE,
        prequalification_attempts INTEGER DEFAULT 0,
        failed_prequalification_urls TEXT[]
      );
    `);

    await connection(`
      CREATE TABLE IF NOT EXISTS properties (
        id SERIAL PRIMARY KEY,
        address TEXT NOT NULL,
        city TEXT,
        state TEXT,
        zip TEXT,
        price INTEGER,
        bedrooms INTEGER,
        bathrooms INTEGER,
        square_feet INTEGER,
        property_type TEXT,
        year_built INTEGER,
        description TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        created_by INTEGER NOT NULL,
        seller_email TEXT,
        seller_id INTEGER,
        agent_id INTEGER,
        status TEXT NOT NULL DEFAULT 'active',
        seller_name TEXT,
        seller_phone TEXT,
        seller_company TEXT,
        seller_license_no TEXT,
        property_url TEXT,
        source_url TEXT,
        source_site TEXT,
        listing_agent_name TEXT,
        listing_agent_email TEXT,
        listing_agent_phone TEXT,
        listing_agent_company TEXT,
        listing_agent_license_no TEXT,
        features TEXT[],
        image_urls TEXT[],
        email_sent BOOLEAN DEFAULT FALSE
      );
    `);

    await connection(`
      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        property_id INTEGER NOT NULL,
        sender_id INTEGER NOT NULL,
        receiver_id INTEGER NOT NULL,
        content TEXT NOT NULL,
        timestamp TIMESTAMP DEFAULT NOW(),
        is_read BOOLEAN DEFAULT FALSE
      );
    `);

    await connection(`
      CREATE TABLE IF NOT EXISTS support_messages (
        id SERIAL PRIMARY KEY,
        session_id TEXT NOT NULL,
        sender_id INTEGER,
        sender_name TEXT NOT NULL,
        sender_email TEXT,
        content TEXT NOT NULL,
        timestamp TIMESTAMP DEFAULT NOW(),
        is_read BOOLEAN DEFAULT FALSE,
        is_admin BOOLEAN DEFAULT FALSE
      );
    `);

    await connection(`
      CREATE TABLE IF NOT EXISTS agent_leads (
        id SERIAL PRIMARY KEY,
        property_id INTEGER NOT NULL,
        agent_id INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'available',
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    await connection(`
      CREATE TABLE IF NOT EXISTS property_activity_logs (
        id SERIAL PRIMARY KEY,
        property_id INTEGER NOT NULL,
        user_id INTEGER,
        activity TEXT NOT NULL,
        timestamp TIMESTAMP DEFAULT NOW(),
        details JSON
      );
    `);

    await connection(`
      CREATE TABLE IF NOT EXISTS agreements (
        id SERIAL PRIMARY KEY,
        property_id INTEGER,
        agent_id INTEGER NOT NULL,
        buyer_id INTEGER NOT NULL,
        type TEXT NOT NULL DEFAULT 'standard',
        agreement_text TEXT NOT NULL,
        agent_signature TEXT,
        buyer_signature TEXT,
        seller_signature TEXT,
        date TIMESTAMP NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending_buyer',
        created_at TIMESTAMP DEFAULT NOW(),
        document_url TEXT,
        edited_pdf_content TEXT,
        is_global BOOLEAN DEFAULT FALSE
      );
    `);

    await connection(`
      CREATE TABLE IF NOT EXISTS viewing_requests (
        id SERIAL PRIMARY KEY,
        property_id INTEGER NOT NULL,
        buyer_id INTEGER NOT NULL,
        buyer_agent_id INTEGER,
        seller_agent_id INTEGER,
        requested_date TIMESTAMP NOT NULL,
        requested_end_date TIMESTAMP NOT NULL,
        confirmed_date TIMESTAMP,
        confirmed_end_date TIMESTAMP,
        status TEXT NOT NULL DEFAULT 'pending',
        notes TEXT,
        confirmed_by_id INTEGER,
        response_message TEXT,
        seller_agent_approval_status TEXT DEFAULT 'pending',
        buyer_agent_approval_status TEXT DEFAULT 'pending',
        seller_agent_approved_by_id INTEGER,
        buyer_agent_approved_by_id INTEGER,
        seller_agent_approval_date TIMESTAMP,
        buyer_agent_approval_date TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // Create viewing tokens table for public access
    await connection(`
      CREATE TABLE IF NOT EXISTS viewing_tokens (
        id SERIAL PRIMARY KEY,
        token TEXT NOT NULL UNIQUE,
        viewing_request_id INTEGER NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT NOW(),
        last_accessed_at TIMESTAMP
      );
    `);

    // Create session table for express-session
    await connection(`
      CREATE TABLE IF NOT EXISTS session (
        sid VARCHAR NOT NULL COLLATE "default",
        sess JSON NOT NULL,
        expire TIMESTAMP(6) NOT NULL
      );
    `);

    await connection(`
      CREATE INDEX IF NOT EXISTS IDX_session_expire ON session(expire);
    `);

    await connection(`
      ALTER TABLE session ADD CONSTRAINT session_pkey PRIMARY KEY (sid);
    `).catch(() => {
      // Ignore error if constraint already exists
    });

    console.log('✅ Database tables initialized successfully');
    
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    // Don't throw error to allow app to continue with fallback storage
  }
}