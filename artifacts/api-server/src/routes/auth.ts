import { Router } from "express";
import passport from "../lib/passport";

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

export default router;
