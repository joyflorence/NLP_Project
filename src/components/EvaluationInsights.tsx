import { useEffect, useMemo, useState } from "react";
import { api } from "@/api/client";
import { EvaluationResponse } from "@/types/domain";

function maxMetricValue(data: EvaluationResponse | null) {
  if (!data?.metrics.length) return 1;
  return Math.max(...data.metrics.flatMap((m) => [m.semantic, m.keyword]), 1);
}

export function EvaluationInsights() {
  const [data, setData] = useState<EvaluationResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getEvaluation()
      .then((res) => setData(res))
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load evaluation metrics"))
      .finally(() => setLoading(false));
  }, []);

  const max = useMemo(() => maxMetricValue(data), [data]);

  return (
    <section className="panel scholar-panel">
      <h2>Evaluation Insights</h2>
      {loading ? <p>Loading metrics...</p> : null}
      {error ? <p className="error">{error}</p> : null}

      {data ? (
        <div className="metrics-chart">
          {data.metrics.map((m) => (
            <div className="metric-row" key={m.metricName}>
              <div className="metric-label">{m.metricName}</div>
              <div className="metric-bars">
                <div className="metric-track">
                  <div className="bar bar-semantic" style={{ width: `${(m.semantic / max) * 100}%` }} />
                </div>
                <span className="metric-value">S {m.semantic.toFixed(2)}</span>
                <div className="metric-track">
                  <div className="bar bar-keyword" style={{ width: `${(m.keyword / max) * 100}%` }} />
                </div>
                <span className="metric-value">K {m.keyword.toFixed(2)}</span>
              </div>
            </div>
          ))}
          {data.note ? <p className="muted">{data.note}</p> : null}
        </div>
      ) : null}
    </section>
  );
}