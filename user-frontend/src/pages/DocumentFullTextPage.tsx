import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "@/api/client";
import { CitationFormat, buildCitationByFormat } from "@/lib/citation";

type Props = {
  onDownloadDocument?: (doc: { id: string; title: string }) => void;
};

const FORMAT_LABELS: Record<CitationFormat, string> = {
  plain: "Plain",
  apa: "APA",
  mla: "MLA",
  chicago: "Chicago",
  bibtex: "BibTeX"
};

type FullTextBlock = {
  kind: "heading" | "paragraph";
  text: string;
};

function normalizeTextKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function isSectionHeading(line: string) {
  const trimmed = line.trim();
  if (!trimmed) return false;
  const normalized = trimmed.replace(/[.:]+$/, "");
  const low = normalized.toLowerCase();
  if (/^(abstract|introduction|background|methodology|methods|results|discussion|conclusion|recommendations?|references|bibliography|acknowledg(?:e)?ments?|keywords?)$/i.test(normalized)) {
    return true;
  }
  if (/^(chapter|section)\s+[a-z0-9ivx]+/i.test(normalized)) {
    return true;
  }
  if (/^\d+(?:\.\d+)*\s+[A-Z][A-Za-z].*/.test(normalized)) {
    return true;
  }
  if (trimmed.length <= 90 && /^[A-Z0-9\s,&\-]+$/.test(trimmed) && trimmed.split(/\s+/).length <= 8) {
    return true;
  }
  if (low.startsWith("abstract ") || low.startsWith("keywords ")) {
    return true;
  }
  return false;
}

function parseFullTextBlocks(text: string, title: string, author: string) {
  const lines = text.replace(/\r/g, "").split("\n");
  const blocks: FullTextBlock[] = [];
  const titleKey = normalizeTextKey(title);
  const authorKey = normalizeTextKey(author);
  const paragraph: string[] = [];

  const flushParagraph = () => {
    if (!paragraph.length) return;
    const compact = paragraph.join(" ").replace(/\s+/g, " ").trim();
    if (compact) blocks.push({ kind: "paragraph", text: compact });
    paragraph.length = 0;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      flushParagraph();
      continue;
    }

    const key = normalizeTextKey(line);
    if (key && (key === titleKey || key === authorKey)) {
      continue;
    }

    const abstractMatch = line.match(/^(Abstract|Keywords?)\s*[:.-]?\s*(.+)$/i);
    if (abstractMatch) {
      flushParagraph();
      blocks.push({ kind: "heading", text: abstractMatch[1].replace(/[.:]+$/, "") });
      if (abstractMatch[2]?.trim()) {
        blocks.push({ kind: "paragraph", text: abstractMatch[2].trim() });
      }
      continue;
    }

    if (isSectionHeading(line)) {
      flushParagraph();
      blocks.push({ kind: "heading", text: line.replace(/[.:]+$/, "") });
      continue;
    }

    paragraph.push(line);
    if (/[.!?]$/.test(line) && paragraph.join(" ").length > 320) {
      flushParagraph();
    }
  }

  flushParagraph();
  return blocks;
}
export function DocumentFullTextPage({ onDownloadDocument }: Props) {
  const [searchParams] = useSearchParams();
  const documentId = searchParams.get("id") ?? "";
  const [fullText, setFullText] = useState<string>("");
  const [title, setTitle] = useState<string>("");
  const [author, setAuthor] = useState<string>("");
  const [year, setYear] = useState<number | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copyNotice, setCopyNotice] = useState<string | null>(null);
  const [citationFormat, setCitationFormat] = useState<CitationFormat>("plain");

  useEffect(() => {
    if (!documentId) {
      setError("No document specified.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    api
      .getDocumentFullText(documentId)
      .then((res) => {
        setFullText(res.fullText);
        setTitle(res.title);
        setAuthor(res.author ?? "");
        setYear(typeof res.year === "number" ? res.year : undefined);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load full text."))
      .finally(() => setLoading(false));
  }, [documentId]);

  const citationSource = { id: documentId, title, author, year };
  const activeCitation = buildCitationByFormat(citationFormat, citationSource);
  const contentBlocks = parseFullTextBlocks(fullText, title, author);

  async function copyText(value: string, successMessage: string) {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = value;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand("copy");
        textArea.remove();
      }
      setCopyNotice(successMessage);
    } catch {
      setCopyNotice("Could not copy citation");
    } finally {
      window.setTimeout(() => setCopyNotice(null), 1800);
    }
  }

  function handleDownload() {
    if (!fullText || !title) return;
    const safeName = title.replace(/[^\w\s-]/g, "").replace(/\s+/g, "_") || "document";
    const blob = new Blob([fullText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${safeName}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="panel scholar-panel full-text-page">
      <nav className="full-text-nav">
        <Link to="/search">Back to search</Link>
      </nav>
      <h2>Full text</h2>
      {loading ? <p>Loading...</p> : null}
      {error ? <p className="error">{error}</p> : null}
      {!loading && !error && fullText ? (
        <>
          <h3>{title}</h3>
          <div className="full-text-citation-box">
            <span className="full-text-citation-label">Citation</span>
            <div className="doc-citation-format-switch">
              {(Object.keys(FORMAT_LABELS) as CitationFormat[]).map((format) => (
                <button
                  key={format}
                  type="button"
                  className={citationFormat === format ? "doc-citation-format is-active" : "doc-citation-format"}
                  onClick={() => setCitationFormat(format)}
                >
                  {FORMAT_LABELS[format]}
                </button>
              ))}
            </div>
            <pre className="full-text-bibtex-text">{activeCitation}</pre>
          </div>
          <div className="full-text-actions">
            <button type="button" className="button-primary" onClick={handleDownload}>
              Download as .txt
            </button>
            <button
              type="button"
              className="link-button"
              onClick={() => copyText(activeCitation, `${FORMAT_LABELS[citationFormat]} copied`)}
            >
              {citationFormat === "bibtex" ? "Copy BibTeX" : `Copy ${FORMAT_LABELS[citationFormat]}`}
            </button>
            {onDownloadDocument ? (
              <button
                type="button"
                className="link-button"
                onClick={() => onDownloadDocument({ id: documentId, title })}
              >
                Download original PDF
              </button>
            ) : null}
          </div>
          {copyNotice ? <p className="muted">{copyNotice}</p> : null}
          <div className="full-text-body">
            {(contentBlocks.length ? contentBlocks : [{ kind: "paragraph" as const, text: fullText }]).map((block, index) =>
              block.kind === "heading" ? (
                <h4 key={index} className="full-text-section-heading">{block.text}</h4>
              ) : (
                <p key={index} className="full-text-paragraph">{block.text}</p>
              )
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
