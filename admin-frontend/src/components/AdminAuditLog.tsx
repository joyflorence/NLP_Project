import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { AdminAuditLogEntry } from "../types/domain";

type Props = {
  refreshKey?: number;
};

function formatAction(action: string) {
  return action
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatStatus(status: string) {
  if (status === "noop") return "No Change";
  return status
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatTime(createdAt?: string | null) {
  if (!createdAt) return "Just now";
  const value = new Date(createdAt);
  if (Number.isNaN(value.getTime())) return createdAt;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(value);
}

function statusClass(status: string) {
  if (status === "revoked" || status === "failed") return "is-danger";
  if (status === "invited" || status === "promoted" || status === "created") return "is-success";
  return "is-neutral";
}

export function AdminAuditLog({ refreshKey = 0 }: Props) {
  const [entries, setEntries] = useState<AdminAuditLogEntry[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [message, setMessage] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let mounted = true;

    async function load() {
      setStatus("loading");
      setMessage("");
      try {
        const response = await api.getAdminAuditLog(20);
        if (!mounted) return;
        setEntries(response.entries ?? []);
        setStatus("idle");
      } catch (error) {
        if (!mounted) return;
        setEntries([]);
        setStatus("error");
        setMessage(error instanceof Error ? error.message : "Failed to load admin activity.");
      }
    }

    void load();

    return () => {
      mounted = false;
    };
  }, [refreshKey, reloadKey]);

  return (
    <section className="panel admin-audit-panel">
      <header className="panel-header admin-audit-header">
        <div>
          <h2>Admin Audit Log</h2>
          <p>Recent admin actions across promotions, invites, and revocations.</p>
        </div>
        <button
          type="button"
          className="secondary-button admin-audit-refresh"
          onClick={() => setReloadKey((current) => current + 1)}
          disabled={status === "loading"}
        >
          {status === "loading" ? "Refreshing..." : "Refresh"}
        </button>
      </header>

      <div className="admin-audit-content">
        {status === "loading" && entries.length === 0 ? (
          <div className="admin-audit-empty">
            <strong>Loading audit log</strong>
            <span>Fetching the latest admin activity.</span>
          </div>
        ) : null}

        {status === "error" ? <div className="admin-member-message error">{message}</div> : null}

        {!message && entries.length === 0 && status !== "loading" ? (
          <div className="admin-audit-empty">
            <strong>No audit activity yet</strong>
            <span>Admin actions will appear here after promotions, invites, or revocations.</span>
          </div>
        ) : null}

        <div className="admin-audit-list">
          {entries.map((entry) => (
            <article key={entry.activityId} className="admin-audit-item">
              <div className="admin-audit-item-top">
                <div className="admin-audit-title-row">
                  <span className={`admin-audit-status ${statusClass(entry.status)}`}>{formatStatus(entry.status)}</span>
                  <strong>{formatAction(entry.action)}</strong>
                </div>
                <time className="admin-audit-time">{formatTime(entry.createdAt)}</time>
              </div>
              <p className="admin-audit-message">{entry.message}</p>
              <div className="admin-audit-meta">
                <span className="admin-audit-actor">{entry.actor || "System"}</span>
                <span className="admin-audit-id">{entry.activityId}</span>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
