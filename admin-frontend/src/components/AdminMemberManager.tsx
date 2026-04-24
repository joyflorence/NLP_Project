import { FormEvent, useState } from "react";
import { api } from "../api/client";

type ActionMode = "promote" | "invite" | "revoke";

type Props = {
  onActionComplete?: () => void;
};

export function AdminMemberManager({ onActionComplete }: Props) {
  const [email, setEmail] = useState("");
  const [action, setAction] = useState<ActionMode>("promote");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const [resultKind, setResultKind] = useState<"promoted" | "created" | "invited" | "revoked" | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const targetEmail = email.trim();
    if (!targetEmail) return;

    setStatus("loading");
    setMessage("");
    setResultKind(null);

    try {
      const response =
        action === "invite"
          ? await api.inviteAdminMember(targetEmail)
          : action === "revoke"
            ? await api.revokeAdminMember(targetEmail)
            : await api.promoteToAdmin(targetEmail);
      const lowered = (response.message || "").toLowerCase();
      const kind = lowered.includes("created a new admin account")
        ? "created"
        : lowered.includes("invitation sent")
          ? "invited"
          : lowered.includes("revoked admin privileges")
            ? "revoked"
            : "promoted";
      setStatus("success");
      setResultKind(kind);
      setMessage(response.message || (kind === "created" ? "Created a new admin account." : kind === "invited" ? "Invitation sent." : kind === "revoked" ? "Admin privileges revoked." : "Successfully updated admin access."));
      setEmail("");
      onActionComplete?.();
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Failed to update admin access.");
    }
  };

  const submitLabel =
    action === "invite" ? "Send Invite" : action === "revoke" ? "Revoke Admin" : "Promote to Admin";

  return (
    <section className="panel admin-member-panel" style={{ marginTop: "1.5rem" }}>
      <header className="panel-header">
        <h2>Add Admin Member</h2>
        <p>Promote an account, send a pending invite, or revoke admin access by email.</p>
      </header>

      <div style={{ padding: "0 1.5rem 1.5rem 1.5rem" }}>
        <form onSubmit={handleSubmit} className="admin-member-form">
          <div className="admin-member-field">
            <label htmlFor="adminEmail">User Email Address</label>
            <input
              id="adminEmail"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g. colleague@university.edu"
              required
              disabled={status === "loading"}
              className="admin-member-input"
            />
            <p className="muted admin-member-help">
              Promote updates an existing user immediately. Invite sends a pending admin invitation for a new account.
            </p>
          </div>

          <div className="admin-member-actions">
            <label htmlFor="adminAction">Action</label>
            <div className="admin-member-action-row">
              <select
                id="adminAction"
                value={action}
                onChange={(e) => setAction(e.target.value as ActionMode)}
                disabled={status === "loading"}
                className="admin-member-select"
              >
                <option value="promote">Promote existing user</option>
                <option value="invite">Send admin invite</option>
                <option value="revoke">Revoke admin access</option>
              </select>
              <button
                type="submit"
                className="action-button primary admin-member-submit"
                disabled={status === "loading" || !email.trim()}
              >
                {status === "loading" ? "Working..." : submitLabel}
              </button>
            </div>
          </div>
        </form>

        {message && (
          <div className={status === "success" ? "admin-member-message success" : "admin-member-message error"}>
            {status === "success" ? (
              <>
                <strong>
                  {resultKind === "created"
                    ? "New admin account created"
                    : resultKind === "invited"
                      ? "Admin invite sent"
                      : resultKind === "revoked"
                        ? "Admin access revoked"
                        : "Admin privileges updated"}
                </strong>
                <span>{message}</span>
              </>
            ) : (
              message
            )}
          </div>
        )}
      </div>
    </section>
  );
}
