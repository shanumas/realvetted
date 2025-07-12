import { User, InsertUser } from "@shared/schema";

// In-memory storage for when database is unavailable
export class FallbackStorage {
  private users: Map<string, User> = new Map();
  private nextId = 1;

  constructor() {
    // Initialize with default admin user
    this.createDefaultAdmin();
  }

  private createDefaultAdmin() {
    const adminUser: User = {
      id: 1,
      email: 'admin@admin.com',
      password: '$2b$10$adminhashedpassword', // This would be properly hashed in real implementation
      firstName: 'Admin',
      lastName: 'User',
      phone: null,
      role: 'admin',
      profileStatus: 'verified',
      addressLine1: null,
      addressLine2: null,
      city: null,
      state: null,
      zip: null,
      dateOfBirth: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      idFrontUrl: null,
      idBackUrl: null,
      isBlocked: false,
    };

    this.users.set('admin@admin.com', adminUser);
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    return this.users.get(email.toLowerCase());
  }

  async createUser(userData: InsertUser): Promise<User> {
    const user: User = {
      id: this.nextId++,
      email: userData.email.toLowerCase(),
      password: userData.password,
      firstName: userData.firstName || null,
      lastName: userData.lastName || null,
      phone: userData.phone || null,
      role: userData.role,
      profileStatus: userData.profileStatus || "pending",
      addressLine1: userData.addressLine1 || null,
      addressLine2: userData.addressLine2 || null,
      city: userData.city || null,
      state: userData.state || null,
      zip: userData.zip || null,
      dateOfBirth: userData.dateOfBirth || null,
      createdAt: new Date(),
      updatedAt: new Date(),
      idFrontUrl: userData.idFrontUrl || null,
      idBackUrl: userData.idBackUrl || null,
      isBlocked: false,
    };

    this.users.set(user.email, user);
    return user;
  }

  async getUser(id: number): Promise<User | undefined> {
    for (const user of this.users.values()) {
      if (user.id === id) {
        return user;
      }
    }
    return undefined;
  }

  getUserCount(): number {
    return this.users.size;
  }
}

export const fallbackStorage = new FallbackStorage();