import { DocumentRecord } from "@/types/domain";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { api } from "@/api/client";

type Props = {
  doc: DocumentRecord | null;
  query: string;
  open: boolean;
  onClose: () => void;
};

function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function splitWithHighlight(text: string, query: string) {
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 5);

  if (!terms.length) return [text];
  const pattern = new RegExp(`(${terms.map(escapeRegExp).join("|")})`, "ig");
  return text.split(pattern);
}

function buildSnippet(text: string, query: string) {
  if (!query.trim()) return text.slice(0, 700);
  const idx = text.toLowerCase().indexOf(query.trim().toLowerCase());
  if (idx < 0) return text.slice(0, 700);
  const start = Math.max(0, idx - 80);
  const end = Math.min(text.length, idx + query.length + 220);
  const prefix = start > 0 ? "..." : "";
  const suffix = end < text.length ? "..." : "";
  return `${prefix}${text.slice(start, end)}${suffix}`;
}

export function PreviewModal({ doc, query, open, onClose }: Props) {
  const navigate = useNavigate();
  const [previewText, setPreviewText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !doc) return;

    const fallback = doc.abstract?.trim() || "No preview text available for this document.";
    setPreviewText(buildSnippet(fallback, query));
    setError(null);
    setLoading(true);

    api
      .getDocumentFullText(doc.id)
      .then((res) => {
        const fullText = res.fullText?.trim() || fallback;
        setPreviewText(buildSnippet(fullText, query));
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Could not load document preview.");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [doc, open, query]);

  useEffect(() => {
    if (!open) return;
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
    };
  }, [open]);

  if (!open || !doc) return null;

  const tokens = splitWithHighlight(previewText, query);
  const modal = (
    <div
      className="preview-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Document preview"
      onClick={onClose}
    >
      <div className="preview-dialog" onClick={(e) => e.stopPropagation()}>
        <header>
          <div className="preview-heading-block">
            <h3>{doc.title}</h3>
            <div className="preview-meta">
              {doc.author ? <span>Author: {doc.author}</span> : null}
              {doc.year ? <span>Year: {doc.year}</span> : null}
            </div>
          </div>
          <button type="button" className="preview-close" onClick={onClose} aria-label="Close preview">
            x
          </button>
        </header>
        {loading ? <p className="preview-status">Loading preview text...</p> : null}
        {error ? <p className="preview-status error">{error}</p> : null}
        <p>
          {tokens.map((part, idx) => {
            const match = query && part.toLowerCase() === query.toLowerCase();
            return match ? <mark key={idx}>{part}</mark> : <span key={idx}>{part}</span>;
          })}
        </p>
        <button
          type="button"
          className="preview-view-full-text"
          onClick={() => {
            onClose();
            navigate(`/document/full-text?id=${encodeURIComponent(doc.id)}`);
          }}
        >
          View full text
        </button>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
