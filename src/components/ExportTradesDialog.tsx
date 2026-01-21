import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useToast } from "@/hooks/use-toast";
import { Textarea } from "@/components/ui/textarea";
import { Copy, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { compressTradeData, compressTradeDataCompact, formatWithLineBreaks } from "@/lib/tradeExportUtils";

interface ExportTradesDialogProps {
  strategyHash?: string;
  buttonVariant?: "default" | "outline" | "ghost";
  buttonSize?: "default" | "sm" | "lg" | "icon";
}

export const ExportTradesDialog = ({ 
  strategyHash, 
  buttonVariant = "outline",
  buttonSize = "sm" 
}: ExportTradesDialogProps) => {
  const [open, setOpen] = useState(false);
  const [filterType, setFilterType] = useState<"count" | "days" | "hours">("count");
  const [filterValue, setFilterValue] = useState("50");
  const [exportMode, setExportMode] = useState<"COMPACT" | "FULL">("COMPACT");
  const [exportedData, setExportedData] = useState<string>("");
  const [showFallback, setShowFallback] = useState(false);
  const { toast } = useToast();

  const fetchAndExport = async () => {
    try {
      let query = supabase
        .from("trade_history")
        .select("*")
        .order("closed_at", { ascending: false });

      if (strategyHash) {
        query = query.eq("strategy_hash", strategyHash);
      }

      if (filterType === "count") {
        query = query.limit(parseInt(filterValue));
      } else if (filterType === "days") {
        const cutoffMs = Date.now() - (parseInt(filterValue) * 24 * 60 * 60 * 1000);
        const cutoff = new Date(cutoffMs);
        query = query.gte("closed_at", cutoff.toISOString());
      } else if (filterType === "hours") {
        const cutoffMs = Date.now() - (parseInt(filterValue) * 60 * 60 * 1000);
        const cutoff = new Date(cutoffMs);
        query = query.gte("closed_at", cutoff.toISOString());
      }

      const { data: trades, error } = await query;

      if (error) throw error;
      if (!trades || trades.length === 0) {
        toast({
          title: "Ingen handler",
          description: "Ingen handler fundet med de valgte kriterier",
          variant: "destructive",
        });
        return;
      }

      // Use COMPACT or FULL format based on selection
      const compressed = exportMode === "COMPACT" 
        ? compressTradeDataCompact(trades)
        : compressTradeData(trades);
      const jsonStr = formatWithLineBreaks(compressed);
      
      // Try clipboard first, fallback to textarea on iOS/Safari
      try {
        await navigator.clipboard.writeText(jsonStr);
        
        toast({
          title: `Eksporteret til clipboard! (${exportMode})`,
          description: `${trades.length} handler kopieret`,
        });
        
        setOpen(false);
      } catch (clipboardError) {
        console.log('Clipboard failed, showing fallback:', clipboardError);
        setExportedData(jsonStr);
        setShowFallback(true);
        
        toast({
          title: "Data klar til kopiering",
          description: "Tryk på tekstfeltet og vælg 'Kopier'",
        });
      }
    } catch (error: any) {
      toast({
        title: "Fejl",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={buttonVariant} size={buttonSize}>
          <Copy className="h-4 w-4 mr-2" />
          Eksporter til AI
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Eksporter Handler til AI Analyse</DialogTitle>
          <DialogDescription>
            Vælg filter for hvilke handler du vil eksportere
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          {!showFallback ? (
            <>
              {/* Export Mode Toggle */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Eksport format</Label>
                <RadioGroup 
                  value={exportMode} 
                  onValueChange={(v) => setExportMode(v as "COMPACT" | "FULL")}
                  className="flex gap-4"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="COMPACT" id="compact" />
                    <Label htmlFor="compact" className="cursor-pointer">
                      <span className="font-medium">COMPACT</span>
                      <span className="text-xs text-muted-foreground ml-1">(AI-venlig)</span>
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="FULL" id="full" />
                    <Label htmlFor="full" className="cursor-pointer">
                      <span className="font-medium">FULL</span>
                      <span className="text-xs text-muted-foreground ml-1">(debug)</span>
                    </Label>
                  </div>
                </RadioGroup>
              </div>

              {/* Filter Type */}
              <RadioGroup value={filterType} onValueChange={(v) => setFilterType(v as any)}>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="count" id="count" />
                  <Label htmlFor="count">Antal handler</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="days" id="days" />
                  <Label htmlFor="days">Sidste X dage</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="hours" id="hours" />
                  <Label htmlFor="hours">Sidste X timer</Label>
                </div>
              </RadioGroup>

              <div className="space-y-2">
                <Label htmlFor="value">
                  {filterType === "count" ? "Antal" : filterType === "days" ? "Dage" : "Timer"}
                </Label>
                <Input
                  id="value"
                  type="number"
                  value={filterValue}
                  onChange={(e) => setFilterValue(e.target.value)}
                  min="1"
                />
              </div>

              {/* Mode-specific descriptions */}
              {exportMode === "COMPACT" ? (
                <div className="text-xs text-muted-foreground space-y-1 p-2 bg-muted/50 rounded">
                  <p className="font-medium text-foreground">COMPACT indeholder:</p>
                  <p>• Trade info (symbol, side, prices, pnl, duration)</p>
                  <p>• Entry filters: ADX, ATR%, StochRSI, volume_ratio</p>
                  <p>• Regime, trend, exit summary</p>
                  <p className="text-green-600 dark:text-green-400">✓ Optimeret til ChatGPT</p>
                </div>
              ) : (
                <div className="text-xs text-muted-foreground space-y-1 p-2 bg-muted/50 rounded">
                  <p className="font-medium text-foreground">FULL indeholder:</p>
                  <p>• Alle gate_audit detaljer</p>
                  <p>• Komplet *_audit objekter</p>
                  <p>• candidate_stops arrays</p>
                  <p>• Filter mode settings</p>
                  <p className="text-amber-600 dark:text-amber-400">⚠ Stor fil - til deep debug</p>
                </div>
              )}

              <Button onClick={fetchAndExport} className="w-full">
                <Download className="h-4 w-4 mr-2" />
                Kopier {exportMode} til Clipboard
              </Button>
            </>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="exportData">Eksporterede data - tryk og hold for at kopiere</Label>
                <Textarea
                  id="exportData"
                  value={exportedData}
                  readOnly
                  className="font-mono text-xs h-[400px]"
                  onClick={(e) => {
                    const target = e.target as HTMLTextAreaElement;
                    target.select();
                  }}
                />
              </div>
              
              <div className="flex gap-2">
                <Button 
                  onClick={() => {
                    const textarea = document.getElementById('exportData') as HTMLTextAreaElement;
                    if (textarea) {
                      textarea.select();
                      try {
                        document.execCommand('copy');
                        toast({
                          title: "Kopieret!",
                          description: "Data er kopieret",
                        });
                      } catch (e) {
                        toast({
                          title: "Manuelt valg",
                          description: "Vælg alt tekst og kopier manuelt",
                        });
                      }
                    }
                  }}
                  className="flex-1"
                >
                  <Copy className="w-4 h-4 mr-2" />
                  Kopier
                </Button>
                
                <Button 
                  onClick={() => {
                    setShowFallback(false);
                    setExportedData("");
                  }}
                  variant="outline"
                  className="flex-1"
                >
                  Tilbage
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
