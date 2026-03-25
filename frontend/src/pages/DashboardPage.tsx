import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { api } from "@/api/client";
import { AdminDocument } from "@/types/domain";

type EngineStatus = {
  initialized: boolean;
  total_chunks: number;
  total_documents: number;
  registry_documents: number;
  error?: string;
};

export function DashboardPage() {
  const [docs, setDocs] = useState<AdminDocument[]>([]);
  const [status, setStatus] = useState<EngineStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.getAdminDocuments().then(res => res.documents),
      api.getStatus()
    ]).then(([d, s]) => {
      setDocs(d ?? []);
      setStatus(s);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const totalIndexed = useMemo(() => docs.filter(d => d.indexed).length, [docs]);
  const missingIndex = useMemo(() => docs.filter(d => !d.indexed).length, [docs]);
  const recentAdds = useMemo(() => {
    return [...docs].sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()).slice(0, 5);
  }, [docs]);

  return (
    <div className="admin-page-stack" style={{ paddingBottom: '40px' }}>
      <div className="admin-page-hero panel scholar-panel">
        <div>
          <h2>System Analytics Dashboard</h2>
          <p className="muted">Live telemetry and KPIs for the Academic Semantic Search Engine.</p>
        </div>
      </div>
      
      {loading ? (
        <div style={{ padding: '0 20px' }}><p className="muted">Loading telemetry metrics...</p></div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px', padding: '0 20px' }}>
            <div className="panel" style={{ padding: '24px', borderTop: '4px solid var(--primary-color)' }}>
              <h3 style={{ margin: '0 0 8px 0', fontSize: '14px', color: 'var(--muted-color)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Documents</h3>
              <p style={{ fontSize: '36px', fontWeight: 700, margin: 0, color: 'var(--text-color)' }}>{docs.length}</p>
            </div>
            <div className="panel" style={{ padding: '24px', borderTop: '4px solid #0f9d58' }}>
              <h3 style={{ margin: '0 0 8px 0', fontSize: '14px', color: 'var(--muted-color)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Searchable Ready</h3>
              <p style={{ fontSize: '36px', fontWeight: 700, margin: 0, color: '#0f9d58' }}>{totalIndexed}</p>
            </div>
            <div className="panel" style={{ padding: '24px', borderTop: missingIndex > 0 ? '4px solid #db4437' : '4px solid #f4b400' }}>
              <h3 style={{ margin: '0 0 8px 0', fontSize: '14px', color: 'var(--muted-color)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Missing Vectors</h3>
              <p style={{ fontSize: '36px', fontWeight: 700, margin: 0, color: missingIndex > 0 ? '#db4437' : '#f4b400' }}>{missingIndex}</p>
            </div>
            <div className="panel" style={{ padding: '24px', borderTop: '4px solid #4285f4' }}>
              <h3 style={{ margin: '0 0 8px 0', fontSize: '14px', color: 'var(--muted-color)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Semantic Chunks</h3>
              <p style={{ fontSize: '36px', fontWeight: 700, margin: 0, color: '#4285f4' }}>{status?.total_chunks || 0}</p>
            </div>
          </div>
          
          <div style={{ padding: '0 20px', marginTop: '20px', display: 'grid', gridTemplateColumns: '1fr', gap: '20px' }}>
            <div className="panel">
              <h3 style={{ marginTop: 0, marginBottom: '16px' }}>Recently Extracted Ingestions</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {recentAdds.map(doc => (
                  <div key={doc.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', border: '1px solid var(--border-color)', borderRadius: '8px', background: 'var(--surface-color, #ffffff)' }}>
                    <div>
                      <strong style={{ display: 'block', fontSize: '15px', color: 'var(--text-color)', marginBottom: '4px' }}>{doc.title}</strong>
                      <span style={{ fontSize: '13px', color: 'var(--muted-color)' }}>{doc.author || 'Unknown Author'} • {doc.year || 'N/A'}</span>
                    </div>
                    <div style={{ fontSize: '12px', padding: '4px 8px', borderRadius: '12px', background: doc.indexed ? '#e6f4ea' : '#fce8e6', color: doc.indexed ? '#137333' : '#c5221f', fontWeight: 600 }}>
                      {doc.indexed ? "Active in DB" : "Awaiting Vector Build"}
                    </div>
                  </div>
                ))}
                {recentAdds.length === 0 && <p className="muted">No documents found. Head over to the admin controls to upload some!</p>}
              </div>
              <div style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px solid var(--border-color)' }}>
                <Link to="/admin" style={{ color: 'var(--primary-color)', textDecoration: 'none', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  Open Content Administrator 
                  <span aria-hidden="true">&rarr;</span>
                </Link>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}