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
      {doc.score !== undefined ? (
        <div className="meta-line">
          <span className="score">Relevance {doc.score.toFixed(3)}</span>
        </div>
      ) : null}
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
