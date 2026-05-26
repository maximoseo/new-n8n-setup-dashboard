import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AuthError, AuthShell, AuthSuccess } from "./AuthShell";
import { isSupabaseConfigured, requireSupabaseClient } from "../lib/supabase";
import { SetupRequiredPage } from "./SetupRequiredPage";

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  if (!isSupabaseConfigured) {
    return <SetupRequiredPage />;
  }

  async function updatePassword() {
    setError("");
    setSuccess("");
    const { error } = await requireSupabaseClient().auth.updateUser({ password });
    if (error) {
      setError(error.message);
      return;
    }
    setSuccess("Password updated. Redirecting...");
    setTimeout(() => navigate("/"), 900);
  }

  return (
    <AuthShell title="Choose a new password" subtitle="Enter a new password for your dashboard account.">
      <AuthError message={error} />
      <AuthSuccess message={success} />
      <div className="space-y-3">
        <input className="input" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="New password" />
        <button className="btn-primary w-full" onClick={() => void updatePassword()}>
          Update Password
        </button>
      </div>
    </AuthShell>
  );
}
