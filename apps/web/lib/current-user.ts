export type CurrentUser = {
  email: string;
  profile: {
    display_name: string | null;
  };
};

function apiBaseUrl() {
  return process.env.NEXT_PUBLIC_API_URL
    ?? `${window.location.protocol}//${window.location.hostname}:8000/api/v1`;
}

export async function fetchCurrentUser(signal?: AbortSignal): Promise<CurrentUser | null> {
  const response = await fetch(`${apiBaseUrl()}/users/me`, {
    credentials: "include",
    signal,
  });
  if (!response.ok) return null;
  return response.json() as Promise<CurrentUser>;
}
