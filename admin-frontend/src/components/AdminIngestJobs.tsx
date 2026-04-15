import { useEffect, useState } from "react";
import { api } from "../api/client";
import { AdminIngestJobSummary } from "../types/domain";

type Props = {
  refreshKey?: number;
};

function formatActivityTime(value?: string | null) {
  if (!value) return "Just now";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Just now";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function AdminIngestJobs({ refreshKey = 0 }: Props) {
  const [jobs, setJobs] = useState<AdminIngestJobSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .getAdminIngestJobs()
      .then((res) => {
        if (!cancelled) setJobs(res.jobs ?? []);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load ingest jobs.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  async function handleClearHistory() {
    const confirmed = window.confirm("Clear recent ingest activity history? This will only remove the activity log, not indexed documents or stored files.");
    if (!confirmed) return;
    setClearing(true);
    setError(null);
    setNotice(null);
    try {
      const res = await api.clearAdminIngestJobs();
      setJobs([]);
      setNotice(res.message || "Recent ingest activity cleared.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to clear recent activity.");
    } finally {
      setClearing(false);
    }
  }

  return (
    <section className="panel scholar-panel">
      <div className="admin-list-header">
        <div>
          <h2>Recent Ingest Activity</h2>
          <p className="muted">Recent upload and indexing history stored by the backend.</p>
        </div>
        <button type="button" className="search-secondary-action" onClick={handleClearHistory} disabled={clearing || loading || jobs.length === 0}>
          {clearing ? "Clearing..." : "Clear history"}
        </button>
      </div>
      {loading ? <div className="loading-state-card compact-loading-state"><strong>Loading ingest activity...</strong><p>Fetching recent upload and indexing jobs.</p></div> : null}
      {error ? <p className="error">{error}</p> : null}
      {notice ? <p className="muted">{notice}</p> : null}
      {!loading && !error && jobs.length === 0 ? (
        <div className="empty-state admin-empty-state"><strong>No recent ingest jobs.</strong><p>New uploads and indexing work will appear here.</p></div>
      ) : null}
      {!loading && !error && jobs.length > 0 ? (
        <ul className="admin-job-list">
          {jobs.map((job) => (
            <li key={job.jobId} className="admin-job-item">
              <div>
                <strong>{job.title || job.jobId}</strong>
                <p className="muted">{job.message || "No status message."}</p>
                <p className="muted admin-job-meta">{formatActivityTime(job.createdAt)}{job.source ? ` ? ${job.source}` : ""}</p>
              </div>
              <span className={job.status === "completed" ? "job-status job-status-success" : job.status === "failed" ? "job-status job-status-error" : "job-status"}>
                {job.status}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}