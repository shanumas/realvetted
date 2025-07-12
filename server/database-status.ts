import { Client } from 'pg';

export class DatabaseStatus {
  private static instance: DatabaseStatus;
  private isConnected = false;
  private lastCheckTime = 0;
  private checkInterval = 30000; // 30 seconds

  private constructor() {}

  static getInstance(): DatabaseStatus {
    if (!DatabaseStatus.instance) {
      DatabaseStatus.instance = new DatabaseStatus();
    }
    return DatabaseStatus.instance;
  }

  async checkConnection(): Promise<boolean> {
    const now = Date.now();
    
    // Don't check too frequently
    if (now - this.lastCheckTime < this.checkInterval) {
      return this.isConnected;
    }

    this.lastCheckTime = now;

    try {
      const client = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false },
        statement_timeout: 5000, // 5 second timeout
        query_timeout: 5000,
      });

      await client.connect();
      await client.query('SELECT 1');
      await client.end();
      
      this.isConnected = true;
      console.log('Database connection verified');
      return true;
    } catch (error) {
      this.isConnected = false;
      console.log('Database connection failed:', error.message);
      return false;
    }
  }

  getCurrentStatus(): boolean {
    return this.isConnected;
  }
}

export const dbStatus = DatabaseStatus.getInstance();