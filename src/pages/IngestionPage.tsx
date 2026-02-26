import { useState } from "react";
import { IngestionPanel } from "@/components/IngestionPanel";
import { IngestJob } from "@/types/domain";

export function IngestionPage() {
  const [job, setJob] = useState<IngestJob | null>(null);

  return (
    <>
      <IngestionPanel onNewJob={setJob} />
      {job ? (
        <section className="panel status">
          <h2>Ingestion Job</h2>
          <p>
            Job <code>{job.jobId}</code> status: <strong>{job.status}</strong>
          </p>
          <p>
            Progress: {job.processedCount ?? 0} / {job.totalCount ?? "?"}
          </p>
          {job.message ? <p>{job.message}</p> : null}
        </section>
      ) : null}
    </>
  );
}