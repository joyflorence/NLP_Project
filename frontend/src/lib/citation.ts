import { DocumentRecord } from "@/types/domain";

export type CitationFormat = "plain" | "apa" | "mla" | "chicago" | "bibtex";

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function escapeBibValue(value: string) {
  return value.replace(/[{}]/g, "").trim();
}

function formatAuthor(author?: string) {
  const cleaned = normalizeWhitespace(author || "");
  if (!cleaned) return "Unknown author";
  return cleaned;
}

function formatYear(year?: number) {
  return year ? String(year) : "n.d.";
}

function formatTitle(title?: string) {
  return normalizeWhitespace(title || "Untitled document");
}

function toSentenceCase(value: string) {
  const trimmed = normalizeWhitespace(value);
  if (!trimmed) return "Untitled document";
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
}

function splitAuthor(author?: string) {
  const cleaned = formatAuthor(author);
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length <= 1) {
    return { first: "", last: cleaned };
  }
  return {
    first: parts.slice(0, -1).join(" "),
    last: parts[parts.length - 1]
  };
}

function formatAuthorLastFirst(author?: string) {
  const { first, last } = splitAuthor(author);
  if (!first) return last;
  return `${last}, ${first}`;
}

function formatAuthorLastInitial(author?: string) {
  const { first, last } = splitAuthor(author);
  if (!first) return last;
  const initials = first
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}.`)
    .join(" ");
  return `${last}, ${initials}`;
}

function buildBibKey(doc: Pick<DocumentRecord, "title" | "author" | "year" | "id">) {
  const authorToken = normalizeWhitespace(doc.author || "document").split(/\s+/).pop() || "document";
  const yearToken = doc.year ? String(doc.year) : "nd";
  const titleToken = normalizeWhitespace(doc.title || "document")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .join("");
  const base = `${authorToken}${yearToken}${titleToken || "document"}`;
  return base.replace(/[^A-Za-z0-9]/g, "") || (doc.id || "document");
}

export function buildDocumentCitation(doc: Pick<DocumentRecord, "title" | "author" | "year">) {
  const title = formatTitle(doc.title);
  const author = formatAuthor(doc.author);
  const year = formatYear(doc.year);
  return `${author}. (${year}). ${title}.`;
}

export function buildApaCitation(doc: Pick<DocumentRecord, "title" | "author" | "year">) {
  const author = formatAuthorLastInitial(doc.author);
  const year = formatYear(doc.year);
  const title = toSentenceCase(formatTitle(doc.title));
  return `${author}. (${year}). ${title}.`;
}

export function buildMlaCitation(doc: Pick<DocumentRecord, "title" | "author" | "year">) {
  const author = formatAuthorLastFirst(doc.author);
  const title = formatTitle(doc.title);
  const year = formatYear(doc.year);
  return `${author}. "${title}." ${year}.`;
}

export function buildChicagoCitation(doc: Pick<DocumentRecord, "title" | "author" | "year">) {
  const author = formatAuthorLastFirst(doc.author);
  const title = formatTitle(doc.title);
  const year = formatYear(doc.year);
  return `${author}. ${year}. "${title}."`;
}

export function buildBibtexCitation(doc: Pick<DocumentRecord, "id" | "title" | "author" | "year">) {
  const key = buildBibKey(doc);
  const title = escapeBibValue(formatTitle(doc.title));
  const author = escapeBibValue(formatAuthor(doc.author));
  const year = doc.year ? String(doc.year) : "n.d.";
  return `@misc{${key},
  author = {${author}},
  title = {${title}},
  year = {${year}}
}`;
}

export function buildCitationByFormat(
  format: CitationFormat,
  doc: Pick<DocumentRecord, "id" | "title" | "author" | "year">
) {
  switch (format) {
    case "apa":
      return buildApaCitation(doc);
    case "mla":
      return buildMlaCitation(doc);
    case "chicago":
      return buildChicagoCitation(doc);
    case "bibtex":
      return buildBibtexCitation(doc);
    case "plain":
    default:
      return buildDocumentCitation(doc);
  }
}
