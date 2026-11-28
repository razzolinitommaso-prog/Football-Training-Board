import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { LanguageProvider } from "../../artifacts/football-training-board/src/lib/i18n";
import { TooltipProvider } from "../../artifacts/football-training-board/src/components/ui/tooltip";
import { TechnicalScopeProvider } from "../../artifacts/football-training-board/src/components/technical-scope";
import { Toaster } from "../../artifacts/football-training-board/src/components/ui/toaster";
import { AppErrorBoundary } from "../../artifacts/football-training-board/src/components/AppErrorBoundary";
import App from "../../artifacts/football-training-board/src/App";
import { mockResponse } from "./fixtures";
import { AccessibilityAudit } from "./accessibility";
import { ReportEditorFixture } from "./report-editor";
import {ExportDownloadsFixture} from "./export-downloads";
window.fetch = mockResponse;
createRoot(document.getElementById("root")!).render(
  <QueryClientProvider
    client={
      new QueryClient({
        defaultOptions: {
          queries: { retry: false, refetchOnWindowFocus: false },
        },
      })
    }
  >
    <ThemeProvider attribute="class" defaultTheme="light">
      <LanguageProvider>
        <TooltipProvider>
          <TechnicalScopeProvider>
            <AppErrorBoundary>
              {location.pathname === "/__export-downloads" ? <ExportDownloadsFixture/> : location.pathname === "/__report-editor" ? <ReportEditorFixture/> : <App />}
            </AppErrorBoundary>
          </TechnicalScopeProvider>
          <Toaster />
          <AccessibilityAudit />
        </TooltipProvider>
      </LanguageProvider>
    </ThemeProvider>
  </QueryClientProvider>,
);
