import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { AdminIngestionPanel } from "@/components/AdminIngestionPanel";
import { AdminIndexStatus } from "@/components/AdminIndexStatus";
import { AdminDocumentList } from "@/components/AdminDocumentList";

type Props = {
  isAdmin: boolean;
};

export function AdminPage({ isAdmin }: Props) {
  const [docListRefreshKey, setDocListRefreshKey] = useState(0);

  if (!isAdmin) {
    return <Navigate to="/search" replace />;
  }

  return (
    <>
      <nav className="admin-nav">
        <Link to="/search">← Back to search</Link>
      </nav>
      <AdminIndexStatus />
      <AdminDocumentList refreshKey={docListRefreshKey} />
      <AdminIngestionPanel
        isAdmin={isAdmin}
        onUploadSuccess={() => setDocListRefreshKey((k) => k + 1)}
      />
    </>
  );
}
