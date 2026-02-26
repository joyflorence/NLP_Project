import { DocumentRecord } from "@/types/domain";
import "./DocumentCard.css";

type Props = {
  doc: DocumentRecord;
  onFindSimilar?: (id: string) => void;
  onDownload?: (doc: DocumentRecord) => void;
  onPreview?: (doc: DocumentRecord) => void;
};

export function DocumentCard({ doc, onFindSimilar, onDownload, onPreview }: Props) {
  return (
    <article className="doc-card">
      <h3>{doc.title}</h3>
      <div className="meta-line">
        <span>{doc.author ?? "Unknown author"}</span>
        <span>{doc.supervisor ?? "No supervisor"}</span>
        <span>{doc.year ?? "N/A"}</span>
        <span>{doc.level ? (doc.level === "postgrad" ? "Postgrad" : "Undergraduate") : "N/A"}</span>
        <span>{doc.department ?? "N/A"}</span>
        {doc.score !== undefined ? <span className="score">Relevance {doc.score.toFixed(3)}</span> : null}
      </div>
      <p>{doc.abstract ?? "No abstract available."}</p>
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
    </article>
  );
}
