import { useEffect, useState } from "react";
import { DocumentRecord } from "@/types/domain";
import { CitationFormat, buildCitationByFormat } from "@/lib/citation";
import "./DocumentCard.css";

type Props = {
  doc: DocumentRecord;
  onFindSimilar?: (id: string) => void;
  onDownload?: (doc: DocumentRecord) => void;
  onPreview?: (doc: DocumentRecord) => void;
  onToggleSave?: (doc: DocumentRecord) => void;
  isSaved?: boolean;
  saveLabel?: string;
  searchQuery?: string;
};

function highlightText(text: string, query?: string) {
  if (!query || !query.trim()) return text;
  const terms = query.trim().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return text;
  const regex = new RegExp(`(${terms.map(t => t.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')).join('|')})`, 'gi');
  const parts = text.split(regex);
  return parts.map((part, i) => 
    regex.test(part) ? <mark key={i} className="search-highlight" style={{ backgroundColor: '#fff3cd', color: '#856404', padding: '0 2px', borderRadius: '2px', fontWeight: 600 }}>{part}</mark> : part
  );
}

const FORMAT_LABELS: Record<CitationFormat, string> = {
  plain: "Plain",
  apa: "APA",
  mla: "MLA",
  chicago: "Chicago",
  bibtex: "BibTeX"
};

export function DocumentCard({ doc, onFindSimilar, onDownload, onPreview, onToggleSave, isSaved = false, saveLabel, searchQuery }: Props) {
  const [citationStatus, setCitationStatus] = useState<string | null>(null);
  const [showCitation, setShowCitation] = useState(false);
  const [citationFormat, setCitationFormat] = useState<CitationFormat>("plain");
  const metadata = [
    doc.author ? `Author: ${doc.author}` : null,
    doc.year ? `Year: ${doc.year}` : null
  ].filter(Boolean);
  const activeCitation = buildCitationByFormat(citationFormat, doc);

  let displayAbstract = doc.abstract ?? "No abstract available.";
  let extractedKeywords: string[] = [];
  if (displayAbstract.includes("\n\nKeywords:")) {
    const parts = displayAbstract.split("\n\nKeywords:");
    displayAbstract = parts[0];
    extractedKeywords = parts[1].split(/[,;\n]/).map((k) => k.trim()).filter(Boolean);
  }

  useEffect(() => {
    if (!citationStatus) return;
    const timer = window.setTimeout(() => setCitationStatus(null), 1800);
    return () => window.clearTimeout(timer);
  }, [citationStatus]);

  async function copyText(value: string, successMessage: string) {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = value;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand("copy");
        textArea.remove();
      }
      setCitationStatus(successMessage);
    } catch {
      setCitationStatus("Could not copy citation");
    }
  }

  return (
    <article className={isSaved ? "doc-card is-saved" : "doc-card"}>
      <div className="doc-card-header">
        <h3>{highlightText(doc.title, searchQuery)}</h3>
        {metadata.length > 0 ? (
          <div className="doc-meta-grid" aria-label="Document metadata">
            {metadata.map((item) => (
              <span key={item} className="doc-meta-pill">
                {item}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      <p>{highlightText(displayAbstract, searchQuery)}</p>
      {extractedKeywords.length > 0 ? (
        <div className="doc-keywords-grid" style={{ marginTop: '0', marginBottom: '16px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {extractedKeywords.map(kw => (
            <span key={kw} style={{ background: 'var(--surface-color, #f1f3f5)', border: '1px solid var(--border-color, #e9ecef)', borderRadius: '12px', padding: '2px 8px', fontSize: '11px', fontWeight: 500, color: 'var(--text-color, #495057)' }}>
              {kw}
            </span>
          ))}
        </div>
      ) : null}

      <div className="card-actions-shell">
        <div className="card-actions">
          {onFindSimilar ? (
            <button className="link-button" type="button" onClick={() => onFindSimilar(doc.id)}>
              Find Similar
            </button>
          ) : null}
          {onDownload ? (
            <button className="link-button" type="button" onClick={() => onDownload(doc)}>
              Download
            </button>
          ) : null}
          {onPreview ? (
            <button className="link-button" type="button" onClick={() => onPreview(doc)}>
              Preview
            </button>
          ) : null}
          {onToggleSave ? (
            <button
              className={isSaved ? "icon-action-button save-button is-saved" : "icon-action-button save-button"}
              type="button"
              onClick={() => onToggleSave(doc)}
              aria-label={saveLabel || (isSaved ? "Saved" : "Save")}
              title={saveLabel || (isSaved ? "Saved" : "Save")}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" className="action-icon-svg">
                <path d="M12 3.5l2.7 5.47 6.04.88-4.37 4.26 1.03 6.02L12 17.3l-5.4 2.83 1.03-6.02-4.37-4.26 6.04-.88L12 3.5z" />
              </svg>
              <span className="icon-action-label">{saveLabel || (isSaved ? "Saved" : "Save")}</span>
            </button>
          ) : null}
          <button
            className="icon-action-button cite-button"
            type="button"
            onClick={() => setShowCitation(true)}
            aria-label="Cite"
            title="Cite"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" className="action-icon-svg">
              <path d="M9.5 7.5H6.75L5 11v5.5h5.5V11H7.9l1.6-3.5zm8 0H14.75L13 11v5.5h5.5V11H15.9l1.6-3.5z" />
            </svg>
            <span className="icon-action-label">Cite</span>
          </button>
        </div>
        {citationStatus ? <span className="doc-citation-status">{citationStatus}</span> : null}
      </div>

      {showCitation ? (
        <div className="doc-citation-popup-backdrop" onClick={() => setShowCitation(false)}>
          <div className="doc-citation-popup" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Document citation">
            <div className="doc-citation-popup-header">
              <span className="doc-citation-label">Citation</span>
              <button type="button" className="doc-citation-close" onClick={() => setShowCitation(false)} aria-label="Close citation">
                x
              </button>
            </div>
            <div className="doc-citation-format-switch">
              {(Object.keys(FORMAT_LABELS) as CitationFormat[]).map((format) => (
                <button
                  key={format}
                  type="button"
                  className={citationFormat === format ? "doc-citation-format is-active" : "doc-citation-format"}
                  onClick={() => setCitationFormat(format)}
                >
                  {FORMAT_LABELS[format]}
                </button>
              ))}
            </div>
            <pre className="doc-citation-text">{activeCitation}</pre>
            <div className="doc-citation-popup-actions">
              <button
                className="link-button"
                type="button"
                onClick={() => copyText(activeCitation, `${FORMAT_LABELS[citationFormat]} copied`)}
              >
                {citationFormat === "bibtex" ? "Copy BibTeX" : `Copy ${FORMAT_LABELS[citationFormat]}`}
              </button>
              <button className="link-button" type="button" onClick={() => setShowCitation(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </article>
  );
}
