import { useEffect, useState } from "react";
import { api } from "@/api/client";
import { AdminIngestJobSummary } from "@/types/domain";

type Props = {
  refreshKey?: number;
};

export function AdminIngestJobs({ refreshKey = 0 }: Props) {
  const [jobs, setJobs] = useState<AdminIngestJobSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <section className="panel scholar-panel">
      <h2>Recent Ingest Activity</h2>
      {loading ? <div className="loading-state-card compact-loading-state"><strong>Loading ingest activity...</strong><p>Fetching recent upload and indexing jobs.</p></div> : null}
      {error ? <p className="error">{error}</p> : null}
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
