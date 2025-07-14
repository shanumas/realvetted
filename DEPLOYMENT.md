# Deployment Guide

## Database Initialization

During deployment, the database tables are automatically created when the application starts. The initialization process is built into the server startup sequence.

### Automatic Database Setup

1. **On Server Start**: The application automatically calls `initializeDatabase()` when it starts
2. **Table Creation**: All required tables are created using `CREATE TABLE IF NOT EXISTS` statements
3. **Safe Deployment**: The process is idempotent - running it multiple times is safe
4. **Graceful Fallback**: If database initialization fails, the app continues with fallback storage

### Manual Database Initialization

If you need to initialize the database manually:

```bash
# Run the database initialization script
npm run db:init

# Or run directly with tsx
tsx scripts/init-db.ts
```

### Database Tables Created

- `users` - User accounts (buyers, sellers, agents, admin)
- `properties` - Property listings and details
- `messages` - Chat messages between users
- `support_messages` - Support chat messages
- `agent_leads` - Agent lead management
- `property_activity_logs` - Activity tracking
- `agreements` - Legal agreements and contracts
- `viewing_requests` - Property viewing requests
- `session` - Session storage for authentication

### Environment Variables Required

- `DATABASE_URL` - PostgreSQL connection string

### Production Deployment Steps

1. **Set Environment Variables**: Ensure `DATABASE_URL` is configured
2. **Deploy Application**: The database will be initialized automatically on first start
3. **Verify Connection**: Check logs for "✅ Database tables initialized successfully"

### Troubleshooting

If database initialization fails:
- Check that `DATABASE_URL` is correctly set
- Verify database server is accessible
- Application will continue with in-memory fallback storage
- Check server logs for specific error messages

### Benefits of This Approach

- **Zero-downtime deployments**: Tables are created safely without conflicts
- **Automatic setup**: No manual database migration steps required
- **Resilient**: Application works even if database is temporarily unavailable
- **Developer-friendly**: Easy to set up in development and production