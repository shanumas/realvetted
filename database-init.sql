-- Initialize the database schema
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    phone VARCHAR(20),
    role VARCHAR(50) NOT NULL DEFAULT 'buyer',
    profile_status VARCHAR(50) DEFAULT 'pending',
    address_line1 VARCHAR(255),
    address_line2 VARCHAR(255),
    city VARCHAR(100),
    state VARCHAR(100),
    zip VARCHAR(20),
    date_of_birth DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    id_front_url VARCHAR(500),
    id_back_url VARCHAR(500),
    is_blocked BOOLEAN DEFAULT FALSE
);

-- Create other essential tables
CREATE TABLE IF NOT EXISTS properties (
    id SERIAL PRIMARY KEY,
    address VARCHAR(255) NOT NULL,
    city VARCHAR(100),
    state VARCHAR(100),
    zip VARCHAR(20),
    price DECIMAL(12,2),
    bedrooms INTEGER,
    bathrooms DECIMAL(3,1),
    square_feet INTEGER,
    property_type VARCHAR(100),
    listing_status VARCHAR(50),
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    source_url VARCHAR(500),
    source_site VARCHAR(100),
    listing_agent_name VARCHAR(255),
    listing_agent_email VARCHAR(255),
    listing_agent_phone VARCHAR(20),
    listing_agent_license_no VARCHAR(100),
    email_sent BOOLEAN DEFAULT FALSE
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_properties_city_state ON properties(city, state);
CREATE INDEX IF NOT EXISTS idx_properties_price ON properties(price);