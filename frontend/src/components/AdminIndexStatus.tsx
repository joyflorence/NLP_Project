import { useEffect, useState } from "react";
import { api } from "@/api/client";

type Props = {
  refreshKey?: number;
};

export function AdminIndexStatus({ refreshKey = 0 }: Props) {
  const [status, setStatus] = useState<{
    initialized: boolean;
    total_chunks: number;
    total_documents: number;
    error?: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .getStatus()
      .then((data) => {
        if (!cancelled) setStatus(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load status.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  if (loading) {
    return (
      <section className="panel scholar-panel">
        <h2>Index Status</h2>
        <p className="muted">Loading...</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="panel scholar-panel">
        <h2>Index Status</h2>
        <p className="error">{error}</p>
      </section>
    );
  }

  return (
    <section className="panel scholar-panel">
      <h2>Index Status</h2>
      <div className="index-status-grid">
        <div className="index-status-item">
          <span className="index-status-label">Engine</span>
          <span className={status?.initialized ? "index-status-ok" : "index-status-error"}>
            {status?.initialized ? "Ready" : "Not initialized"}
          </span>
        </div>
        <div className="index-status-item">
          <span className="index-status-label">Documents</span>
          <span className="index-status-value">{status?.total_documents ?? 0}</span>
        </div>
        <div className="index-status-item">
          <span className="index-status-label">Chunks</span>
          <span className="index-status-value">{status?.total_chunks ?? 0}</span>
        </div>
      </div>
      {status?.error ? <p className="error">{status.error}</p> : null}
    </section>
  );
}
