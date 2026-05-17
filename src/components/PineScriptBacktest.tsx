import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Copy, Download, FileCode2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { generatePineScript, SlotConfigLike } from "@/lib/pineScriptGenerator";

interface SlotRow {
  id: string;
  slot_number: number;
  name: string;
  config_id: string | null;
}

export const PineScriptBacktest = () => {
  const { toast } = useToast();
  const [slots, setSlots] = useState<SlotRow[]>([]);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [config, setConfig] = useState<SlotConfigLike | null>(null);
  const [code, setCode] = useState<string>("");

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("strategy_slots")
        .select("id, slot_number, name, config_id")
        .order("slot_number", { ascending: true });
      const rows = (data ?? []) as SlotRow[];
      setSlots(rows);
      if (rows.length && !selectedSlotId) setSelectedSlotId(rows[0].id);
    })();
  }, []);

  const selectedSlot = useMemo(
    () => slots.find((s) => s.id === selectedSlotId) ?? null,
    [slots, selectedSlotId],
  );

  useEffect(() => {
    (async () => {
      setConfig(null);
      setCode("");
      if (!selectedSlot?.config_id) return;
      const { data } = await supabase
        .from("indicator_config")
        .select("*")
        .eq("id", selectedSlot.config_id)
        .maybeSingle();
      setConfig((data ?? null) as SlotConfigLike | null);
    })();
  }, [selectedSlot?.config_id]);

  const handleGenerate = () => {
    if (!config || !selectedSlot) {
      toast({ title: "Ingen config", description: "Vælg et slot med tilknyttet config", variant: "destructive" });
      return;
    }
    // Strip any "Sx – " or "Sx - " prefix from the stored slot name to avoid "S4 – S1 – ..."
    const cleanName = (selectedSlot.name ?? "").replace(/^\s*S\d+\s*[–-]\s*/i, "").trim();
    const label = `Slot ${selectedSlot.slot_number} – ${cleanName || "Strategy"}`;
    setCode(
      generatePineScript(config, label, selectedSlot.slot_number, {
        slotId: selectedSlot.id,
        configId: selectedSlot.config_id,
      }),
    );
  };

  const handleCopy = async () => {
    if (!code) return;
    await navigator.clipboard.writeText(code);
    toast({ title: "Kopieret", description: "Pine Script er på clipboard" });
  };

  const handleDownload = () => {
    if (!code || !selectedSlot) return;
    const blob = new Blob([code], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `slot-${selectedSlot.slot_number}-${(selectedSlot.name || "strategy").replace(/[^a-z0-9]+/gi, "-")}.pine`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileCode2 className="h-5 w-5" />
          TradingView Backtest – Pine Script Generator
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
          <div className="space-y-1.5">
            <Label>Slot</Label>
            <Select value={selectedSlotId ?? ""} onValueChange={(v) => setSelectedSlotId(v)}>
              <SelectTrigger>
                <SelectValue placeholder="Vælg slot" />
              </SelectTrigger>
              <SelectContent>
                {slots.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    S{s.slot_number} – {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={handleGenerate} disabled={!config}>
            Generate Pine Script
          </Button>
        </div>

        {!selectedSlot?.config_id && selectedSlot && (
          <p className="text-sm text-muted-foreground">
            Dette slot har ingen tilknyttet indicator_config.
          </p>
        )}

        {code && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">
                Pine Script v5 — copy/paste i TradingView Pine Editor
              </Label>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={handleCopy}>
                  <Copy className="h-4 w-4 mr-1" /> Copy
                </Button>
                <Button size="sm" variant="outline" onClick={handleDownload}>
                  <Download className="h-4 w-4 mr-1" /> Download .pine
                </Button>
              </div>
            </div>
            <Textarea
              value={code}
              readOnly
              spellCheck={false}
              className="font-mono text-xs min-h-[480px] bg-muted/40"
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
};
