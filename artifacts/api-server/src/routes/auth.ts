import { Router } from "express";
import bcrypt from "bcryptjs";
import { db } from "@workspace/db";
import { usersTable, packagesTable, userGroupsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import passport from "../lib/passport";
import { z } from "zod";

const router = Router();

router.post("/auth/login", (req, res, next) => {
  passport.authenticate("local", (err: Error | null, user: Express.User | false, _info: { message: string } | undefined) => {
    if (err) {
      next(err);
      return;
    }
    if (!user) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }
    req.logIn(user, (loginErr) => {
      if (loginErr) {
        next(loginErr);
        return;
      }
      req.session.save((saveErr) => {
        if (saveErr) {
          next(saveErr);
          return;
        }
        res.json({ id: user.id, email: user.email, name: user.name, role: user.role });
      });
    });
  })(req, res, next);
});

router.get("/auth/google", passport.authenticate("google", { scope: ["profile", "email"] }));

router.get("/auth/google/callback", (req, res, next) => {
  passport.authenticate(
    "google",
    (err: Error | null, user: Express.User | false, info: { message?: string } | undefined) => {
      if (err) { next(err); return; }
      if (!user) {
        const msg = info?.message ?? "google_failed";
        if (msg === "pending_approval") {
          res.redirect("/login?error=pending_approval");
        } else {
          res.redirect("/login?error=google_failed");
        }
        return;
      }
      req.logIn(user, (loginErr) => {
        if (loginErr) { next(loginErr); return; }
        req.session.save((saveErr) => {
          if (saveErr) { res.redirect("/login?error=session_error"); return; }
          res.redirect("/");
        });
      });
    },
  )(req, res, next);
});

router.post("/auth/logout", (req, res, next) => {
  req.logout((err) => {
    if (err) {
      next(err);
      return;
    }
    req.session.destroy(() => {
      res.json({ ok: true });
    });
  });
});

router.get("/auth/me", (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  res.json(req.user);
});

const RegisterBody = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email(),
  phone: z.string().min(1).max(30),
  password: z.string().min(6),
  type: z.enum(["free_trial", "subscribed"]),
  groupName: z.string().optional(),
  companyName: z.string().optional(),
});

router.post("/auth/register", async (req, res) => {
  try {
    const parsed = RegisterBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
      return;
    }

    const { name, email, phone, password, type, groupName, companyName } = parsed.data;

    const [existingUser] = await db.select().from(usersTable).where(eq(usersTable.email, email));
    if (existingUser) {
      res.status(409).json({ error: "Email already registered" });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);

    if (type === "free_trial") {
      const [freePkg] = await db
        .select()
        .from(packagesTable)
        .where(eq(packagesTable.type, "free_trial"))
        .limit(1);

      if (!freePkg) {
        res.status(503).json({ error: "Free trial package not available. Please contact support." });
        return;
      }

      const groupUniqueName = `free_trial_${Date.now()}_${email.replace(/[^a-z0-9]/gi, "_")}`;
      const [group] = await db.insert(userGroupsTable).values({
        name: groupUniqueName,
        companyName: companyName ?? null,
        packageId: freePkg.id,
        isActive: false,
      }).returning();

      await db.insert(usersTable).values({
        name,
        email,
        phone,
        passwordHash,
        role: "user",
        isActive: false,
        pendingApproval: true,
        groupId: group.id,
        isGroupOwner: true,
      });

      res.status(201).json({ ok: true, message: "Registration submitted. Awaiting superadmin activation." });
    } else {
      if (!groupName) {
        res.status(400).json({ error: "Group name is required for subscribed users" });
        return;
      }

      const [group] = await db.select().from(userGroupsTable).where(eq(userGroupsTable.name, groupName));
      if (!group) {
        res.status(404).json({ error: "Group not found. Please check the group name or contact your administrator." });
        return;
      }

      const [pkg] = group.packageId
        ? await db.select().from(packagesTable).where(eq(packagesTable.id, group.packageId))
        : [null];

      if (pkg) {
        const { count: countFn } = await import("drizzle-orm");
        const [{ total }] = await db
          .select({ total: countFn() })
          .from(usersTable)
          .where(eq(usersTable.groupId, group.id));
        if (Number(total) >= pkg.maxTotalUsers) {
          res.status(429).json({ error: "This group has reached its maximum user limit." });
          return;
        }
      }

      const [existingOwner] = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.groupId, group.id));

      const isFirstMember = !existingOwner;

      await db.insert(usersTable).values({
        name,
        email,
        phone,
        companyName: companyName ?? group.companyName ?? null,
        passwordHash,
        role: "user",
        isActive: false,
        pendingApproval: true,
        groupId: group.id,
        isGroupOwner: isFirstMember,
      });

      res.status(201).json({ ok: true, message: "Registration submitted. Awaiting activation." });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
