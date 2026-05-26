import { useState } from "react";
import { Link } from "react-router-dom";
import { AuthError, AuthShell, AuthSuccess, GoogleIcon } from "./AuthShell";
import { isSupabaseConfigured, requireSupabaseClient } from "../lib/supabase";
import { SetupRequiredPage } from "./SetupRequiredPage";

export function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  if (!isSupabaseConfigured) {
    return <SetupRequiredPage />;
  }

  async function signUp() {
    setLoading(true);
    setError("");
    setSuccess("");
    const { error } = await requireSupabaseClient().auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` }
    });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    setSuccess("Check your email to confirm your account.");
  }

  async function signUpWithGoogle() {
    setError("");
    const { error } = await requireSupabaseClient().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` }
    });
    if (error) setError(error.message);
  }

  return (
    <AuthShell title="Create account" subtitle="Start onboarding sites into the automated n8n pipeline.">
      <AuthError message={error} />
      <AuthSuccess message={success} />
      <div className="space-y-3">
        <input className="input" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email" />
        <input className="input" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Password" />
        <button className="btn-primary w-full" disabled={loading} onClick={() => void signUp()}>
          {loading ? "Creating..." : "Sign Up"}
        </button>
      </div>
      <div className="my-5 flex items-center gap-3 text-xs font-bold text-slate">
        <span className="h-px flex-1 bg-line" />
        or
        <span className="h-px flex-1 bg-line" />
      </div>
      <button className="btn-secondary w-full" onClick={() => void signUpWithGoogle()}>
        <GoogleIcon />
        Sign up with Google
      </button>
      <p className="mt-5 text-center text-sm font-bold text-slate">
        Already have an account?{" "}
        <Link className="text-primary underline" to="/login">
          Log in
        </Link>
      </p>
    </AuthShell>
  );
}
