import { apiBaseUrl, csrfToken } from "@/lib/api";

export type JobSearch = {
  id: string;
  cv_version_id: string | null;
  target_roles: string[];
  locations: string[];
  work_arrangements: string[];
  experience_levels: string[];
  status: "queued" | "running" | "succeeded" | "partial" | "failed" | "cancelled";
  provider_status: string;
  result_count: number;
  provider_count: number;
  failure_code: string | null;
  created_at: string;
  completed_at: string | null;
};

export type JobListing = {
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
};

export type JobMatch = {
  id: string;
  score: number;
  rank: number;
  matched_skills: string[];
  missing_required_skills: string[];
  evidence: { formula_version?: string; dimensions?: Record<string, number>; notes?: string[] };
  listing: JobListing;
};

export type SavedJob = { id: string; listing_id: string; created_at: string; listing: JobListing };

export type JobPreferences = {
  target_roles: string[];
  locations: string[];
  work_arrangements: string[];
  experience_levels: string[];
  salary_min_minor: number | null;
  salary_max_minor: number | null;
  salary_currency: string | null;
  include_salary_unknown: boolean;
};

export async function jobsRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  const token = csrfToken();
  if (token) headers.set("X-CSRF-Token", token);
  const response = await fetch(`${apiBaseUrl()}${path}`, { ...init, credentials: "include", headers });
  const payload = await response.json().catch(() => null) as { detail?: string } | T | null;
  if (!response.ok) {
    const detail = payload && typeof payload === "object" && "detail" in payload ? payload.detail : undefined;
    throw new Error(detail || "The job request could not be completed.");
  }
  return payload as T;
}

export function getPreferences() { return jobsRequest<JobPreferences>("/users/me/preferences"); }
export function updatePreferences(preferences: JobPreferences) {
  return jobsRequest<JobPreferences>("/users/me/preferences", { method: "PUT", body: JSON.stringify(preferences) });
}
export function startJobSearch(payload: {
  cv_version_id?: string;
  target_roles: string[];
  locations: string[];
  work_arrangements: string[];
  experience_levels: string[];
  salary_min_minor?: number;
  salary_currency?: string;
  include_salary_unknown: boolean;
}) {
  return jobsRequest<JobSearch>("/job-searches", { method: "POST", body: JSON.stringify(payload) });
}
export function getJobSearch(searchId: string) { return jobsRequest<JobSearch>(`/job-searches/${searchId}`); }
export function cancelJobSearch(searchId: string) { return jobsRequest<JobSearch>(`/job-searches/${searchId}/cancel`, { method: "POST" }); }
export function getJobMatches(searchId: string) { return jobsRequest<{ data: JobMatch[] }>(`/job-searches/${searchId}/matches?limit=100`); }
export function getLatestJobSearch() { return jobsRequest<{ data: JobSearch[] }>("/job-searches?limit=1"); }
export function getSavedJobs() { return jobsRequest<{ data: SavedJob[] }>("/saved-jobs?limit=100"); }
export function saveJob(listingId: string) { return jobsRequest<SavedJob>("/saved-jobs", { method: "POST", body: JSON.stringify({ listing_id: listingId }) }); }
export function removeSavedJob(savedJobId: string) { return jobsRequest<void>(`/saved-jobs/${savedJobId}`, { method: "DELETE" }); }
