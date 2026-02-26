import { DocumentRecord } from "@/types/domain";

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

function buildSnippet(doc: DocumentRecord, query: string) {
  const text = doc.abstract ?? "No abstract available.";
  if (!query.trim()) return text;
  const idx = text.toLowerCase().indexOf(query.trim().toLowerCase());
  if (idx < 0) return text;
  const start = Math.max(0, idx - 80);
  const end = Math.min(text.length, idx + query.length + 120);
  const prefix = start > 0 ? "..." : "";
  const suffix = end < text.length ? "..." : "";
  return `${prefix}${text.slice(start, end)}${suffix}`;
}

export function PreviewModal({ doc, query, open, onClose }: Props) {
  if (!open || !doc) return null;

  const snippet = buildSnippet(doc, query);
  const tokens = splitWithHighlight(snippet, query);

  return (
    <div className="preview-overlay" role="dialog" aria-modal="true" aria-label="Document preview">
      <div className="preview-dialog">
        <header>
          <h3>{doc.title}</h3>
          <button type="button" className="preview-close" onClick={onClose} aria-label="Close preview">
            x
          </button>
        </header>
        <p className="preview-meta">
          {doc.author ?? "Unknown author"} | {doc.year ?? "N/A"} | {doc.level ?? "N/A"} | {doc.department ?? "N/A"}
        </p>
        <p>
          {tokens.map((part, idx) => {
            const match = query && part.toLowerCase() === query.toLowerCase();
            return match ? <mark key={idx}>{part}</mark> : <span key={idx}>{part}</span>;
          })}
        </p>
      </div>
    </div>
  );
}