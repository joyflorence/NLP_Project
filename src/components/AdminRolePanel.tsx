import { FormEvent, useState } from "react";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

export function AdminRolePanel() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function run(action: "assign" | "revoke") {
    setError(null);
    setNotice(null);

    const target = email.trim().toLowerCase();
    if (!target) {
      setError("Provide an email address.");
      return;
    }

    if (!isSupabaseConfigured || !supabase) {
      setError("Supabase is not configured.");
      return;
    }

    setLoading(true);
    try {
      const fn = action === "assign" ? "assign_admin_role" : "revoke_admin_role";
      const { error: rpcError } = await supabase.rpc(fn, { target_email: target });
      if (rpcError) throw rpcError;
      setNotice(action === "assign" ? `Admin role assigned to ${target}.` : `Admin role revoked from ${target}.`);
      setEmail("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Role update failed.");
    } finally {
      setLoading(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void run("assign");
  }

  return (
    <section className="panel scholar-panel">
      <h2>Admin Role Management</h2>
      <p className="muted">Assign or revoke admin access using secure RPC functions.</p>

      <form className="stack" onSubmit={onSubmit}>
        <label>
          User Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="user@example.com" required />
        </label>

        <div className="admin-actions-row">
          <button type="submit" disabled={loading}>
            {loading ? "Please wait..." : "Assign Admin"}
          </button>
          <button type="button" onClick={() => void run("revoke")} disabled={loading}>
            Revoke Admin
          </button>
        </div>
      </form>

      {error ? <p className="error">{error}</p> : null}
      {notice ? <p className="auth-note">{notice}</p> : null}
    </section>
  );
}