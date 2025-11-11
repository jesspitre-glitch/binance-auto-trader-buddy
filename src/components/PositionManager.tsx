import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, TrendingUp, TrendingDown, X } from "lucide-react";

export const PositionManager = () => {
  const [positions, setPositions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchPositions = async () => {
    try {
      const { data, error } = await supabase
        .from("positions")
        .select("*")
        .eq("status", "OPEN")
        .order("opened_at", { ascending: false });

      if (error) throw error;
      setPositions(data || []);
    } catch (error: any) {
      toast({
        title: "Fejl",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPositions();
    
    // Realtime subscription
    const channel = supabase
      .channel("positions-changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "positions",
        },
        () => {
          fetchPositions();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const closePosition = async (positionId: string) => {
    try {
      const { error } = await supabase
        .from("positions")
        .update({ status: "CLOSED", closed_at: new Date().toISOString() })
        .eq("id", positionId);

      if (error) throw error;

      toast({
        title: "Position lukket",
        description: "Positionen er blevet lukket",
      });
    } catch (error: any) {
      toast({
        title: "Fejl",
        description: error.message,
        variant: "destructive",
      });
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
      <CardHeader>
        <CardTitle>Åbne Positioner ({positions.length})</CardTitle>
      </CardHeader>
      <CardContent>
        {positions.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">Ingen åbne positioner</p>
        ) : (
          <div className="space-y-4">
            {positions.map((position) => {
              const pnl = position.unrealized_pnl || 0;
              const isProfitable = pnl >= 0;
              
              return (
                <div
                  key={position.id}
                  className="flex items-center justify-between border rounded-lg p-4"
                >
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      {position.side === "LONG" ? (
                        <TrendingUp className="h-5 w-5 text-profit" />
                      ) : (
                        <TrendingDown className="h-5 w-5 text-loss" />
                      )}
                      <div>
                        <div className="font-semibold">{position.symbol}</div>
                        <Badge variant={position.side === "LONG" ? "default" : "secondary"}>
                          {position.side}
                        </Badge>
                      </div>
                    </div>
                    
                    <div className="text-sm space-y-1">
                      <div>Entry: <span className="font-mono">${position.entry_price}</span></div>
                      <div>Current: <span className="font-mono">${position.current_price || "..."}</span></div>
                      <div>Quantity: <span className="font-mono">{position.quantity}</span></div>
                    </div>
                    
                    <div className="text-sm space-y-1">
                      <div>SL: <span className="font-mono">${position.stop_loss}</span></div>
                      <div>TP: <span className="font-mono">${position.take_profit}</span></div>
                      {position.trailing_stop && (
                        <div>Trail: <span className="font-mono">${position.trailing_stop}</span></div>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className={`text-lg font-bold ${isProfitable ? "text-profit" : "text-loss"}`}>
                        {isProfitable ? "+" : ""}{pnl.toFixed(2)} USDT
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {new Date(position.opened_at).toLocaleTimeString("da-DK")}
                      </div>
                    </div>
                    
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => closePosition(position.id)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};