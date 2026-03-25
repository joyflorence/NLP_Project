import { Link } from "react-router-dom";
import { useState } from "react";
import { DocumentCard } from "@/components/DocumentCard";
import { DocumentRecord, SavedDocument } from "@/types/domain";
import { buildCitationByFormat } from "@/lib/citation";

type Props = {
  savedDocuments: SavedDocument[];
  isAuthenticated: boolean;
  onDownloadDocument: (doc: DocumentRecord) => void;
  onToggleSaveDocument: (doc: DocumentRecord) => void;
  onSaveNote: (documentId: string, note: string) => void;
  isDocumentSaved: (documentId: string) => boolean;
};

function LibraryItem({
  doc,
  onDownloadDocument,
  onToggleSaveDocument,
  onSaveNote,
  isDocumentSaved,
}: {
  doc: SavedDocument;
  onDownloadDocument: (doc: DocumentRecord) => void;
  onToggleSaveDocument: (doc: DocumentRecord) => void;
  onSaveNote: (documentId: string, note: string) => void;
  isDocumentSaved: (documentId: string) => boolean;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [noteText, setNoteText] = useState((doc as any).note || "");
  const targetId = (doc as any).id || doc.documentId;

  const handleSave = () => {
    onSaveNote(targetId, noteText);
    setIsEditing(false);
  };

  return (
    <div className="library-item-wrapper" style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "32px" }}>
      <DocumentCard
        doc={doc as any}
        onDownload={onDownloadDocument}
        onToggleSave={onToggleSaveDocument}
        isSaved={isDocumentSaved(targetId)}
        saveLabel="Remove"
      />

      <div className="library-note-section" style={{ padding: "0 16px", marginTop: "-16px", zIndex: 1, position: "relative" }}>
        {!isEditing ? (
          <div
            style={{
              background: "var(--surface-color)",
              border: "1px solid var(--border-color)",
              borderTop: "none",
              borderBottomLeftRadius: "8px",
              borderBottomRightRadius: "8px",
              padding: "16px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              boxShadow: "0 2px 8px rgba(0,0,0,0.03)"
            }}
          >
            <div style={{ flex: 1, paddingRight: "16px" }}>
              <strong style={{ display: "block", fontSize: "12px", color: "var(--primary-color)", marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 700 }}>
                Personal Annotation
              </strong>
              {(doc as any).note ? (
                <p style={{ margin: 0, fontSize: "14px", whiteSpace: "pre-wrap", color: "var(--text-color)", lineHeight: "1.6" }}>
                  {(doc as any).note}
                </p>
              ) : (
                <p style={{ margin: 0, fontSize: "14px", color: "var(--muted-color)", fontStyle: "italic" }}>
                  No reading notes added yet.
                </p>
              )}
            </div>
            <button className="search-secondary-action" onClick={() => setIsEditing(true)} style={{ padding: "6px 14px", fontSize: "13px" }}>
              {(doc as any).note ? "Edit" : "Add Note"}
            </button>
          </div>
        ) : (
          <div
            style={{
              background: "var(--surface-color)",
              border: "1px solid var(--primary-color)",
              borderTop: "none",
              borderBottomLeftRadius: "8px",
              borderBottomRightRadius: "8px",
              padding: "16px",
            }}
          >
            <strong style={{ display: "block", fontSize: "12px", color: "var(--primary-color)", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 700 }}>
              Edit Annotation
            </strong>
            <textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="Add your reading notes, literature review ideas, or chapter summaries here..."
              style={{
                width: "100%",
                minHeight: "100px",
                padding: "12px",
                borderRadius: "6px",
                border: "1px solid var(--border-color)",
                resize: "vertical",
                fontFamily: "inherit",
                fontSize: "14px",
                lineHeight: "1.6",
                marginBottom: "12px",
                outline: "none"
              }}
              autoFocus
            />
            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <button
                className="search-secondary-action"
                onClick={() => {
                  setIsEditing(false);
                  setNoteText((doc as any).note || "");
                }}
              >
                Cancel
              </button>
              <button className="search-primary-action" onClick={handleSave}>
                Save Note
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function LibraryPage({
  savedDocuments,
  isAuthenticated,
  onDownloadDocument,
  onToggleSaveDocument,
  onSaveNote,
  isDocumentSaved,
}: Props) {
  const [exportStatus, setExportStatus] = useState<string | null>(null);

  function exportBibliography() {
    if (savedDocuments.length === 0) return;
    try {
      const citations = savedDocuments.map((doc) => buildCitationByFormat("apa", doc as any)).join("\n\n");
      const blob = new Blob([citations], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "My_Library_Bibliography.txt";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setExportStatus("Exported successfully!");
      setTimeout(() => setExportStatus(null), 3000);
    } catch {
      setExportStatus("Failed to export.");
      setTimeout(() => setExportStatus(null), 3000);
    }
  }

  return (
    <section className="panel scholar-panel library-page">
      <div className="library-page-header">
        <div>
          <h2>My Library</h2>
          <p className="muted">Save documents here for quick review later.</p>
        </div>
        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          {isAuthenticated && savedDocuments.length > 0 ? (
            <button className="search-secondary-action" onClick={exportBibliography}>
              Export Bibliography
            </button>
          ) : null}
          {exportStatus ? <span className="doc-citation-status">{exportStatus}</span> : null}
          <Link to="/search" className="admin-back-link">
            Back to search
          </Link>
        </div>
      </div>

      {!isAuthenticated ? (
        <div className="empty-state search-empty-state library-empty-state">
          <strong>Sign in to use your library.</strong>
          <p>Your saved documents are now stored with your account, so they follow you across sessions.</p>
        </div>
      ) : savedDocuments.length === 0 ? (
        <div className="empty-state search-empty-state library-empty-state">
          <strong>Your library is empty.</strong>
          <p>Use the Save button on any result card to keep documents here for later reading.</p>
        </div>
      ) : (
        <div className="results-list" style={{ marginTop: "24px", display: "flex", flexDirection: "column" }}>
          {savedDocuments.map((doc) => (
            <LibraryItem
              key={(doc as any).id || doc.documentId}
              doc={doc}
              onDownloadDocument={onDownloadDocument}
              onToggleSaveDocument={onToggleSaveDocument}
              onSaveNote={onSaveNote}
              isDocumentSaved={isDocumentSaved}
            />
          ))}
        </div>
      )}
    </section>
  );
}
