import { Settings } from "lucide-react";

export function SetupRequiredPage() {
  return (
    <div className="grid min-h-screen place-items-center bg-paper px-4 py-10 text-ink">
      <div className="w-full max-w-[680px] rounded-md border border-line bg-surface p-6 shadow-shell">
        <div className="mb-5 flex items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-md bg-ink text-sm font-black text-paper">NS</div>
          <div>
            <h1 className="text-2xl font-black">Supabase setup required</h1>
            <p className="text-sm text-slate">Authentication and database storage are enabled, but credentials are not configured yet.</p>
          </div>
        </div>
        <div className="rounded-md border border-line bg-paper p-4 text-sm leading-7 text-slate">
          <p className="mb-3 flex items-center gap-2 font-black text-ink">
            <Settings size={17} />
            Required environment variables
          </p>
          <code className="block">VITE_SUPABASE_URL</code>
          <code className="block">VITE_SUPABASE_ANON_KEY</code>
          <code className="block">SUPABASE_URL</code>
          <code className="block">SUPABASE_SERVICE_ROLE_KEY</code>
        </div>
        <p className="mt-4 text-sm text-slate">
          After setting these in Render and applying the migration in `supabase/migrations/001_create_tables.sql`, redeploy the service.
        </p>
      </div>
    </div>
  );
}
