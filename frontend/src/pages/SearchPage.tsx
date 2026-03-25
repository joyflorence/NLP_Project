import { SearchPanel } from "@/components/SearchPanel";
import { DocumentRecord } from "@/types/domain";

type Props = {
  onDownloadDocument: (doc: DocumentRecord) => void;
  onToggleSaveDocument: (doc: DocumentRecord) => void;
  isDocumentSaved: (documentId: string) => boolean;
};

export function SearchPage({ onDownloadDocument, onToggleSaveDocument, isDocumentSaved }: Props) {
  return (
    <SearchPanel
      onDownloadDocument={onDownloadDocument}
      onToggleSaveDocument={onToggleSaveDocument}
      isDocumentSaved={isDocumentSaved}
    />
  );
}
