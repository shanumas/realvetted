import { type Express, type Request, type Response, type NextFunction } from "express";
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import session from "express-session";
import { storage } from "./storage";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { type User, registerUserSchema, type InsertUser } from "@shared/schema";

// Extend the User type to match our database schema
type DbUser = {
  id: number;
  email: string;
  password: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  role: string;
  profileStatus: string;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  dateOfBirth: string | null;
  createdAt: string;
  updatedAt: string;
  idFrontUrl: string | null;
  idBackUrl: string | null;
  profilePhotoUrl: string | null;
  licenseNumber: string | null;
  brokerageName: string | null;
  isBlocked: boolean;
  verificationMethod: string | null;
  prequalificationDocUrl: string | null;
  prequalificationValidated: boolean;
  prequalificationData: any | null;
  prequalificationMessage: string | null;
  manualApprovalRequested: boolean;
  prequalificationAttempts: number;
  failedPrequalificationUrls: string[];
  serviceArea: string | null;
  geographicalArea: string | null;
};

declare global {
  namespace Express {
    interface User extends DbUser {}
  }
}

// Extend passport types
declare module 'passport' {
  interface Authenticator {
    serializeUser<TUser = DbUser, TID = number>(fn: (user: TUser, done: (err: Error | null, id?: TID) => void) => void): void;
    deserializeUser<TID = number, TUser = DbUser>(fn: (id: TID, done: (err: Error | null, user?: TUser | false) => void) => void): void;
  }
}

// Extend passport-local types
declare module 'passport-local' {
  interface IVerifyOptions {
    message: string;
  }

  interface IStrategyOptions {
    usernameField?: string;
    passwordField?: string;
    session?: boolean;
    passReqToCallback?: false;
  }

  interface VerifyFunction {
    (username: string, password: string, done: (error: Error | null, user?: DbUser | false, options?: IVerifyOptions) => void): void;
  }
}

const scryptAsync = promisify(scrypt);

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const derivedKey = await scryptAsync(password, salt, 64) as Buffer;
  return salt + ':' + derivedKey.toString('hex');
}

export function setupAuth(app: Express) {
  // Set up session middleware
  app.use(
    session({
      secret: process.env.SESSION_SECRET || "your-secret-key",
      resave: false,
      saveUninitialized: false,
    })
  );

  // Initialize Passport and restore authentication state from session
  app.use(passport.initialize());
  app.use(passport.session());

  // Middleware to check if user is authenticated
  function isAuthenticated(req: Request, res: Response, next: NextFunction) {
    if (req.isAuthenticated()) {
      return next();
    }
    res.status(401).json({ success: false, error: "Unauthorized" });
  }

  // Middleware to check if user has required role
  function hasRole(roles: string[]) {
    return (req: Request, res: Response, next: NextFunction) => {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ success: false, error: "Unauthorized" });
      }
      if (!req.user || !roles.includes(req.user.role)) {
        return res.status(403).json({ success: false, error: "Forbidden" });
      }
      next();
    };
  }

  // Define passport local strategy
  passport.use(new LocalStrategy(
    { usernameField: "email" },
    async (
      email: string,
      password: string,
      done: (error: Error | null, user?: DbUser | false, options?: { message: string }) => void
    ) => {
      try {
        const user = await storage.getUserByEmail(email);
        if (!user) {
          return done(null, false, { message: "Invalid email or password" });
        }

        // Convert dates to strings and ensure required fields
        const userWithStringDates: DbUser = {
          id: user.id,
          email: user.email,
          password: user.password,
          firstName: user.firstName,
          lastName: user.lastName,
          phone: user.phone,
          role: user.role,
          profileStatus: 'pending',
          addressLine1: user.addressLine1,
          addressLine2: user.addressLine2,
          city: user.city,
          state: user.state,
          zip: user.zip,
          dateOfBirth: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          idFrontUrl: user.idFrontUrl,
          idBackUrl: user.idBackUrl,
          profilePhotoUrl: user.profilePhotoUrl,
          licenseNumber: user.licenseNumber,
          brokerageName: user.brokerageName,
          isBlocked: false,
          verificationMethod: user.verificationMethod,
          prequalificationDocUrl: user.prequalificationDocUrl,
          prequalificationValidated: false,
          prequalificationData: user.prequalificationData,
          prequalificationMessage: user.prequalificationMessage,
          manualApprovalRequested: false,
          prequalificationAttempts: 0,
          failedPrequalificationUrls: user.failedPrequalificationUrls || [],
          serviceArea: user.serviceArea,
          geographicalArea: user.geographicalArea
        };

        const [salt, storedHash] = userWithStringDates.password.split(':');
        const derivedKey = await scryptAsync(password, salt, 64) as Buffer;
        const suppliedHash = derivedKey.toString('hex');

        const match = timingSafeEqual(
          Buffer.from(storedHash, 'hex'),
          Buffer.from(suppliedHash, 'hex')
        );

        if (!match) {
          return done(null, false, { message: "Invalid email or password" });
        }

        return done(null, userWithStringDates);
      } catch (error) {
        return done(error instanceof Error ? error : new Error('Unknown error'));
      }
    }
  ));

  // Serialize user for the session
  passport.serializeUser((user: DbUser, done: (err: Error | null, id?: number) => void) => {
    done(null, user.id);
  });

  // Deserialize user from the session
  passport.deserializeUser(async (id: number, done: (err: Error | null, user?: DbUser | false) => void) => {
    try {
      const user = await storage.getUser(id);
      if (!user) {
        return done(null, false);
      }

      // Convert dates to strings and ensure required fields
      const userWithStringDates: DbUser = {
        id: user.id,
        email: user.email,
        password: user.password,
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone,
        role: user.role,
        profileStatus: 'pending',
        addressLine1: user.addressLine1,
        addressLine2: user.addressLine2,
        city: user.city,
        state: user.state,
        zip: user.zip,
        dateOfBirth: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        idFrontUrl: user.idFrontUrl,
        idBackUrl: user.idBackUrl,
        profilePhotoUrl: user.profilePhotoUrl,
        licenseNumber: user.licenseNumber,
        brokerageName: user.brokerageName,
        isBlocked: false,
        verificationMethod: user.verificationMethod,
        prequalificationDocUrl: user.prequalificationDocUrl,
        prequalificationValidated: false,
        prequalificationData: user.prequalificationData,
        prequalificationMessage: user.prequalificationMessage,
        manualApprovalRequested: false,
        prequalificationAttempts: 0,
        failedPrequalificationUrls: user.failedPrequalificationUrls || [],
        serviceArea: user.serviceArea,
        geographicalArea: user.geographicalArea
      };

      done(null, userWithStringDates);
    } catch (error) {
      done(error instanceof Error ? error : new Error('Unknown error'));
    }
  });

  // Auth routes
  app.post("/api/auth/register", async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Validate request body against schema
      const validatedData = registerUserSchema.parse(req.body);

      // Check if user already exists
      const existingUser = await storage.getUserByEmail(validatedData.email);
      if (existingUser) {
        return res.status(400).json({ 
          success: false, 
          error: "Email already in use" 
        });
      }

      // Create user with hashed password
      const hashedPassword = await hashPassword(validatedData.password);
      
      // Prepare user data with required fields
      const userData: InsertUser = {
        email: validatedData.email,
        password: hashedPassword,
        role: validatedData.role,
        firstName: validatedData.firstName || null,
        lastName: validatedData.lastName || null,
        profileStatus: validatedData.role === 'agent' ? 'pending' : 'verified',
        serviceArea: validatedData.role === 'agent' ? (req.body.serviceArea || '') : '',
        geographicalArea: validatedData.role === 'buyer' ? (req.body.geographicalArea || '') : '',
        phone: null,
        addressLine1: null,
        addressLine2: null,
        city: null,
        state: null,
        zip: null,
        dateOfBirth: null,
        idFrontUrl: null,
        idBackUrl: null,
        profilePhotoUrl: null,
        licenseNumber: null,
        brokerageName: null,
        isBlocked: false,
        verificationMethod: null,
        prequalificationDocUrl: null,
        prequalificationValidated: false,
        prequalificationData: null,
        prequalificationMessage: null,
        manualApprovalRequested: false,
        prequalificationAttempts: 0,
        failedPrequalificationUrls: [],
      };

      const user = await storage.createUser(userData);

      // Log user in
      req.login(user as unknown as DbUser, (loginErr: Error | null) => {
        if (loginErr) return next(loginErr);
        
        // Return user without password
        const { password, ...userWithoutPassword } = user;
        
        // Add a message for agents about pending verification
        const response: {
          success: boolean;
          data: Omit<typeof userWithoutPassword, 'password'>;
          message?: string;
        } = {
          success: true,
          data: userWithoutPassword
        };
        
        if (user.role === 'agent') {
          response.message = "Your registration is pending approval. Our team will review your information and verify your account.";
        }
        
        res.status(201).json(response);
      });
    } catch (error) {
      console.error("Registration error:", error);
      
      // Check if it's a database connection issue
      if (error instanceof Error && error.message.includes('endpoint is disabled')) {
        return res.status(503).json({ 
          success: false, 
          error: "Database is temporarily unavailable. Please try again in a few minutes." 
        });
      }
      
      // Check if it's a validation error
      if (error instanceof Error && error.name === 'ZodError') {
        return res.status(400).json({
          success: false,
          error: "Invalid registration data"
        });
      }
      
      res.status(500).json({ 
        success: false, 
        error: "Registration failed" 
      });
    }
  });

  // Login route
  app.post("/api/auth/login", (req, res, next) => {
    passport.authenticate("local", (err, user, info) => {
      if (err) return next(err);
      if (!user) {
        return res.status(401).json({ 
          success: false, 
          error: info?.message || "Invalid credentials" 
        });
      }
      
      // Verify role matches
      if (req.body.role && user.role !== req.body.role) {
        return res.status(401).json({ 
          success: false, 
          error: `Invalid login. This account is registered as a ${user.role}, not a ${req.body.role}.` 
        });
      }
      
      req.login(user, (err) => {
        if (err) return next(err);
        // Return user without password
        const { password, ...userWithoutPassword } = user;
        res.json(userWithoutPassword);
      });
    })(req, res, next);
  });

  // Logout route
  app.post("/api/auth/logout", (req, res) => {
    // Store session ID for later destruction
    const sessionID = req.session.id;
    
    req.logout((err) => {
      if (err) {
        return res.status(500).json({ 
          success: false, 
          error: "Logout failed" 
        });
      }
      
      // Regenerate the session to ensure clean state
      req.session.regenerate((regenerateErr) => {
        if (regenerateErr) {
          console.error("Error regenerating session:", regenerateErr);
        }
        
        // Destroy the old session completely
        if (sessionID && storage.sessionStore) {
          storage.sessionStore.destroy(sessionID, (destroyErr) => {
            if (destroyErr) {
              console.error("Error destroying session:", destroyErr);
            }
          });
        }
        
        // Clear all session cookies
        res.clearCookie('connect.sid');
        
        res.json({ success: true });
      });
    });
  });

  // Get current user
  app.get("/api/auth/user", (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ 
        success: false, 
        error: "Not authenticated" 
      });
    }
    
    // Return user without password
    const { password, ...userWithoutPassword } = req.user;
    res.json(userWithoutPassword);
  });

  return { isAuthenticated, hasRole };
}
