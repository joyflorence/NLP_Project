import { useEffect, useState } from "react";
import { api } from "@/api/client";
import { PreviewModal } from "@/components/PreviewModal";
import { DocumentRecord } from "@/types/domain";
import { DocumentCard } from "./DocumentCard";

type Props = {
  selectedDocument: DocumentRecord | null;
  onSelectDocument: (doc: DocumentRecord) => void;
  onDownloadDocument: (doc: DocumentRecord) => void;
  onToggleSaveDocument: (doc: DocumentRecord) => void;
  isDocumentSaved: (documentId: string) => boolean;
};

export function SimilarityPanel({
  selectedDocument,
  onSelectDocument,
  onDownloadDocument,
  onToggleSaveDocument,
  isDocumentSaved
}: Props) {
  const [related, setRelated] = useState<DocumentRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewDoc, setPreviewDoc] = useState<DocumentRecord | null>(null);

  useEffect(() => {
    if (!selectedDocument) return;

    setLoading(true);
    setError(null);
    api
      .getSimilarDocuments(selectedDocument.id, 5)
      .then((res) => setRelated(res.related))
      .catch((err) => setError(err instanceof Error ? err.message : "Could not fetch similar docs"))
      .finally(() => setLoading(false));
  }, [selectedDocument]);

  return (
    <>
      <section className="panel scholar-panel" id="related-works">
        <h2>Related Works</h2>
        {!selectedDocument ? <p>Select a result to load related documents.</p> : null}
        {selectedDocument ? <p>Reference: {selectedDocument.title}</p> : null}
        {loading ? <p>Loading related documents...</p> : null}
        {error ? <p className="error">{error}</p> : null}
        <div className="results-list">
          {related.map((doc) => (
            <DocumentCard
              key={doc.id}
              doc={doc}
              onDownload={onDownloadDocument}
              onPreview={setPreviewDoc}
              onToggleSave={onToggleSaveDocument}
              isSaved={isDocumentSaved(doc.id)}
            />
          ))}
        </div>
      </section>
      <PreviewModal
        doc={previewDoc}
        query={selectedDocument?.title ?? ""}
        open={Boolean(previewDoc)}
        onClose={() => setPreviewDoc(null)}
      />
    </>
  );
}
