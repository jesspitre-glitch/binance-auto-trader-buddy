import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Play, Square, Settings2, History } from "lucide-react";
import { PositionManager } from "./PositionManager";
import { PortfolioBalance } from "./PortfolioBalance";
import { IndicatorConfig } from "./IndicatorConfig";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const TradingDashboard = () => {
  const [isActive, setIsActive] = useState(false);
  const [configs, setConfigs] = useState<any[]>([]);
  const [activeConfigId, setActiveConfigId] = useState<string | null>(null);
  const [selectedConfig, setSelectedConfig] = useState<any>(null);
  const { toast } = useToast();

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

  const fetchSession = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("trading_session")
        .select("*")
        .eq("user_id", user.id)
        .single();

      if (error && error.code !== "PGRST116") throw error;
      
      if (data) {
        setIsActive(data.is_active || false);
        if (data.active_config_id) {
          setActiveConfigId(data.active_config_id);
        }
      }
    } catch (error: any) {
      console.error("Session fetch error:", error);
    }
  };

  useEffect(() => {
    fetchConfigs();
    fetchSession();
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
      
      const { error } = await supabase
        .from("trading_session")
        .upsert({
          user_id: user.id,
          is_active: newState,
          active_config_id: activeConfigId,
          started_at: newState ? new Date().toISOString() : undefined,
        });

      if (error) throw error;

      setIsActive(newState);
      
      toast({
        title: newState ? "Trading startet" : "Trading stoppet",
        description: newState
          ? "Auto-trading er nu aktivt"
          : "Auto-trading er stoppet",
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
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Trading Dashboard</h1>
        <div className="flex items-center gap-4">
          <Button
            onClick={toggleTrading}
            variant={isActive ? "destructive" : "default"}
            size="lg"
            className="min-w-[160px]"
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
          <div className="flex items-center gap-2">
            <span
              className={`px-3 py-1 rounded-full text-sm font-medium ${
                isActive
                  ? "bg-success/10 text-success"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {isActive ? "Aktiv" : "Inaktiv"}
            </span>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Strategi Indstillinger</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <Label>Vælg Aktiv Strategi</Label>
              <Select value={activeConfigId || undefined} onValueChange={setActiveConfigId}>
                <SelectTrigger>
                  <SelectValue placeholder="Vælg en strategi" />
                </SelectTrigger>
                <SelectContent>
                  {configs.map((config) => (
                    <SelectItem key={config.id} value={config.id}>
                      {config.name} {config.enabled ? "" : "(Deaktiveret)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <PortfolioBalance />

      <PositionManager />

      <Tabs defaultValue="positions">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="positions">
            <History className="mr-2 h-4 w-4" />
            Historik
          </TabsTrigger>
          <TabsTrigger value="config">
            <Settings2 className="mr-2 h-4 w-4" />
            Indikator Konfiguration
          </TabsTrigger>
        </TabsList>
        <TabsContent value="positions" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Trade Historik</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-center text-muted-foreground py-8">
                Trade historik kommer her
              </p>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="config">
          <IndicatorConfig
            config={configs.find((c) => c.id === activeConfigId)}
            onSave={fetchConfigs}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
};