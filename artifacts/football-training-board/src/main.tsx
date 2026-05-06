import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router as WouterRouter } from "wouter";
import App from "./App";
import { AuthProvider } from "@/hooks/use-auth";
import { LanguageProvider } from "@/lib/i18n";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { withApi } from "@/lib/api-base";
import "./index.css";

const queryClient = new QueryClient();

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

createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <LanguageProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <AuthProvider>
            <App />
          </AuthProvider>
        </WouterRouter>
        <Toaster />
      </LanguageProvider>
    </TooltipProvider>
  </QueryClientProvider>,
);
