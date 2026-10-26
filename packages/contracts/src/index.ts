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

export type JobSearchStatus = "queued" | "running" | "succeeded" | "partial" | "failed";

export interface JobSearch {
  id: string;
  target_roles: string[];
  locations: string[];
  work_arrangements: string[];
  experience_levels: string[];
  status: JobSearchStatus;
  provider_status: "queued" | "unconfigured" | "available" | "partial" | "unavailable";
  result_count: number;
  provider_count: number;
  failure_code: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface JobMatch {
  id: string;
  score: number;
  rank: number;
  matched_skills: string[];
  missing_required_skills: string[];
  evidence: Record<string, unknown>;
  listing: JobListing;
}

export interface JobListing {
  id: string;
  title: string;
  company_name: string;
  location: string | null;
  work_arrangement: string | null;
  experience_level: string | null;
  description: string;
  required_skills: string[];
  optional_skills: string[];
  salary_min_minor: number | null;
  salary_max_minor: number | null;
  salary_currency: string | null;
  published_at: string | null;
  last_verified_at: string;
  canonical_url: string;
  status: "active" | "expired" | "removed";
  source: { provider_key: string; display_name: string; terms_url: string };
}
