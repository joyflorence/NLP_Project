import { DocumentRecord } from "@/types/domain";

export type SavedDocument = DocumentRecord & {
  savedAt: string;
};

const STORAGE_KEY = "saved-library-documents";

export function loadSavedDocuments(): SavedDocument[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is SavedDocument => Boolean(item && typeof item.id === "string" && typeof item.title === "string"));
  } catch {
    return [];
  }
}

export function persistSavedDocuments(documents: SavedDocument[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(documents));
}

export function isSavedDocument(documents: SavedDocument[], documentId: string) {
  return documents.some((doc) => doc.id === documentId);
}

export function toggleSavedDocument(documents: SavedDocument[], doc: DocumentRecord): SavedDocument[] {
  const exists = documents.some((item) => item.id === doc.id);
  if (exists) {
    const next = documents.filter((item) => item.id !== doc.id);
    persistSavedDocuments(next);
    return next;
  }
  const next = [{ ...doc, savedAt: new Date().toISOString() }, ...documents];
  persistSavedDocuments(next);
  return next;
}
