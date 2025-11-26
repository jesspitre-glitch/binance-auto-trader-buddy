import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Search, TrendingUp, TrendingDown, RefreshCw, Activity } from "lucide-react";
import { ScanResultVisual } from "./ScanResultVisual";
import { LiveScanMonitor } from "./LiveScanMonitor";

export const ScanResults = () => {
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [selectedResult, setSelectedResult] = useState<any>(null);
  const [liveMonitorOpen, setLiveMonitorOpen] = useState(false);
  const [config, setConfig] = useState<any>(null);
  const { toast } = useToast();

  const fetchResults = async () => {
    try {
      const { data, error } = await supabase
        .from("scan_results")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) throw error;
      // Keep only the newest result per symbol
      const latestBySymbol = new Map<string, any>();
      (data || []).forEach((row) => {
        if (!latestBySymbol.has(row.symbol)) {
          latestBySymbol.set(row.symbol, row);
        }
      });
      setResults(Array.from(latestBySymbol.values()));
    } catch (error: any) {
      console.error("Scan results fetch error:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchResults();
    fetchConfig();

    // Realtime subscription
    const channel = supabase
      .channel("scan-results-changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "scan_results",
        },
        (payload) => {
          console.log("New scan result:", payload);
          if (payload.eventType === "INSERT") {
            const newResult = payload.new as any;
            setResults((prev) => {
              const filtered = prev.filter((r) => r.symbol !== newResult.symbol);
              return [newResult, ...filtered];
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchConfig = async () => {
    try {
      const { data, error } = await supabase
        .from("indicator_config")
        .select("*")
        .eq("enabled", true)
        .single();
      
      if (error) throw error;
      setConfig(data);
    } catch (error) {
      console.error("Error fetching config:", error);
    }
  };

  const triggerScan = async () => {
    setScanning(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const { data, error } = await supabase.functions.invoke("auto-trade-quant", {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (error) throw error;

      toast({
        title: "Scanning Fuldført",
        description: "Markeds scanning er gennemført",
      });

      fetchResults();
    } catch (error: any) {
      toast({
        title: "Fejl",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setScanning(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <CardTitle className="flex items-center gap-2">
          <Search className="h-5 w-5" />
          Scan Resultater
        </CardTitle>
        <div className="flex gap-2">
          <Button 
            onClick={() => setLiveMonitorOpen(true)} 
            variant="outline"
            size="sm"
          >
            <Activity className="mr-2 h-4 w-4" />
            Live Monitor
          </Button>
          <Button onClick={triggerScan} disabled={scanning} size="sm">
            {scanning ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Scanner...
              </>
            ) : (
              <>
                <RefreshCw className="mr-2 h-4 w-4" />
                Scan Nu
              </>
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {results.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">
            Ingen scan resultater endnu. Tryk "Scan Nu" for at starte.
          </p>
        ) : (
          <div className="space-y-3">
            {results.map((result) => (
              <div
                key={result.id}
                className="flex items-center justify-between border rounded-lg p-4 hover:bg-accent transition-colors cursor-pointer"
                onClick={() => setSelectedResult(result)}
              >
                <div className="flex items-center gap-4">
                  {result.signal === "LONG" ? (
                    <TrendingUp className="h-5 w-5 text-profit" />
                  ) : result.signal === "SHORT" ? (
                    <TrendingDown className="h-5 w-5 text-loss" />
                  ) : (
                    <div className="h-5 w-5 rounded-full bg-muted" />
                  )}

                  <div>
                    <div className="font-semibold">{result.symbol}</div>
                    <div className="text-sm text-muted-foreground">
                      {new Date(result.created_at).toLocaleString("da-DK", { timeZone: "UTC" })} UTC
                    </div>
                  </div>

                  <Badge
                    variant={
                      result.signal === "LONG"
                        ? "default"
                        : result.signal === "SHORT"
                        ? "secondary"
                        : "outline"
                    }
                  >
                    {result.signal}
                  </Badge>

                  {result.indicators && (
                    <div className="text-sm space-y-1">
                      <div>
                        Pris:{" "}
                        <span className="font-mono">
                          ${result.indicators.price?.toFixed(2)}
                        </span>
                      </div>
                      <div>
                        RSI:{" "}
                        <span className="font-mono">
                          {result.indicators.rsi?.toFixed(1)}
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                <div className="text-right">
                  <div className="text-sm text-muted-foreground">
                    {result.action_taken?.replace(/_/g, " ")}
                  </div>
                  {result.signal !== "NONE" && (
                    <div className="text-xs space-y-1 mt-1">
                      <div>SL: ${result.stop_loss?.toFixed(2)}</div>
                      <div>TP: ${result.take_profit?.toFixed(2)}</div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
      
      <ScanResultVisual
        open={!!selectedResult}
        onOpenChange={(open) => !open && setSelectedResult(null)}
        result={selectedResult}
        config={config}
      />
      
      <LiveScanMonitor
        open={liveMonitorOpen}
        onOpenChange={setLiveMonitorOpen}
      />
    </Card>
  );
};
