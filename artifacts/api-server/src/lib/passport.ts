import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { Strategy as LocalStrategy } from "passport-local";
import bcrypt from "bcryptjs";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

declare global {
  namespace Express {
    interface User {
      id: number;
      email: string;
      name: string;
      role: string;
    }
  }
}

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id: number, done) => {
  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id));
    if (!user || !user.isActive) {
      done(null, false);
      return;
    }
    done(null, { id: user.id, email: user.email, name: user.name, role: user.role });
  } catch (err) {
    done(err);
  }
});

passport.use(
  new LocalStrategy({ usernameField: "username" }, async (username, password, done) => {
    try {
      const [user] = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.email, username));

      if (!user || !user.isActive) {
        done(null, false, { message: "Invalid credentials" });
        return;
      }
      if (!user.passwordHash) {
        done(null, false, { message: "Invalid credentials" });
        return;
      }
      const valid = await bcrypt.compare(password, user.passwordHash);
      if (!valid) {
        done(null, false, { message: "Invalid credentials" });
        return;
      }
      done(null, { id: user.id, email: user.email, name: user.name, role: user.role });
    } catch (err) {
      done(err);
    }
  }),
);

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
  logger.warn("Google OAuth credentials not set — Google SSO will be disabled");
} else {
  const domains = (process.env.REPLIT_DOMAINS ?? "").split(",").filter(Boolean);
  const callbackBase = domains.length > 0 ? `https://${domains[0]}` : "http://localhost:80";
  const callbackURL = `${callbackBase}/api/auth/google/callback`;

  passport.use(
    new GoogleStrategy(
      {
        clientID: GOOGLE_CLIENT_ID,
        clientSecret: GOOGLE_CLIENT_SECRET,
        callbackURL,
      },
      async (_accessToken, _refreshToken, profile, done) => {
        try {
          const email = profile.emails?.[0]?.value ?? "";
          const name = profile.displayName ?? email;

          let [user] = await db.select().from(usersTable).where(eq(usersTable.googleId, profile.id));

          if (!user) {
            const [byEmail] = await db.select().from(usersTable).where(eq(usersTable.email, email));
            if (byEmail) {
              const [updated] = await db
                .update(usersTable)
                .set({ googleId: profile.id, updatedAt: new Date() })
                .where(eq(usersTable.id, byEmail.id))
                .returning();
              user = updated;
            } else {
              const [created] = await db
                .insert(usersTable)
                .values({
                  name,
                  email,
                  phone: "+62",
                  googleId: profile.id,
                  role: "user",
                  isActive: true,
                })
                .returning();
              user = created;
            }
          }

          if (!user.isActive) {
            done(null, false);
            return;
          }

          done(null, { id: user.id, email: user.email, name: user.name, role: user.role });
        } catch (err) {
          done(err as Error);
        }
      },
    ),
  );
}

export default passport;
