import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Props = {
  children: React.ReactNode;
};

type State = {
  hasError: boolean;
  error?: Error;
};

export class AppErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[AppErrorBoundary] Unhandled render error", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4">
          <Card className="w-full max-w-lg">
            <CardHeader>
              <CardTitle>Der skete en fejl</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Appen crashede under indlæsning. Prøv at genindlæse siden.
              </p>
              {this.state.error?.message ? (
                <pre className="text-xs whitespace-pre-wrap rounded-md bg-muted p-3">
                  {this.state.error.message}
                </pre>
              ) : null}
              <div className="flex gap-2">
                <Button onClick={() => window.location.reload()}>Genindlæs</Button>
                <Button
                  variant="outline"
                  onClick={() => this.setState({ hasError: false, error: undefined })}
                >
                  Prøv igen
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
