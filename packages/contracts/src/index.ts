export type CVVersionStatus =
  | "awaiting_upload"
  | "quarantined"
  | "scanning"
  | "scan_failed"
  | "rejected"
  | "clean"
  | "extracting"
  | "needs_ocr"
  | "ready"
  | "extraction_failed"
  | "deleted";

export interface ProblemDetail {
  type: string;
  title: string;
  status: number;
  detail: string;
  code: string;
  request_id?: string;
  errors: Array<{ field: string; code: string; message: string }>;
}
