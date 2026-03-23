import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { AdminIngestionPanel } from "@/components/AdminIngestionPanel";
import { AdminIndexStatus } from "@/components/AdminIndexStatus";
import { AdminDocumentList } from "@/components/AdminDocumentList";

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
    <>
      <nav className="admin-nav">
        <Link to="/search" className="admin-back-link">Back to search</Link>
      </nav>
      <AdminIndexStatus refreshKey={refreshKey} />
      <AdminDocumentList refreshKey={refreshKey} onCacheReset={triggerRefresh} />
      <AdminIngestionPanel
        isAdmin={isAdmin}
        onUploadSuccess={triggerRefresh}
      />
    </>
  );
}
