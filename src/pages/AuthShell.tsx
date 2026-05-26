import { Link } from "react-router-dom";
import type { ReactNode } from "react";
import { ThemeToggle } from "../components/ThemeToggle";

export function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="grid min-h-screen place-items-center bg-paper px-4 py-10 text-ink">
      <div className="absolute right-5 top-5">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-[440px] rounded-md border border-line bg-surface p-6 shadow-shell">
        <div className="mb-6 text-center">
          <Link to="/" className="mx-auto grid h-12 w-12 place-items-center rounded-md bg-ink text-sm font-black text-paper">
            NS
          </Link>
          <h1 className="mt-4 text-2xl font-black">{title}</h1>
          <p className="mt-1 text-sm leading-6 text-slate">{subtitle}</p>
        </div>
        {children}
      </div>
    </div>
  );
}

export function AuthError({ message }: { message: string }) {
  if (!message) return null;
  return <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">{message}</div>;
}

export function AuthSuccess({ message }: { message: string }) {
  if (!message) return null;
  return <div className="mb-4 rounded-md border border-green-200 bg-green-50 p-3 text-sm font-bold text-green-700 dark:border-green-900 dark:bg-green-950/40 dark:text-green-200">{message}</div>;
}

export function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.56 2.7-3.86 2.7-6.62z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.35 0-4.34-1.58-5.05-3.72H.96v2.34A9 9 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.95 10.7A5.41 5.41 0 0 1 3.67 9c0-.59.1-1.16.28-1.7V4.96H.96A9 9 0 0 0 0 9c0 1.45.35 2.82.96 4.04l2.99-2.34z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.43 1.34l2.58-2.58C13.46.9 11.43 0 9 0A9 9 0 0 0 .96 4.96L3.95 7.3C4.66 5.16 6.65 3.58 9 3.58z" />
    </svg>
  );
}
