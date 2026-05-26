import { useState } from "react";
import { Link } from "react-router-dom";
import { AuthError, AuthShell, AuthSuccess } from "./AuthShell";
import { isSupabaseConfigured, requireSupabaseClient } from "../lib/supabase";
import { SetupRequiredPage } from "./SetupRequiredPage";

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  if (!isSupabaseConfigured) {
    return <SetupRequiredPage />;
  }

  async function resetPassword() {
    setError("");
    setSuccess("");
    const { error } = await requireSupabaseClient().auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`
    });
    if (error) {
      setError(error.message);
      return;
    }
    setSuccess("Password reset email sent.");
  }

  return (
    <AuthShell title="Reset password" subtitle="Send a secure password reset link to your email.">
      <AuthError message={error} />
      <AuthSuccess message={success} />
      <div className="space-y-3">
        <input className="input" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email" />
        <button className="btn-primary w-full" onClick={() => void resetPassword()}>
          Send Reset Email
        </button>
      </div>
      <Link className="mt-5 block text-center text-sm font-bold text-primary underline" to="/login">
        Back to login
      </Link>
    </AuthShell>
  );
}
