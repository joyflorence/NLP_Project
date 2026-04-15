import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { SimilarityPanel } from "@/components/SimilarityPanel";
import { DocumentRecord } from "@/types/domain";

type Props = {
  onDownloadDocument: (doc: DocumentRecord) => void;
  onToggleSaveDocument: (doc: DocumentRecord) => void;
  isDocumentSaved: (documentId: string) => boolean;
};

export function RelatedWorksPage({ onDownloadDocument, onToggleSaveDocument, isDocumentSaved }: Props) {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [selected, setSelected] = useState<DocumentRecord | null>(null);

  const documentId = params.get("documentId");
  const titleParam = params.get("title") || "";

  useEffect(() => {
    if (!documentId) {
      setSelected(null);
      return;
    }
    const title = titleParam || "Selected document";
    setSelected({
      id: documentId,
      title,
    });
  }, [documentId, titleParam]);

  const backCard = (
    <section className="panel scholar-panel">
      <div className="results-list">
        <article className="doc-card">
          <h3>Back to search</h3>
          <p>Return to the main search page to explore other documents.</p>
          <div className="card-actions">
            <button type="button" className="link-button" onClick={() => navigate("/search")}>
              Go to search
            </button>
          </div>
        </article>
      </div>
    </section>
  );

  if (!documentId) {
    return (
      <>
        {backCard}
        <section className="panel scholar-panel">
          <h2>Related Works</h2>
          <p>No reference document was provided.</p>
        </section>
      </>
    );
  }

  return (
    <>
      {backCard}
      <SimilarityPanel
        selectedDocument={selected}
        onSelectDocument={setSelected}
        onDownloadDocument={onDownloadDocument}
        onToggleSaveDocument={onToggleSaveDocument}
        isDocumentSaved={isDocumentSaved}
      />
    </>
  );
}
