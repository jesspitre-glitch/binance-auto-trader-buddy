import { useState } from "react";
import { format } from "date-fns";
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
import { Copy, Download, CalendarIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { compressTradeData, compressTradeDataCompact, formatWithLineBreaks } from "@/lib/tradeExportUtils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";

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
  const [filterType, setFilterType] = useState<"count" | "days" | "hours" | "since_change" | "custom">("count");
  const [filterValue, setFilterValue] = useState("50");
  const [exportMode, setExportMode] = useState<"COMPACT" | "FULL_DEBUG">("COMPACT");
  const [exportedData, setExportedData] = useState<string>("");
  const [showFallback, setShowFallback] = useState(false);
  const [customFrom, setCustomFrom] = useState<Date>();
  const [customTo, setCustomTo] = useState<Date>();
  const [chunks, setChunks] = useState<string[]>([]);
  const [currentChunk, setCurrentChunk] = useState(0);
  const { toast } = useToast();

  const CHUNK_SIZE = 130;

  const copyChunk = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: `Kopieret! ${label}`, description: "Klar til at indsætte i AI" });
    } catch {
      setExportedData(text);
      setShowFallback(true);
      toast({ title: "Data klar til kopiering", description: "Tryk på tekstfeltet og vælg 'Kopier'" });
    }
  };

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
        query = query.gte("closed_at", new Date(cutoffMs).toISOString());
      } else if (filterType === "hours") {
        const cutoffMs = Date.now() - (parseInt(filterValue) * 60 * 60 * 1000);
        query = query.gte("closed_at", new Date(cutoffMs).toISOString());
      } else if (filterType === "since_change") {
        const { data: configData } = await supabase
          .from("indicator_config")
          .select("updated_at")
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (configData?.updated_at) {
          query = query.gte("closed_at", configData.updated_at);
        }
      } else if (filterType === "custom") {
        if (customFrom) {
          query = query.gte("closed_at", customFrom.toISOString());
        }
        if (customTo) {
          const endOfDay = new Date(customTo);
          endOfDay.setUTCHours(23, 59, 59, 999);
          query = query.lte("closed_at", endOfDay.toISOString());
        }
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

      // Split into chunks of CHUNK_SIZE
      const tradeChunks: string[] = [];
      for (let i = 0; i < trades.length; i += CHUNK_SIZE) {
        const slice = trades.slice(i, i + CHUNK_SIZE);
        const compressed = exportMode === "COMPACT"
          ? compressTradeDataCompact(slice)
          : compressTradeData(slice);
        tradeChunks.push(formatWithLineBreaks(compressed));
      }

      setChunks(tradeChunks);
      setCurrentChunk(0);
      if (tradeChunks.length === 1) {
        toast({
          title: `${trades.length} handler klar`,
          description: "Tryk 'Kopier blok 1' for at kopiere til clipboard",
        });
      } else {
        toast({
          title: `${trades.length} handler opdelt i ${tradeChunks.length} blokke`,
          description: "Kopier blok for blok ind i din AI",
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

  const resetChunks = () => {
    setChunks([]);
    setCurrentChunk(0);
    setShowFallback(false);
    setExportedData("");
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
          {/* Chunk navigator view */}
          {chunks.length > 0 && !showFallback ? (
            <>
              {/* Progress bar */}
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Trin {currentChunk + 1} af {chunks.length}</span>
                  <span>{chunks.length * CHUNK_SIZE <= 130 ? `${chunks.length * CHUNK_SIZE}` : `op til ${chunks.length * CHUNK_SIZE}`} handler i alt</span>
                </div>
                <div className="flex gap-1">
                  {chunks.map((_, i) => (
                    <div
                      key={i}
                      className={cn(
                        "h-2 flex-1 rounded-full transition-colors",
                        i < currentChunk ? "bg-primary/60" : i === currentChunk ? "bg-primary" : "bg-muted"
                      )}
                    />
                  ))}
                </div>
              </div>

              {/* Instruction box */}
              <div className="p-4 border-2 border-primary/20 bg-primary/5 rounded-lg space-y-2">
                <p className="text-sm font-semibold text-foreground">
                  {currentChunk === 0 ? "📋 Start her:" : `📋 Trin ${currentChunk + 1}:`}
                </p>
                <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
                  <li>Tryk <strong className="text-foreground">Kopier blok {currentChunk + 1}</strong> nedenfor</li>
                  <li>Indsæt i din AI og send</li>
                  {currentChunk < chunks.length - 1 && (
                    <li>Kom tilbage her og tryk <strong className="text-foreground">Næste blok →</strong></li>
                  )}
                </ol>
              </div>

              {/* Main copy button */}
              <Button
                size="lg"
                onClick={async () => {
                  await copyChunk(chunks[currentChunk], `Blok ${currentChunk + 1}/${chunks.length}`);
                }}
                className="w-full"
              >
                <Copy className="w-4 h-4 mr-2" />
                Kopier blok {currentChunk + 1} / {chunks.length}
              </Button>

              {/* Navigation */}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentChunk === 0}
                  onClick={() => setCurrentChunk(c => c - 1)}
                  className="flex-1"
                >
                  ← Forrige blok
                </Button>
                {currentChunk < chunks.length - 1 ? (
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => setCurrentChunk(c => c + 1)}
                    className="flex-1"
                  >
                    Næste blok →
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={resetChunks}
                    className="flex-1"
                  >
                    ✓ Færdig
                  </Button>
                )}
              </div>

              <Button variant="ghost" size="sm" onClick={resetChunks} className="w-full text-muted-foreground text-xs">
                ← Tilbage til filter
              </Button>
            </>
          ) : !showFallback ? (
            <>
              {/* Export Mode Toggle */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Eksport format</Label>
                <RadioGroup 
                  value={exportMode} 
                  onValueChange={(v) => setExportMode(v as "COMPACT" | "FULL_DEBUG")}
                  className="flex gap-4"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="COMPACT" id="compact" />
                    <Label htmlFor="compact" className="cursor-pointer">
                      <span className="font-medium">COMPACT</span>
                      <span className="text-xs text-muted-foreground ml-1">(kun aktive)</span>
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="FULL_DEBUG" id="full_debug" />
                    <Label htmlFor="full_debug" className="cursor-pointer">
                      <span className="font-medium">FULL_DEBUG</span>
                      <span className="text-xs text-muted-foreground ml-1">(alt)</span>
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
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="since_change" id="since_change" />
                  <Label htmlFor="since_change">Siden strategi-ændring</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="custom" id="custom" />
                  <Label htmlFor="custom">Vælg periode</Label>
                </div>
              </RadioGroup>

              {(filterType === "count" || filterType === "days" || filterType === "hours") && (
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
              )}

              {filterType === "custom" && (
                <div className="flex gap-2">
                  <div className="flex-1 space-y-1">
                    <Label className="text-xs">Fra</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className={cn("w-full justify-start text-left text-xs", !customFrom && "text-muted-foreground")}>
                          <CalendarIcon className="h-3 w-3 mr-1" />
                          {customFrom ? format(customFrom, "dd/MM/yyyy") : "Vælg"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar mode="single" selected={customFrom} onSelect={setCustomFrom} initialFocus className="p-3 pointer-events-auto" />
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div className="flex-1 space-y-1">
                    <Label className="text-xs">Til</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className={cn("w-full justify-start text-left text-xs", !customTo && "text-muted-foreground")}>
                          <CalendarIcon className="h-3 w-3 mr-1" />
                          {customTo ? format(customTo, "dd/MM/yyyy") : "Vælg"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar mode="single" selected={customTo} onSelect={setCustomTo} initialFocus className="p-3 pointer-events-auto" />
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
              )}

              {/* Mode-specific descriptions */}
              {exportMode === "COMPACT" ? (
                <div className="text-xs text-muted-foreground space-y-1 p-2 bg-muted/50 rounded">
                  <p className="font-medium text-foreground">COMPACT = kun aktive indikatorer:</p>
                  <p>• Trade: symbol, pnl, duration, exit_reason</p>
                  <p>• Hver aktiv indikator: value, threshold, passed, mode</p>
                  <p>• Ingen null, ingen disabled, ingen dubletter</p>
                  <p className="text-green-600 dark:text-green-400">✓ Flad struktur til hurtig analyse</p>
                </div>
              ) : (
                <div className="text-xs text-muted-foreground space-y-1 p-2 bg-muted/50 rounded">
                  <p className="font-medium text-foreground">FULL_DEBUG = komplet audit:</p>
                  <p>• Alle gate_audit detaljer</p>
                  <p>• Komplet *_audit objekter</p>
                  <p>• candidate_stops arrays</p>
                  <p>• Alle mellemregninger og fallbacks</p>
                  <p className="text-amber-600 dark:text-amber-400">⚠ Stor fil - kun til deep debug</p>
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
                        toast({ title: "Kopieret!", description: "Data er kopieret" });
                      } catch (e) {
                        toast({ title: "Manuelt valg", description: "Vælg alt tekst og kopier manuelt" });
                      }
                    }
                  }}
                  className="flex-1"
                >
                  <Copy className="w-4 h-4 mr-2" />
                  Kopier
                </Button>
                
                <Button 
                  onClick={resetChunks}
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
