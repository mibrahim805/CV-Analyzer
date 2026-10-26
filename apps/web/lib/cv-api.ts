import { apiBaseUrl, csrfToken } from "@/lib/api";

export const MAX_CV_BYTES = 10 * 1024 * 1024;
export const CV_MEDIA_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

export type CVDocument = {
  id: string;
  label: string;
  active_version_id: string | null;
  created_at: string;
  updated_at: string;
};

export type CVVersion = {
  id: string;
  document_id: string;
  version_no: number;
  original_name: string;
  media_type: string;
  byte_size: number;
  status: string;
  failure_code: string | null;
  created_at: string;
  updated_at: string;
};

export type CVExtractionStatus = {
  version_id: string;
  status: string;
  failure_code: string | null;
  extraction: {
    id: string;
    version_id: string;
    method: string;
    page_count: number | null;
    character_count: number;
    language: string | null;
    created_at: string;
    updated_at: string;
  } | null;
};

export type CVAnalysis = {
  version_id: string;
  analysis_type: string;
  metrics: Record<string, number>;
  checks: Array<{ key: string; status: string; detail: string; evidence: string }>;
  recommendations: string[];
  generated_at: string;
};

export type UploadInitiateResponse = {
  document: CVDocument;
  version: CVVersion;
  upload: { url: string; method?: string; headers: Record<string, string> };
};

export async function parseApiResponse<T>(response: Response, fallback: string): Promise<T> {
  const body = await response.json().catch(() => null) as { detail?: string; message?: string } | null;
  if (!response.ok) throw new Error(body?.detail || body?.message || fallback);
  return body as T;
}

export async function listCVDocuments(signal?: AbortSignal): Promise<CVDocument[]> {
  const response = await fetch(`${apiBaseUrl()}/cv-documents?limit=100`, { credentials: "include", signal });
  const data = await parseApiResponse<{ data?: CVDocument[]; items?: CVDocument[] }>(response, "Your CV library could not be loaded.");
  return data.data ?? data.items ?? [];
}

export async function getCVVersion(documentId: string, versionId: string, signal?: AbortSignal): Promise<CVVersion> {
  const response = await fetch(`${apiBaseUrl()}/cv-documents/${documentId}/versions/${versionId}`, { credentials: "include", signal });
  return parseApiResponse<CVVersion>(response, "The CV version could not be loaded.");
}

export async function getCVExtraction(documentId: string, versionId: string, signal?: AbortSignal): Promise<CVExtractionStatus> {
  const response = await fetch(`${apiBaseUrl()}/cv-documents/${documentId}/versions/${versionId}/extraction`, { credentials: "include", signal });
  return parseApiResponse<CVExtractionStatus>(response, "The CV processing status could not be loaded.");
}

export async function analyzeCV(documentId: string, versionId: string): Promise<CVAnalysis> {
  const token = csrfToken();
  if (!token) throw new Error("Your session security token is missing. Refresh the page and try again.");
  const response = await fetch(`${apiBaseUrl()}/cv-documents/${documentId}/versions/${versionId}/analyze`, {
    method: "POST",
    credentials: "include",
    headers: { "X-CSRF-Token": token },
  });
  return parseApiResponse<CVAnalysis>(response, "The CV could not be analyzed.");
}

export async function deleteCV(documentId: string): Promise<void> {
  const token = csrfToken();
  if (!token) throw new Error("Your session security token is missing. Refresh the page and try again.");
  const response = await fetch(`${apiBaseUrl()}/cv-documents/${documentId}`, {
    method: "DELETE",
    credentials: "include",
    headers: { "X-CSRF-Token": token },
  });
  await parseApiResponse(response, "The CV could not be deleted.");
}

export async function uploadCVFile(
  file: File,
  onProgress?: (stage: "hashing" | "uploading" | "scanning" | "extracting") => void,
): Promise<{ document: CVDocument; version: CVVersion; extraction: CVExtractionStatus }> {
  const extension = file.name.split(".").pop()?.toLowerCase();
  const mediaType = extension ? CV_MEDIA_TYPES[extension] : undefined;
  if (!mediaType) throw new Error("Choose a PDF or DOCX file.");
  if (file.size === 0) throw new Error("That file is empty. Choose a CV with content.");
  if (file.size > MAX_CV_BYTES) throw new Error("CV files must be 10 MB or smaller.");
  const token = csrfToken();
  if (!token) throw new Error("Your session security token is missing. Refresh the page and try again.");

  onProgress?.("hashing");
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  const sha256 = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  onProgress?.("uploading");
  const initiateResponse = await fetch(`${apiBaseUrl()}/cv-documents/uploads`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", "X-CSRF-Token": token },
    body: JSON.stringify({ filename: file.name, media_type: mediaType, byte_size: file.size, sha256 }),
  });
  const initiate = await parseApiResponse<UploadInitiateResponse>(initiateResponse, "The CV could not be uploaded.");
  const objectResponse = await fetch(initiate.upload.url, { method: initiate.upload.method ?? "PUT", headers: initiate.upload.headers, body: file });
  if (!objectResponse.ok) throw new Error("The file could not be transferred to secure storage.");

  onProgress?.("scanning");
  const completeResponse = await fetch(`${apiBaseUrl()}/cv-documents/${initiate.document.id}/versions/${initiate.version.id}/complete`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", "X-CSRF-Token": token },
    body: JSON.stringify({ byte_size: file.size, sha256 }),
  });
  await parseApiResponse(completeResponse, "The CV upload could not be finalized.");
  onProgress?.("extracting");
  const extraction = await waitForExtraction(initiate.document.id, initiate.version.id, token);
  return { document: initiate.document, version: initiate.version, extraction };
}

async function waitForExtraction(documentId: string, versionId: string, token: string): Promise<CVExtractionStatus> {
  for (let attempt = 0; attempt < 45; attempt += 1) {
    const response = await fetch(`${apiBaseUrl()}/cv-documents/${documentId}/versions/${versionId}/extraction`, { credentials: "include", headers: { "X-CSRF-Token": token } });
    const extraction = await parseApiResponse<CVExtractionStatus>(response, "The CV processing status could not be checked.");
    if (!["awaiting_upload", "quarantined", "scanning", "clean", "extracting", "processing"].includes(extraction.status)) return extraction;
    await new Promise((resolve) => window.setTimeout(resolve, 2000));
  }
  return getCVExtraction(documentId, versionId);
}
