import { FormEvent, useState } from "react";
import { api } from "@/api/client";
import { IngestJob } from "@/types/domain";

type Props = {
  onNewJob?: (job: IngestJob) => void;
  embedded?: boolean;
};

export function IngestionPanel({ onNewJob, embedded = false }: Props) {
  const [sourcePath, setSourcePath] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const job = await api.ingestDocuments({ sourcePath });
      onNewJob?.(job);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start ingestion job");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className={embedded ? "ingestion-embedded" : "panel"}>
      {embedded ? <h3>Document Ingestion</h3> : <h2>Document Ingestion</h2>}
      <p>Trigger corpus ingestion from a backend-managed filesystem path.</p>
      <form onSubmit={onSubmit} className="stack">
        <label>
          Source Path
          <input
            value={sourcePath}
            onChange={(e) => setSourcePath(e.target.value)}
            placeholder="e.g., /data/projects/2025"
            required
          />
        </label>
        <button type="submit" disabled={loading}>
          {loading ? "Submitting..." : "Start Ingestion"}
        </button>
      </form>
      {error ? <p className="error">{error}</p> : null}
    </section>
  );
}
