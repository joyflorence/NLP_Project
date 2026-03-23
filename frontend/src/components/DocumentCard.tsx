import { DocumentRecord } from "@/types/domain";
import "./DocumentCard.css";

type Props = {
  doc: DocumentRecord;
  onFindSimilar?: (id: string) => void;
  onDownload?: (doc: DocumentRecord) => void;
  onPreview?: (doc: DocumentRecord) => void;
};

export function DocumentCard({ doc, onFindSimilar, onDownload, onPreview }: Props) {
  const metadata = [
    doc.author ? `Author: ${doc.author}` : null,
    doc.year ? `Year: ${doc.year}` : null
  ].filter(Boolean);

  return (
    <article className="doc-card">
      <div className="doc-card-header">
        <h3>{doc.title}</h3>
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

      <p>{doc.abstract ?? "No abstract available."}</p>

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
        </div>
      </div>
    </article>
  );
}
