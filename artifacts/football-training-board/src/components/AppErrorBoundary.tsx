import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

type AppErrorBoundaryProps = {
  children: ReactNode;
};

type AppErrorBoundaryState = {
  error: Error | null;
};

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (import.meta.env.DEV) {
      console.error("[app] render error", error, info);
    }
  }

  private retry = () => {
    this.setState({ error: null });
  };

  render() {
    if (!this.state.error) {
      return this.props.children;
    }

    return (
      <div className="min-h-screen bg-background px-4 py-10 text-foreground">
        <div className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-xl border bg-card p-6 text-center shadow-sm">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-700">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">L'app non ha completato il caricamento</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Riprova senza ricaricare la pagina. Se il problema continua, il dettaglio tecnico è visibile nella console.
            </p>
          </div>
          <button
            type="button"
            onClick={this.retry}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-primary-border bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            <RefreshCw className="h-4 w-4" />
            Riprova
          </button>
        </div>
      </div>
    );
  }
}
