import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { UploadPanel } from "./components/UploadPanel";

export function App() {
  const [client] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={client}>
      <main className="page">
        <h1>Invoice line-item extractor</h1>
        <p className="subtitle">
          Upload an invoice PDF. We show exactly what we could read, what we refused, and why - we never guess a number.
        </p>
        <ErrorBoundary>
          <UploadPanel />
        </ErrorBoundary>
      </main>
    </QueryClientProvider>
  );
}
