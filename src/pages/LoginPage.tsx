import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AuthError, AuthShell, GoogleIcon } from "./AuthShell";
import { isSupabaseConfigured, requireSupabaseClient } from "../lib/supabase";
import { SetupRequiredPage } from "./SetupRequiredPage";

export function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  if (!isSupabaseConfigured) {
    return <SetupRequiredPage />;
  }

  async function signIn() {
    setLoading(true);
    setError("");
    const { error } = await requireSupabaseClient().auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    navigate("/");
  }

  async function signInWithGoogle() {
    setError("");
    const { error } = await requireSupabaseClient().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` }
    });
    if (error) setError(error.message);
  }

  return (
    <AuthShell title="Sign in" subtitle="Access your new site onboarding workspace.">
      <AuthError message={error} />
      <div className="space-y-3">
        <input className="input" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email" />
        <input className="input" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Password" />
        <button className="btn-primary w-full" disabled={loading} onClick={() => void signIn()}>
          {loading ? "Signing in..." : "Sign In"}
        </button>
      </div>
      <div className="my-5 flex items-center gap-3 text-xs font-bold text-slate">
        <span className="h-px flex-1 bg-line" />
        or
        <span className="h-px flex-1 bg-line" />
      </div>
      <button className="btn-secondary w-full" onClick={() => void signInWithGoogle()}>
        <GoogleIcon />
        Sign in with Google
      </button>
      <div className="mt-5 flex items-center justify-between text-sm font-bold">
        <Link className="text-primary underline" to="/forgot-password">
          Forgot password?
        </Link>
        <Link className="text-primary underline" to="/signup">
          Create account
        </Link>
      </div>
    </AuthShell>
  );
}
