// ── Authorization guards ────────────────────────────────────────────────────
// Deliberately a leaf module (it imports nothing from ./index, ./middleware or
// the routers) so those modules can require it without creating a circular
// import — a cycle here would evaluate the guard as `undefined` at
// registration time and Express would reject the route.
import { Request, RequestHandler, Response, NextFunction } from "express"

/**
 * Only the bootstrap `admin` account may manage users or export the raw
 * SQLite files. Must run AFTER authenticateMiddleware so `req.user` is set.
 */
export const requireAdmin: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
    if (req.user !== "admin") return res.status(403).json({ error: "Admin access required" })
    next()
}
