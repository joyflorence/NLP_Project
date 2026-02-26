import { useEffect, useState } from "react";
import { api } from "@/api/client";
import { EvaluationResponse } from "@/types/domain";
import { MetricsTable } from "./MetricsTable";

export function EvaluationPanel() {
  const [data, setData] = useState<EvaluationResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getEvaluation()
      .then((res) => setData(res))
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load metrics"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <section className="panel">
      <h2>Evaluation: Semantic vs Keyword</h2>
      {loading ? <p>Loading metrics...</p> : null}
      {error ? <p className="error">{error}</p> : null}
      {data ? (
        <>
          <MetricsTable rows={data.metrics} />
          {data.note ? <p>{data.note}</p> : null}
        </>
      ) : null}
    </section>
  );
}