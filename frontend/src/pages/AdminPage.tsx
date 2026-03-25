import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { AdminIngestionPanel } from "@/components/AdminIngestionPanel";
import { AdminIndexStatus } from "@/components/AdminIndexStatus";
import { AdminDocumentList } from "@/components/AdminDocumentList";
import { AdminIngestJobs } from "@/components/AdminIngestJobs";

type Props = {
  isAdmin: boolean;
};

export function AdminPage({ isAdmin }: Props) {
  const [refreshKey, setRefreshKey] = useState(0);

  if (!isAdmin) {
    return <Navigate to="/search" replace />;
  }

  function triggerRefresh() {
    setRefreshKey((k) => k + 1);
  }

  return (
    <div className="admin-page-stack">
      <nav className="admin-nav">
        <Link to="/search" className="admin-back-link">Back to search</Link>
      </nav>
      <div className="admin-page-hero panel scholar-panel">
        <div>
          <h2>Admin Workspace</h2>
          <p className="muted">Manage indexed documents, monitor the engine, and upload new material for search.</p>
        </div>
      </div>
      <AdminIndexStatus refreshKey={refreshKey} />
      <AdminIngestJobs refreshKey={refreshKey} />
      <AdminDocumentList refreshKey={refreshKey} onCacheReset={triggerRefresh} />
      <AdminIngestionPanel
        isAdmin={isAdmin}
        onUploadSuccess={triggerRefresh}
      />
    </div>
  );
}
