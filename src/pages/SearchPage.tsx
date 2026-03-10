import { SearchPanel } from "@/components/SearchPanel";
import { DocumentRecord } from "@/types/domain";

type Props = {
  onDownloadDocument: (doc: DocumentRecord) => void;
};

export function SearchPage({ onDownloadDocument }: Props) {
  return <SearchPanel onDownloadDocument={onDownloadDocument} />;
}
