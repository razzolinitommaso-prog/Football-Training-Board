const AUTH_TOKEN_KEY = "ftb-auth-token";
const PARENT_CHILD_KEY = "ftb-expected-parent-child";
export const PARENT_CHILD_CHANGED_KEY = "ftb-parent-child-changed";

export function setExpectedParentChild(playerId?: number) {
  if (playerId === undefined) sessionStorage.removeItem(PARENT_CHILD_KEY);
  else sessionStorage.setItem(PARENT_CHILD_KEY, String(playerId));
}

function isApiRequest(input: RequestInfo | URL): boolean {
  if (typeof window === "undefined") return false;
  if (typeof input === "string") {
    try {
      const url = new URL(input, window.location.origin);
      return url.pathname.startsWith("/api");
    } catch {
      return input.startsWith("/api");
    }
  }
  if (input instanceof URL) return input.pathname.startsWith("/api");
  if (typeof Request !== "undefined" && input instanceof Request) {
    try {
      return new URL(input.url, window.location.origin).pathname.startsWith("/api");
    } catch {
      return false;
    }
  }
  return false;
}

export function getAuthToken(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(AUTH_TOKEN_KEY) ?? "";
}

export function setAuthToken(token: unknown): void {
  if (typeof window === "undefined") return;
  const value = typeof token === "string" ? token.trim() : "";
  if (value) localStorage.setItem(AUTH_TOKEN_KEY, value);
}

export function clearAuthToken(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(AUTH_TOKEN_KEY);
  setExpectedParentChild();
}

export function authHeadersFor(input: RequestInfo | URL, init?: RequestInit): Headers | undefined {
  const token = getAuthToken();
  if (!isApiRequest(input)) return undefined;
  const expectedChild = sessionStorage.getItem(PARENT_CHILD_KEY);
  if (!token && !expectedChild) return undefined;
  const headers = new Headers(init?.headers ?? (typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined));
  if (token && !headers.has("Authorization")) headers.set("Authorization", `Bearer ${token}`);
  if (expectedChild) headers.set("X-FTB-Parent-Child", expectedChild);
  return headers;
}
