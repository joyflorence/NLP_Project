import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { AdminInviteEntry } from "../types/domain";

type Props = {
  refreshKey?: number;
  onActionComplete?: () => void;
};

function formatDate(value?: string | null) {
  if (!value) return "Unknown";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(parsed);
}

export function AdminInviteManager({ refreshKey = 0, onActionComplete }: Props) {
  const [invites, setInvites] = useState<AdminInviteEntry[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [actionStatus, setActionStatus] = useState<"idle" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const [busyEmail, setBusyEmail] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function load() {
      setStatus("loading");
      setMessage("");
      setActionStatus("idle");
      try {
        const response = await api.getAdminInvites(25);
        if (!mounted) return;
        setInvites(response.invites ?? []);
        setStatus("idle");
      } catch (error) {
        if (!mounted) return;
        setInvites([]);
        setStatus("error");
        setMessage(error instanceof Error ? error.message : "Failed to load pending invites.");
      }
    }

    void load();

    return () => {
      mounted = false;
    };
  }, [refreshKey]);

  const handleAction = async (email: string, mode: "resend" | "cancel") => {
    setBusyEmail(email);
    setMessage("");
    try {
      const response = mode === "resend" ? await api.resendAdminInvite(email) : await api.cancelAdminInvite(email);
      setMessage(response.message);
      setActionStatus("success");
      onActionComplete?.();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to update invite.");
      setActionStatus("error");
    } finally {
      setBusyEmail(null);
    }
  };

  return (
    <section className="panel admin-invite-panel">
      <header className="panel-header admin-invite-header">
        <div>
          <h2>Pending Admin Invites</h2>
          <p>Track invites that have not been accepted yet. Resend them or cancel them if they are no longer needed.</p>
        </div>
      </header>

      <div className="admin-invite-body">
        {status === "loading" ? <div className="admin-audit-empty"><strong>Loading invites</strong><span>Checking auth for pending admin invitations.</span></div> : null}
        {status === "error" ? <div className="admin-member-message error">{message}</div> : null}
        {message && actionStatus === "success" ? <div className="admin-member-message success">{message}</div> : null}
        {message && actionStatus === "error" ? <div className="admin-member-message error">{message}</div> : null}

        {!invites.length && status !== "loading" ? (
          <div className="admin-audit-empty">
            <strong>No pending admin invites</strong>
            <span>All admin invitations have been accepted, cancelled, or not yet created.</span>
          </div>
        ) : null}

        <div className="admin-invite-list">
          {invites.map((invite) => (
            <article key={invite.userId} className="admin-invite-card">
              <div className="admin-invite-card-top">
                <div>
                  <strong>{invite.displayName}</strong>
                  <p>{invite.email}</p>
                </div>
                <span className="admin-invite-pill">Pending</span>
              </div>
              <div className="admin-invite-meta">
                <span>Invited: {formatDate(invite.invitedAt || invite.createdAt)}</span>
                <span>Last sign in: {invite.lastSignInAt ? formatDate(invite.lastSignInAt) : "Not yet"}</span>
              </div>
              <div className="admin-invite-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => handleAction(invite.email, "resend")}
                  disabled={busyEmail === invite.email}
                >
                  {busyEmail === invite.email ? "Working..." : "Resend Invite"}
                </button>
                <button
                  type="button"
                  className="secondary-button danger"
                  onClick={() => handleAction(invite.email, "cancel")}
                  disabled={busyEmail === invite.email}
                >
                  Cancel Invite
                </button>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
