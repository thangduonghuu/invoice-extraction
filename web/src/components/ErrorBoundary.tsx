"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { toUserError } from "@/lib/errors";
import { FailedView } from "./FailedView";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/** Uses the same toUserError() + FailedView as every other failure path - no bespoke "Something crashed" screen. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Unhandled error in UploadPanel", error, info);
  }

  override render() {
    if (this.state.error) {
      return <FailedView error={toUserError("UNKNOWN", { detail: this.state.error.message })} onRetry={() => this.setState({ error: null })} />;
    }
    return this.props.children;
  }
}
