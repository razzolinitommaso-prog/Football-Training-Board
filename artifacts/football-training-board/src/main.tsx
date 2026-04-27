import { createRoot } from "react-dom/client";
import App from "./App";
import { withApi } from "@/lib/api-base";
import "./index.css";

if (typeof window !== "undefined") {
  const originalFetch = window.fetch.bind(window);

  window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    if (typeof input === "string" && input.startsWith("/api")) {
      return originalFetch(withApi(input), init);
    }

    if (input instanceof URL && input.pathname.startsWith("/api")) {
      return originalFetch(withApi(`${input.pathname}${input.search}${input.hash}`), init);
    }

    if (typeof Request !== "undefined" && input instanceof Request) {
      const url = new URL(input.url, window.location.origin);
      if (url.origin === window.location.origin && url.pathname.startsWith("/api")) {
        return originalFetch(
          new Request(withApi(`${url.pathname}${url.search}${url.hash}`), input),
          init,
        );
      }
    }

    return originalFetch(input, init);
  }) as typeof window.fetch;
}

createRoot(document.getElementById("root")!).render(<App />);
