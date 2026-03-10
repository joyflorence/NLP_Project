import { useEffect, useState } from "react";
import { api } from "@/api/client";

type IndexedDoc = { filename: string; pages?: number; chunks?: number };

type Props = {
  refreshKey?: number;
};

export function AdminDocumentList({ refreshKey = 0 }: Props) {
  const [documents, setDocuments] = useState<IndexedDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .getIndexedDocuments()
      .then((res) => {
        if (!cancelled) setDocuments(res.documents ?? []);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load documents.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  if (loading) {
    return (
      <section className="panel scholar-panel">
        <h2>Indexed Documents</h2>
        <p className="muted">Loading…</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="panel scholar-panel">
        <h2>Indexed Documents</h2>
        <p className="error">{error}</p>
      </section>
    );
  }

  return (
    <section className="panel scholar-panel">
      <h2>Indexed Documents</h2>
      <p className="muted">{documents.length} document(s) in the search index.</p>
      {documents.length === 0 ? (
        <p className="muted">No documents indexed yet. Upload documents below to add them.</p>
      ) : (
        <ul className="indexed-doc-list">
          {documents.map((doc, i) => (
            <li key={doc.filename + String(i)} className="indexed-doc-item">
              <span className="indexed-doc-filename">{doc.filename}</span>
              {(doc.pages != null || doc.chunks != null) && (
                <span className="indexed-doc-meta">
                  {doc.pages != null ? `${doc.pages} pages` : ""}
                  {doc.pages != null && doc.chunks != null ? " · " : ""}
                  {doc.chunks != null ? `${doc.chunks} chunks` : ""}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
