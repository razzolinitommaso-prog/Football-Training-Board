const rawApiBase = String(import.meta.env.VITE_API_URL ?? "").trim().replace(/\/$/, "");
const basePath = String(import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");

function isLocalBrowserHost(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1";
}

function shouldUseRelativeApiBase() {
  if (!rawApiBase || typeof window === "undefined") {
    return true;
  }

  try {
    const apiUrl = new URL(rawApiBase);
    const browserUrl = new URL(window.location.origin);

    if (apiUrl.origin === browserUrl.origin) {
      return true;
    }

    if (isLocalBrowserHost(apiUrl.hostname) && isLocalBrowserHost(browserUrl.hostname)) {
      return true;
    }

    // In dev, `VITE_API_URL` often points at loopback while the page is opened as http://192.168.x.x:PORT
    // (or another hostname). Calling http://localhost:3001 from that page is cross-origin: session cookies
    // set via the Vite proxy never reach the API, so dashboards look empty. Prefer same-origin `/api` → proxy.
    if (import.meta.env.DEV && isLocalBrowserHost(apiUrl.hostname)) {
      return true;
    }
  } catch {
    return true;
  }

  return false;
}

export const API_BASE = shouldUseRelativeApiBase() ? "" : rawApiBase;

/**
 * Builds URL for API calls. Paths must start with `/api/...`.
 * If `VITE_API_URL` already ends with `/api` (common misconfiguration), avoid `/api/api/...`
 * which returns Express 404 "Cannot GET /api/...".
 */
export function withApi(path: string) {
  let normalizedPath = path.startsWith("/") ? path : `/${path}`;
  if (API_BASE) {
    const base = API_BASE.replace(/\/$/, "");
    if (base.endsWith("/api") && (normalizedPath === "/api" || normalizedPath.startsWith("/api/"))) {
      normalizedPath = normalizedPath === "/api" ? "/" : normalizedPath.slice("/api".length);
      if (!normalizedPath.startsWith("/")) {
        normalizedPath = `/${normalizedPath}`;
      }
    }
    return `${base}${normalizedPath}`;
  }
  return `${basePath}${normalizedPath}`;
}
