import { EvaluationInsights } from "@/components/EvaluationInsights";
import { useState } from "react";
import { SearchPanel } from "@/components/SearchPanel";
import { SimilarityPanel } from "@/components/SimilarityPanel";
import { DocumentRecord } from "@/types/domain";

type Props = {
  onDownloadDocument: (doc: DocumentRecord) => void;
};

export function SearchPage({ onDownloadDocument }: Props) {
  const [selected, setSelected] = useState<DocumentRecord | null>(null);

  return (
    <>
      <SearchPanel onSelectDocument={setSelected} onDownloadDocument={onDownloadDocument} />
      <SimilarityPanel selectedDocument={selected} onDownloadDocument={onDownloadDocument} />
      <EvaluationInsights />
    </>
  );
}
