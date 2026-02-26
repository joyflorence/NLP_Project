import { Link } from "react-router-dom";

export function DashboardPage() {
  return (
    <section className="panel">
      <h2>Project Overview</h2>
      <p>This frontend provides ingestion, semantic retrieval, related-work discovery, and evaluation views.</p>
      <div className="quick-links">
        <Link to="/ingestion">Go to Ingestion</Link>
        <Link to="/search">Go to Search</Link>
        <Link to="/evaluation">Go to Evaluation</Link>
      </div>
      <ul>
        <li>Natural language search with relevance ranking</li>
        <li>Document similarity recommendations</li>
        <li>Semantic vs keyword baseline comparison metrics</li>
        <li>Typed API services with optional mock mode</li>
      </ul>
    </section>
  );
}