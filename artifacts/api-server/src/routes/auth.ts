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
      res.json({ id: user.id, email: user.email, name: user.name, role: user.role });
    });
  })(req, res, next);
});

router.get("/auth/google", passport.authenticate("google", { scope: ["profile", "email"] }));

router.get(
  "/auth/google/callback",
  passport.authenticate("google", { failureRedirect: "/?auth=failed" }),
  (req, res) => {
    res.redirect("/");
  },
);

router.post("/auth/logout", (req, res, next) => {
  req.logout((err) => {
    if (err) {
      next(err);
      return;
    }
    res.json({ ok: true });
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
