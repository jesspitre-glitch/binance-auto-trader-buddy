import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Props = {
  children: React.ReactNode;
  title?: string;
  resetKey?: unknown;
};

type State = {
  hasError: boolean;
  error?: Error;
};

export class SectionErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[SectionErrorBoundary] Unhandled section error", error, info);
  }

  componentDidUpdate(prevProps: Props) {
    // Auto-reset boundary when context changes (e.g. another config selected)
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      // eslint-disable-next-line react/no-did-update-set-state
      this.setState({ hasError: false, error: undefined });
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-3 md:p-4">
          <Card>
            <CardHeader>
              <CardTitle>{this.props.title ?? "Der skete en fejl"}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Denne sektion crashede. Du kan prøve at indlæse sektionen igen uden at genindlæse hele appen.
              </p>
              {this.state.error?.message ? (
                <pre className="text-xs whitespace-pre-wrap rounded-md bg-muted p-3">
                  {this.state.error.message}
                </pre>
              ) : null}
              <div className="flex gap-2">
                <Button onClick={() => this.setState({ hasError: false, error: undefined })}>
                  Prøv igen
                </Button>
                <Button variant="outline" onClick={() => window.location.reload()}>
                  Genindlæs siden
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}
