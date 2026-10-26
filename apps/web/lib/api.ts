export function apiBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_API_URL;

  if (typeof window !== "undefined") {
    if (configured) {
      try {
        const url = new URL(configured);
        const localHosts = new Set(["localhost", "127.0.0.1"]);
        // A local API cookie is host-scoped. Normalize a stale .env value so
        // opening the app at the other local hostname does not lose the
        // session immediately after sign-in.
        if (localHosts.has(url.hostname) && localHosts.has(window.location.hostname)) {
          url.hostname = window.location.hostname;
        }
        return url.toString().replace(/\/$/, "");
      } catch {
        // Fall through to the same-host development default for malformed
        // configuration rather than issuing requests to an invalid URL.
      }
    }
    return `${window.location.protocol}//${window.location.hostname}:8000/api/v1`;
  }

  return configured ?? "http://localhost:8000/api/v1";
}

export function csrfToken(): string | null {
  if (typeof document === "undefined") return null;
  const token = document.cookie
    .split("; ")
    .find((cookie) => cookie.startsWith("csrf_token="))
    ?.slice("csrf_token=".length);
  return token ? decodeURIComponent(token) : null;
}
