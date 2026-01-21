import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Play, Square, Settings2, History, TrendingUp, Search, BarChart3, Radio, Clock } from "lucide-react";

import { ThemeToggle } from "./ThemeToggle";
import { PositionManager } from "./PositionManager";
import { PortfolioBalance } from "./PortfolioBalance";
import { IndicatorConfig } from "./IndicatorConfig";
import { PnLOverview } from "./PnLOverview";
import { ScanResults } from "./ScanResults";
import { StrategyAnalysis } from "./StrategyAnalysis";
import { TradeHistoryTable } from "./TradeHistoryTable";
import { ContinuousSyncControl } from "./ContinuousSyncControl";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SectionErrorBoundary } from "./SectionErrorBoundary";

export const TradingDashboard = () => {
  const [isActive, setIsActive] = useState(false);
  const [configs, setConfigs] = useState<any[]>([]);
  const [activeConfigId, setActiveConfigId] = useState<string | null>(null);
  const [selectedConfig, setSelectedConfig] = useState<any>(null);
  const { toast } = useToast();

  // Get the updated_at timestamp from the active config
  const activeConfig = configs.find((c) => c.id === activeConfigId);
  const lastUpdated = activeConfig?.updated_at ? new Date(activeConfig.updated_at) : null;
  
  // Debug logging for timestamp
  console.log("[TradingDashboard] activeConfigId:", activeConfigId, "| updated_at from DB:", activeConfig?.updated_at, "| lastUpdated:", lastUpdated?.toISOString());

  const fetchConfigs = async () => {
    try {
      const { data, error } = await supabase
        .from("indicator_config")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setConfigs(data || []);
      
      if (data && data.length > 0 && !activeConfigId) {
        setActiveConfigId(data[0].id);
      }
    } catch (error: any) {
      toast({
        title: "Fejl",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleConfigSave = () => {
    fetchConfigs();
  };

  const fetchSession = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.log("No user found during session fetch");
        return;
      }

      const { data, error } = await supabase
        .from("trading_session")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) {
        console.error("Trading session query error:", error);
        return;
      }
      
      if (data) {
        setIsActive(data.is_active || false);
        if (data.active_config_id) {
          setActiveConfigId(data.active_config_id);
        }
        
        // Auto-restart scanner if trading session is active but scanner is not
        if (data.is_active) {
          try {
            const { data: scannerStatus } = await supabase
              .from("scanner_status")
              .select("is_active")
              .eq("id", "main")
              .maybeSingle();
            
            if (!scannerStatus?.is_active) {
              console.log("Scanner inactive but trading active - restarting scanner");
              await supabase.functions.invoke('continuous-scan-quant', {
                body: { action: 'start', interval_ms: 3000, user_id: user.id }
              }).catch(err => console.error("Scanner restart failed:", err));
            }
          } catch (scanError) {
            console.error("Scanner status check failed:", scanError);
          }
        }
      }
    } catch (error: any) {
      console.error("Session fetch error:", error);
    }
  };

  useEffect(() => {
    fetchConfigs();
    fetchSession();

    // Refresh data when user returns to the tab
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchConfigs();
        fetchSession();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    const channel = supabase
      .channel("indicator-config-listener")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "indicator_config" },
        () => {
          fetchConfigs();
        }
      )
      .subscribe();

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      supabase.removeChannel(channel);
    };
  }, []);

  const toggleTrading = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      if (!activeConfigId && !isActive) {
        toast({
          title: "Vælg en konfiguration",
          description: "Du skal vælge en strategi før du starter trading",
          variant: "destructive",
        });
        return;
      }

      const newState = !isActive;
      
      const updateData: any = {
        user_id: user.id,
        is_active: newState,
        active_config_id: activeConfigId,
      };
      
      // Only set started_at when starting the bot
      if (newState) {
        updateData.started_at = new Date().toISOString();
      }
      
      const { error } = await supabase
        .from("trading_session")
        .upsert(updateData, {
          onConflict: 'user_id'
        });

      if (error) throw error;

      // Start/stop continuous scanner with user_id for DB persistence
      const scannerAction = newState ? 'start' : 'stop';
      const { data: scannerResult, error: scannerError } = await supabase.functions.invoke('continuous-scan-quant', {
        body: { 
          action: scannerAction, 
          interval_ms: 3000,
          user_id: user.id  // Pass user_id for DB-based scanner status
        }
      });

      if (scannerError) {
        console.error('Scanner toggle error:', scannerError);
        toast({
          title: "Scanner advarsel",
          description: `Kunne ikke ${scannerAction === 'start' ? 'starte' : 'stoppe'} continuous scanner`,
          variant: "destructive",
        });
      } else {
        console.log('Scanner result:', scannerResult);
      }

      setIsActive(newState);
      
      toast({
        title: newState ? "Trading startet" : "Trading stoppet",
        description: newState
          ? "Auto-trading og continuous scanner er nu aktivt. Scanner kører i baggrunden."
          : "Auto-trading og continuous scanner er stoppet",
      });
    } catch (error: any) {
      toast({
        title: "Fejl",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  return (
    <div className="container mx-auto p-3 md:p-6 space-y-4 md:space-y-6 pb-20 md:pb-6">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl md:text-3xl font-bold">Trading Dashboard</h1>
          <ThemeToggle />
        </div>
        <div className="flex items-center gap-3 md:gap-4 w-full md:w-auto">
          <Button
            onClick={toggleTrading}
            variant={isActive ? "destructive" : "default"}
            size="lg"
            className="min-w-[120px] md:min-w-[160px] flex-1 md:flex-none h-12 md:h-auto"
          >
            {isActive ? (
              <>
                <Square className="mr-2 h-5 w-5" />
                Stop Bot
              </>
            ) : (
              <>
                <Play className="mr-2 h-5 w-5" />
                Start Bot
              </>
            )}
          </Button>
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={`px-3 py-1 rounded-full text-sm font-medium ${
                isActive
                  ? "bg-success/10 text-success"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {isActive ? "Aktiv" : "Inaktiv"}
            </span>
            <span
              className={`px-3 py-1 rounded-full text-sm font-medium flex items-center gap-1.5 ${
                isActive
                  ? "bg-success/10 text-success"
                  : "bg-destructive/10 text-destructive"
              }`}
            >
              <Radio className={`h-3 w-3 ${isActive ? 'animate-pulse' : ''}`} />
              Scanner: {isActive ? 'Kører' : 'Stoppet'}
            </span>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle>Strategi Indstillinger</CardTitle>
          {lastUpdated && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              <span>Gemt: {lastUpdated.toLocaleString("da-DK", { timeZone: "Europe/Copenhagen", hour: "2-digit", minute: "2-digit", second: "2-digit", day: "2-digit", month: "2-digit", year: "numeric" })}</span>
            </div>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <Label>Vælg Aktiv Strategi</Label>
              <Select value={activeConfigId ?? ""} onValueChange={(v) => setActiveConfigId(v || null)}>
                <SelectTrigger>
                  <SelectValue placeholder="Vælg en strategi" />
                </SelectTrigger>
                <SelectContent>
                  {configs.map((config) => (
                    <SelectItem key={config.id} value={config.id}>
                      <div className="flex items-center justify-between w-full pr-2">
                        <span>{config.name} {config.enabled ? "" : "(Deaktiveret)"}</span>
                        {config.id === activeConfigId && isActive && (
                          <div className="flex items-center gap-1 px-2 py-0.5 bg-primary/20 text-primary rounded text-xs">
                            <div className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse" />
                            Kører
                          </div>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {activeConfigId && (
                <div className="mt-2 flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">Valgt:</span>
                  <span className="font-medium">
                    {configs.find(c => c.id === activeConfigId)?.name || "Ukendt"}
                  </span>
                  {isActive && (
                    <div className="flex items-center gap-1 px-2 py-0.5 bg-primary/10 text-primary rounded">
                      <div className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse" />
                      <span className="text-xs font-medium">Aktiv</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <PortfolioBalance />

      <ContinuousSyncControl />

      <PositionManager />

      <Tabs defaultValue="pnl">
        <TabsList className="grid w-full grid-cols-5 h-auto md:h-10 gap-1 p-1 bg-muted">
          <TabsTrigger value="pnl" className="flex-col md:flex-row gap-1 md:gap-2 h-16 md:h-auto text-xs md:text-sm">
            <TrendingUp className="h-5 w-5 md:h-4 md:w-4" />
            <span className="hidden md:inline">P&L</span>
            <span className="md:hidden">P&L</span>
          </TabsTrigger>
          <TabsTrigger value="strategy" className="flex-col md:flex-row gap-1 md:gap-2 h-16 md:h-auto text-xs md:text-sm">
            <BarChart3 className="h-5 w-5 md:h-4 md:w-4" />
            <span className="hidden md:inline">Strategi Analyse</span>
            <span className="md:hidden">Strategi</span>
          </TabsTrigger>
          <TabsTrigger value="scan" className="flex-col md:flex-row gap-1 md:gap-2 h-16 md:h-auto text-xs md:text-sm">
            <Search className="h-5 w-5 md:h-4 md:w-4" />
            <span className="hidden md:inline">Scan Resultater</span>
            <span className="md:hidden">Scan</span>
          </TabsTrigger>
          <TabsTrigger value="history" className="flex-col md:flex-row gap-1 md:gap-2 h-16 md:h-auto text-xs md:text-sm">
            <History className="h-5 w-5 md:h-4 md:w-4" />
            <span className="hidden md:inline">Historik</span>
            <span className="md:hidden">Historik</span>
          </TabsTrigger>
          <TabsTrigger value="config" className="flex-col md:flex-row gap-1 md:gap-2 h-16 md:h-auto text-xs md:text-sm">
            <Settings2 className="h-5 w-5 md:h-4 md:w-4" />
            <span className="hidden md:inline">Indikator Konfiguration</span>
            <span className="md:hidden">Config</span>
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="pnl">
          <SectionErrorBoundary title="P&L Oversigt">
            <PnLOverview />
          </SectionErrorBoundary>
        </TabsContent>

        <TabsContent value="strategy">
          <SectionErrorBoundary title="Strategi Analyse">
            <StrategyAnalysis />
          </SectionErrorBoundary>
        </TabsContent>

        <TabsContent value="scan">
          <SectionErrorBoundary title="Scan Resultater">
            <ScanResults />
          </SectionErrorBoundary>
        </TabsContent>

        <TabsContent value="history" className="space-y-4">
          <SectionErrorBoundary title="Trade Historik">
            <TradeHistoryTable />
          </SectionErrorBoundary>
        </TabsContent>
        
        <TabsContent value="config">
          <SectionErrorBoundary title="Indikator Konfiguration" resetKey={activeConfigId}>
            <IndicatorConfig
              config={configs.find((c) => c.id === activeConfigId)}
              onSave={handleConfigSave}
            />
          </SectionErrorBoundary>
        </TabsContent>
      </Tabs>
    </div>
  );
};