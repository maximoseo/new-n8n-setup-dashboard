import type { NextFunction, Request, Response } from "express";
import { isSupabaseConfigured, requireSupabaseAdmin } from "./supabaseAdmin.js";

declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

export async function authMiddleware(request: Request, response: Response, next: NextFunction) {
  if (!isSupabaseConfigured) {
    response.status(503).json({
      error: "Supabase is not configured",
      details: "Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY on the server."
    });
    return;
  }

  const token = request.headers.authorization?.replace(/^Bearer\s+/i, "");
  if (!token) {
    response.status(401).json({ error: "Authentication required" });
    return;
  }

  const supabase = requireSupabaseAdmin();
  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data.user) {
    response.status(401).json({ error: "Invalid or expired token" });
    return;
  }

  request.userId = data.user.id;
  next();
}
