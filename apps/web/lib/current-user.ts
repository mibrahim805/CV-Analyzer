import { apiBaseUrl } from "@/lib/api";

export type CurrentUser = {
  email: string;
  profile: {
    display_name: string | null;
  };
};

export async function fetchCurrentUser(signal?: AbortSignal): Promise<CurrentUser | null> {
  const response = await fetch(`${apiBaseUrl()}/users/me`, {
    credentials: "include",
    signal,
  });
  if (!response.ok) return null;
  return response.json() as Promise<CurrentUser>;
}
