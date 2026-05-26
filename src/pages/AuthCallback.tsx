import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AuthShell } from "./AuthShell";
import { isSupabaseConfigured, requireSupabaseClient } from "../lib/supabase";
import { SetupRequiredPage } from "./SetupRequiredPage";

export function AuthCallback() {
  const navigate = useNavigate();
  const [message, setMessage] = useState("Completing authentication...");

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    const client = requireSupabaseClient();
    const code = new URLSearchParams(window.location.search).get("code");
    const sessionPromise = code ? client.auth.exchangeCodeForSession(code) : client.auth.getSession();

    sessionPromise
      .then(({ data, error }) => {
        if (error || !data.session) {
          setMessage(error?.message ?? "No active session was found.");
          return;
        }
        navigate("/");
      })
      .catch((error: Error) => setMessage(error.message));
  }, [navigate]);

  if (!isSupabaseConfigured) {
    return <SetupRequiredPage />;
  }

  return (
    <AuthShell title="Authentication" subtitle="Securely returning you to the dashboard.">
      <p className="text-center text-sm font-bold text-slate">{message}</p>
    </AuthShell>
  );
}
