import { EvaluationMetrics } from "@/types/domain";
import "./MetricsTable.css";

type Props = {
  rows: EvaluationMetrics[];
};

export function MetricsTable({ rows }: Props) {
  return (
    <table className="metrics-table">
      <thead>
        <tr>
          <th>Metric</th>
          <th>Semantic</th>
          <th>Keyword</th>
          <th>Delta</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const delta = row.semantic - row.keyword;
          return (
            <tr key={row.metricName}>
              <td>{row.metricName}</td>
              <td>{row.semantic.toFixed(4)}</td>
              <td>{row.keyword.toFixed(4)}</td>
              <td className={delta >= 0 ? "positive" : "negative"}>{delta.toFixed(4)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}