import { useState } from "react";
import { api } from "@/api/client";
import { PreviewModal } from "@/components/PreviewModal";
import { DocumentRecord, SearchFilters, SearchResponse, SearchSortBy, SearchSortOrder } from "@/types/domain";
import { DocumentCard } from "./DocumentCard";

type Props = {
  onSelectDocument: (doc: DocumentRecord) => void;
  onDownloadDocument: (doc: DocumentRecord) => void;
};

export function SearchPanel({ onSelectDocument, onDownloadDocument }: Props) {
  const [query, setQuery] = useState("");
  const [topK, setTopK] = useState(20);
  const [level, setLevel] = useState<"" | "undergraduate" | "postgrad">("");
  const [year, setYear] = useState<string>("");
  const [department, setDepartment] = useState("");
  const [supervisor, setSupervisor] = useState("");
  const [sortBy, setSortBy] = useState<SearchSortBy>("relevance");
  const [sortOrder, setSortOrder] = useState<SearchSortOrder>("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const [compareKeyword, setCompareKeyword] = useState(true);
  const [semanticResult, setSemanticResult] = useState<SearchResponse | null>(null);
  const [keywordResult, setKeywordResult] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [compatibilityNotice, setCompatibilityNotice] = useState<string | null>(null);
  const [previewDoc, setPreviewDoc] = useState<DocumentRecord | null>(null);
  const yearOptions = Array.from({ length: 11 }, (_, i) => String(2015 + i));
  const departmentOptions = ["Computer Science", "Information Systems", "Data Science", "Software Engineering"];
  const supervisorOptions = ["Dr. Adjei", "Prof. Mensimah", "Dr. Boateng", "Dr. Nkrumah"];

  function normalizeSearchResponse(
    res: SearchResponse,
    requestedPage: number,
    requestedPageSize: number,
    topKLimit: number
  ): { normalized: SearchResponse; compatibilityMode: boolean } {
    const hasFullPaginationMeta =
      typeof res.total === "number" && typeof res.page === "number" && typeof res.pageSize === "number";
    if (hasFullPaginationMeta) {
      return { normalized: res, compatibilityMode: false };
    }

    const safePage = Math.max(1, requestedPage);
    const safePageSize = Math.max(1, requestedPageSize);
    const baseResults = res.semanticResults.slice(0, topKLimit);
    const start = (safePage - 1) * safePageSize;
    const end = start + safePageSize;
    const pagedSemantic = baseResults.slice(start, end);

    const kwBase = (res.keywordResults ?? []).slice(0, topKLimit);
    const pagedKeyword = kwBase.length ? kwBase.slice(start, end) : undefined;

    return {
      compatibilityMode: true,
      normalized: {
        ...res,
        semanticResults: pagedSemantic,
        keywordResults: pagedKeyword,
        total: baseResults.length,
        page: safePage,
        pageSize: safePageSize
      }
    };
  }

  async function runSearch(nextPage = 1) {
    setLoading(true);
    setError(null);
    try {
      const filters: SearchFilters = {
        ...(level ? { level } : {}),
        ...(year ? { year: Number(year) } : {}),
        ...(department ? { department } : {}),
        ...(supervisor ? { supervisor } : {})
      };
      const payload = { query, topK, filters, sortBy, sortOrder, page: nextPage, pageSize };
      const semanticPromise = api.semanticSearch(payload);
      const keywordPromise = compareKeyword ? api.keywordSearch(payload) : Promise.resolve(null);
      const [semantic, keyword] = await Promise.all([semanticPromise, keywordPromise]);
      const semanticNorm = normalizeSearchResponse(semantic, nextPage, pageSize, topK);
      const keywordNorm = keyword ? normalizeSearchResponse(keyword, nextPage, pageSize, topK) : null;
      setSemanticResult(semanticNorm.normalized);
      setKeywordResult(keywordNorm?.normalized ?? null);
      setCompatibilityNotice(
        semanticNorm.compatibilityMode || Boolean(keywordNorm?.compatibilityMode)
          ? "Backend pagination metadata not returned; using compatibility paging on current results."
          : null
      );
      setPage(nextPage);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="panel scholar-panel">
      <h2>Search Literature</h2>

      <div className="scholar-search-row">
        <input
          className="scholar-query-input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && query.trim() && !loading) {
              void runSearch();
            }
          }}
          placeholder="Search by topic or keywords for relevance"
        />
        <button type="button" onClick={() => void runSearch(1)} disabled={!query.trim() || loading}>
          {loading ? "Searching..." : "Search"}
        </button>
      </div>

      <div className="search-options">
        <label>
          Retrieve
          <input
            type="number"
            min={5}
            max={200}
            step={5}
            value={topK}
            onChange={(e) => setTopK(Number(e.target.value))}
            aria-label="Retrieval cap"
          />
        </label>
        <label>
          Sort By
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value as SearchSortBy)}>
            <option value="relevance">Relevance</option>
            <option value="year">Year</option>
            <option value="title">Title</option>
          </select>
        </label>
        <label>
          Order
          <select value={sortOrder} onChange={(e) => setSortOrder(e.target.value as SearchSortOrder)}>
            <option value="desc">Descending</option>
            <option value="asc">Ascending</option>
          </select>
        </label>
        <label>
          Per Page
          <select value={String(pageSize)} onChange={(e) => setPageSize(Number(e.target.value))}>
            <option value="5">5</option>
            <option value="10">10</option>
            <option value="20">20</option>
          </select>
        </label>
        <label>
          Level
          <select value={level} onChange={(e) => setLevel(e.target.value as "" | "undergraduate" | "postgrad")}>
            <option value="">All</option>
            <option value="undergraduate">Undergraduate</option>
            <option value="postgrad">Postgrad</option>
          </select>
        </label>
        <label>
          Year
          <select value={year} onChange={(e) => setYear(e.target.value)} aria-label="Year">
            <option value="">All</option>
            {yearOptions.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
        <label>
          Department
          <select value={department} onChange={(e) => setDepartment(e.target.value)}>
            <option value="">All</option>
            {departmentOptions.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </label>
        <label>
          Supervisor
          <select value={supervisor} onChange={(e) => setSupervisor(e.target.value)}>
            <option value="">All</option>
            {supervisorOptions.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="check-row">
          <input type="checkbox" checked={compareKeyword} onChange={(e) => setCompareKeyword(e.target.checked)} />
          Show keyword baseline
        </label>
      </div>

      {error ? <p className="error">{error}</p> : null}
      {compatibilityNotice ? <p className="muted">{compatibilityNotice}</p> : null}

      {semanticResult ? (
        <div className="stack">
          <div className="result-summary">
            <span>{semanticResult.total ?? semanticResult.semanticResults.length} results</span>
            <span>Page {semanticResult.page ?? page}</span>
            <span>Semantic latency: {semanticResult.latencyMs?.semantic ?? "N/A"} ms</span>
            {keywordResult ? <span>Keyword latency: {keywordResult.latencyMs?.keyword ?? "N/A"} ms</span> : null}
          </div>

          <h3 className="results-heading">Semantic Results</h3>
          <div className="results-list">
            {semanticResult.semanticResults.map((doc) => (
              <DocumentCard
                key={doc.id}
                doc={doc}
                onFindSimilar={() => onSelectDocument(doc)}
                onDownload={onDownloadDocument}
                onPreview={setPreviewDoc}
              />
            ))}
          </div>

          {keywordResult ? <h3 className="results-heading">Keyword Baseline</h3> : null}
          {keywordResult ? (
            <div className="results-list">
              {(keywordResult.keywordResults ?? keywordResult.semanticResults).map((doc) => (
                <DocumentCard key={`kw-${doc.id}`} doc={doc} onDownload={onDownloadDocument} onPreview={setPreviewDoc} />
              ))}
            </div>
          ) : null}

          <div className="pager-row">
            <button type="button" onClick={() => void runSearch(Math.max(1, page - 1))} disabled={loading || page <= 1}>
              Previous
            </button>
            <span>
              Page {page}
              {semanticResult.total ? ` of ${Math.max(1, Math.ceil(semanticResult.total / (semanticResult.pageSize ?? pageSize)))}` : ""}
            </span>
            <button
              type="button"
              onClick={() => void runSearch(page + 1)}
              disabled={
                loading ||
                Boolean(semanticResult.total) &&
                  page >= Math.max(1, Math.ceil((semanticResult.total ?? 0) / (semanticResult.pageSize ?? pageSize)))
              }
            >
              Next
            </button>
          </div>
        </div>
      ) : null}

      <PreviewModal doc={previewDoc} query={query} open={Boolean(previewDoc)} onClose={() => setPreviewDoc(null)} />
    </section>
  );
}
