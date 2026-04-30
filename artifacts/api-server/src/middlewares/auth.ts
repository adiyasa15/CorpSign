import { Request, Response, NextFunction } from "express";

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  next();
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }
    if (!roles.includes(req.user!.role)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    next();
  };
}

export function requireSuperAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  if (req.user!.role !== "superadmin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  next();
}

export function requireAdminOrSuperAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  const role = req.user!.role;
  if (role !== "admin" && role !== "superadmin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  next();
}
