import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "@/api/client";

type Props = {
  onDownloadDocument?: (doc: { id: string; title: string }) => void;
};

export function DocumentFullTextPage({ onDownloadDocument }: Props) {
  const [searchParams] = useSearchParams();
  const documentId = searchParams.get("id") ?? "";
  const [fullText, setFullText] = useState<string>("");
  const [title, setTitle] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!documentId) {
      setError("No document specified.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    api
      .getDocumentFullText(documentId)
      .then((res) => {
        setFullText(res.fullText);
        setTitle(res.title);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load full text."))
      .finally(() => setLoading(false));
  }, [documentId]);

  function handleDownload() {
    if (!fullText || !title) return;
    const safeName = title.replace(/[^\w\s-]/g, "").replace(/\s+/g, "_") || "document";
    const blob = new Blob([fullText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${safeName}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="panel scholar-panel full-text-page">
      <nav className="full-text-nav">
        <Link to="/search">Back to search</Link>
      </nav>
      <h2>Full text</h2>
      {loading ? <p>Loading…</p> : null}
      {error ? <p className="error">{error}</p> : null}
      {!loading && !error && fullText ? (
        <>
          <h3>{title}</h3>
          <div className="full-text-actions">
            <button type="button" className="button-primary" onClick={handleDownload}>
              Download as .txt
            </button>
            {onDownloadDocument ? (
              <button
                type="button"
                className="link-button"
                onClick={() => onDownloadDocument({ id: documentId, title })}
              >
                Download original PDF
              </button>
            ) : null}
          </div>
          <pre className="full-text-body">{fullText}</pre>
        </>
      ) : null}
    </div>
  );
}
