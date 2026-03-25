import {
  DocumentRecord,
  IngestJob,
  SearchFilters,
  SearchRequest,
  SearchResponse,
  SavedDocument,
  SearchSortBy,
  SearchSortOrder,
  SignedDownloadResponse,
  SimilarityResponse
} from "@/types/domain";

const mockCorpus: DocumentRecord[] = [
  {
    id: "doc-1",
    title: "Transformer-Based Topic Discovery in Capstone Projects",
    author: "A. Mensah",
    supervisor: "Dr. Adjei",
    year: 2024,
    level: "undergraduate",
    downloadUrl: "https://example.edu/docs/doc-1.pdf",
    department: "Computer Science",
    abstract: "A semantic indexing pipeline for project archives using sentence embeddings."
  },
  {
    id: "doc-2",
    title: "Plagiarism Detection with Hybrid Similarity Scoring",
    author: "R. Okeke",
    supervisor: "Prof. Mensimah",
    year: 2023,
    level: "postgrad",
    downloadUrl: "https://example.edu/docs/doc-2.pdf",
    department: "Information Systems",
    abstract: "Compares lexical and embedding-based signals for plagiarism detection."
  },
  {
    id: "doc-3",
    title: "PDF Mining for Research Proposal Analytics",
    author: "S. Patel",
    supervisor: "Dr. Boateng",
    year: 2025,
    level: "postgrad",
    downloadUrl: "https://example.edu/docs/doc-3.pdf",
    department: "Data Science",
    abstract: "Extracts semantic trends from historical proposal PDFs and outlines."
  },
  {
    id: "doc-4",
    title: "Course Outline Recommendation via Semantic Retrieval",
    author: "L. Chen",
    supervisor: "Dr. Adjei",
    year: 2022,
    level: "undergraduate",
    downloadUrl: "https://example.edu/docs/doc-4.pdf",
    department: "Software Engineering",
    abstract: "Recommends curriculum references with retrieval-augmented embeddings."
  },
  {
    id: "doc-5",
    title: "Neural Essay Scoring for Undergraduate Writing",
    author: "K. Boateng",
    supervisor: "Prof. Mensimah",
    year: 2021,
    level: "undergraduate",
    downloadUrl: "https://example.edu/docs/doc-5.pdf",
    department: "Computer Science",
    abstract: "Uses transformer encoders to score and provide feedback on student essays."
  },
  {
    id: "doc-6",
    title: "Knowledge Graph Search for Graduate Thesis Archives",
    author: "P. Singh",
    supervisor: "Dr. Nkrumah",
    year: 2019,
    level: "postgrad",
    downloadUrl: "https://example.edu/docs/doc-6.pdf",
    department: "Information Systems",
    abstract: "Builds a graph-driven retrieval layer over thesis metadata and abstracts."
  },
  {
    id: "doc-7",
    title: "Semantic Matching of Project Topics Across Departments",
    author: "M. Ali",
    supervisor: "Dr. Nkrumah",
    year: 2018,
    level: "undergraduate",
    downloadUrl: "https://example.edu/docs/doc-7.pdf",
    department: "Data Science",
    abstract: "Cross-department similarity matching for reducing duplicate capstone projects."
  },
  {
    id: "doc-8",
    title: "Retrieval-Augmented Literature Review Assistant",
    author: "N. Kim",
    supervisor: "Dr. Boateng",
    year: 2020,
    level: "postgrad",
    downloadUrl: "https://example.edu/docs/doc-8.pdf",
    department: "Software Engineering",
    abstract: "Assists supervisors by retrieving related prior work from institutional repositories."
  },
  {
    id: "doc-9",
    title: "OCR and Semantic Parsing for Scanned Research PDFs",
    author: "D. Nartey",
    supervisor: "Dr. Adjei",
    year: 2017,
    level: "postgrad",
    downloadUrl: "https://example.edu/docs/doc-9.pdf",
    department: "Computer Science",
    abstract: "Pipeline for OCR cleanup and semantic chunk indexing on scanned academic documents."
  },
  {
    id: "doc-10",
    title: "Explainable Similarity Ranking for Proposal Reuse",
    author: "T. Ade",
    supervisor: "Prof. Mensimah",
    year: 2016,
    level: "undergraduate",
    downloadUrl: "https://example.edu/docs/doc-10.pdf",
    department: "Information Systems",
    abstract: "Explains why two research proposals are considered similar using sentence alignment."
  }
];

const delay = (ms = 350) => new Promise((resolve) => setTimeout(resolve, ms));

function scoreByQuery(query: string, title: string, abstract?: string) {
  const q = query.toLowerCase();
  const text = `${title} ${abstract ?? ""}`.toLowerCase();
  let score = 0.35;
  if (q.includes("semantic") && text.includes("semantic")) score += 0.28;
  if (q.includes("plagiarism") && text.includes("plagiarism")) score += 0.33;
  if (q.includes("pdf") && text.includes("pdf")) score += 0.2;
  return Math.min(0.98, score + Math.random() * 0.1);
}

function applyFilters<T extends {
  level?: DocumentRecord["level"];
  year?: number;
  department?: string;
  supervisor?: string;
}>(docs: T[], filters?: SearchFilters) {
  return docs.filter((doc) => {
    if (filters?.level && doc.level !== filters.level) return false;
    if (filters?.year && doc.year !== filters.year) return false;
    if (filters?.department && doc.department !== filters.department) return false;
    if (filters?.supervisor && doc.supervisor !== filters.supervisor) return false;
    return true;
  });
}

function sortDocs(docs: DocumentRecord[], sortBy: SearchSortBy, sortOrder: SearchSortOrder) {
  const dir = sortOrder === "asc" ? 1 : -1;
  return [...docs].sort((a, b) => {
    if (sortBy === "year") return ((a.year ?? 0) - (b.year ?? 0)) * dir;
    if (sortBy === "title") return a.title.localeCompare(b.title) * dir;
    return ((a.score ?? 0) - (b.score ?? 0)) * dir;
  });
}

function paginateDocs(docs: DocumentRecord[], page = 1, pageSize = 5) {
  const safePage = Math.max(1, page);
  const safePageSize = Math.max(1, pageSize);
  const start = (safePage - 1) * safePageSize;
  return docs.slice(start, start + safePageSize);
}

export const mockApi = {
  async ping(): Promise<{ ping: string }> {
    await delay(100);
    return { ping: "pong" };
  },

  async ingestDocuments(payload: { sourcePath?: string; files?: string[] }): Promise<IngestJob> {
    await delay();
    return {
      jobId: "mock-job-001",
      status: "completed",
      processedCount: 120,
      totalCount: 120,
      message: `Mock ingest completed for ${payload.sourcePath ?? "uploaded files"}`
    };
  },

  async getIngestJob(jobId: string): Promise<IngestJob> {
    await delay(200);
    return {
      jobId,
      status: "completed",
      processedCount: 120,
      totalCount: 120,
      message: "Mock job finished"
    };
  },

  async ingestFromUrl(payload: { url: string; filename?: string }): Promise<IngestJob> {
    await delay(800);
    return {
      jobId: "mock-job-from-url",
      status: "completed",
      processedCount: 1,
      totalCount: 1,
      message: `Mock indexed from URL (${payload.filename ?? "document"})`
    };
  },

  async semanticSearch(payload: SearchRequest): Promise<SearchResponse> {
    await delay();
    const sortBy = payload.sortBy ?? "relevance";
    const sortOrder = payload.sortOrder ?? "desc";
    const page = payload.page ?? 1;
    const pageSize = payload.pageSize ?? 5;

    const ranked = applyFilters(
      mockCorpus.map((doc) => ({ ...doc, score: scoreByQuery(payload.query, doc.title, doc.abstract) })),
      payload.filters
    )
      .slice(0, payload.topK);
    const sorted = sortDocs(ranked, sortBy, sortOrder);
    const semanticResults = paginateDocs(sorted, page, pageSize);

    return {
      query: payload.query,
      topK: payload.topK,
      total: sorted.length,
      page,
      pageSize,
      semanticResults,
      latencyMs: { semantic: 95 }
    };
  },

  async keywordSearch(payload: SearchRequest): Promise<SearchResponse> {
    await delay();
    const sortBy = payload.sortBy ?? "relevance";
    const sortOrder = payload.sortOrder ?? "desc";
    const page = payload.page ?? 1;
    const pageSize = payload.pageSize ?? 5;
    const q = payload.query.toLowerCase();
    const ranked = applyFilters(
      mockCorpus.filter((doc) => `${doc.title} ${doc.abstract ?? ""}`.toLowerCase().includes(q.split(" ")[0] ?? "")),
      payload.filters
    )
      .map((doc, idx) => ({ ...doc, score: 0.65 - idx * 0.08 }))
      .slice(0, payload.topK);
    const sorted = sortDocs(ranked, sortBy, sortOrder);
    const keywordResults = paginateDocs(sorted, page, pageSize);

    return {
      query: payload.query,
      topK: payload.topK,
      total: sorted.length,
      page,
      pageSize,
      semanticResults: keywordResults,
      keywordResults,
      latencyMs: { keyword: 43 }
    };
  },

  async getSimilarDocuments(documentId: string, topK = 5): Promise<SimilarityResponse> {
    await delay(250);
    const related = mockCorpus.filter((d) => d.id !== documentId).slice(0, topK).map((d, idx) => ({
      ...d,
      score: 0.9 - idx * 0.1
    }));

    return { documentId, related };
  },

  async getSignedDownloadUrl(documentId: string): Promise<SignedDownloadResponse> {
    await delay(150);
    const doc = mockCorpus.find((d) => d.id === documentId);
    if (!doc?.downloadUrl) {
      throw new Error("Document not found or no file attached.");
    }
    return {
      documentId,
      signedUrl: `${doc.downloadUrl}?signed=mock-token`,
      expiresIn: 300
    };
  },

  async getDocumentFullText(documentId: string): Promise<{ fullText: string; title: string; author?: string | null; year?: number | null; documentId: string }> {
    await delay(200);
    const doc = mockCorpus.find((d) => d.id === documentId);
    if (!doc) {
      throw new Error("Document not found.");
    }
    const fullText = doc.abstract ?? "No full text available for this document.";
    return { fullText, title: doc.title, author: doc.author ?? null, year: doc.year ?? null, documentId };
  },

  async getStatus() {
    await delay(100);
    return {
      initialized: true,
      total_chunks: 45,
      total_documents: mockCorpus.length
    };
  },

  async resetIndexCache() {
    await delay(150);
    return {
      cleared: true,
      removed_cache_files: mockCorpus.length + 2,
      removed_raw_pdfs: mockCorpus.length,
      message: "Mock cache cleared."
    };
  },

  async getIndexedDocuments() {
    await delay(150);
    return {
      documents: mockCorpus.map((d) => ({
        filename: d.id.endsWith(".pdf") ? d.id : `${d.id}.pdf`,
        pages: 12,
        chunks: 4
      }))
    };
  },

  async getAdminDocuments() {
    await delay(200);
    return {
      documents: mockCorpus.map((doc, idx) => ({
        id: doc.id,
        title: doc.title,
        author: doc.author ?? null,
        supervisor: doc.supervisor ?? null,
        year: doc.year ?? null,
        level: doc.level ?? null,
        department: doc.department ?? null,
        abstract: doc.abstract ?? null,
        file_path: `mock/${doc.id}.pdf`,
        created_at: new Date(Date.now() - idx * 86400000).toISOString(),
        indexed: true,
        pages: 12 + idx,
        chunks: 24 + idx
      }))
    };
  },

  async updateAdminDocument() {
    await delay(200);
    return { success: true, message: "Mock document metadata updated." };
  },

  async deleteAdminDocument() {
    await delay(200);
    return { success: true, message: "Mock document deleted." };
  },

  async reindexAdminDocument() {
    await delay(200);
    return { success: true, message: "Mock document added to the local index." };
  },

  async getAdminIngestJobs() {
    await delay(150);
    return {
      jobs: [
        {
          jobId: "mock-job-1",
          status: "completed",
          message: "Mock indexed 1 document.",
          title: mockCorpus[0]?.title ?? null,
          author: mockCorpus[0]?.author ?? null,
          year: mockCorpus[0]?.year ?? null,
          processedCount: 1,
          totalCount: 1
        }
      ]
    };
  },

  async getSavedDocuments() {
    await delay(120);
    return {
      documents: mockCorpus.slice(0, 2).map((doc, idx) => ({
        ...doc,
        savedAt: new Date(Date.now() - idx * 3600000).toISOString()
      })) as SavedDocument[]
    };
  },

  async saveDocumentToLibrary() {
    await delay(120);
    return { success: true, message: "Document saved to your library." };
  },

  async removeDocumentFromLibrary() {
    await delay(120);
    return { success: true, message: "Document removed from your library." };
  }
};




