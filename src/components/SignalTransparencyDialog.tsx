import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, CheckCircle2, XCircle, MinusCircle } from "lucide-react";

interface SignalTransparencyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  symbol: string | null;
  // Optional: limit by created_at window (e.g., latest scan only)
  windowMinutes?: number;
}

interface SlotEval {
  id: string;
  slot_id: string | null;
  symbol: string;
  signal: string;
  qualified: boolean;
  action_taken: string | null;
  block_reason: string | null;
  indicators_summary: any;
  created_at: string;
  scan_cycle_id: string;
  slot_name?: string;
}

const formatAction = (action: string | null): { label: string; variant: "default" | "secondary" | "destructive" | "outline" } => {
  if (!action) return { label: "—", variant: "outline" };
  switch (action) {
    case "POSITION_OPENED":
      return { label: "✅ Åbnede", variant: "default" };
    case "POSITION_OPEN_FAILED":
      return { label: "⚠️ Fejl", variant: "destructive" };
    case "BLOCKED_MAX_POSITIONS":
      return { label: "🚫 Max positioner", variant: "destructive" };
    case "BLOCKED_DUPLICATE":
      return { label: "🚫 Duplikat", variant: "secondary" };
    case "MAX_POSITIONS_REACHED":
      return { label: "🚫 Max positioner", variant: "destructive" };
    case "SIGNAL_DETECTED":
      return { label: "🟡 Signal (ikke handlet)", variant: "secondary" };
    case "NO_SIGNAL":
      return { label: "⚪ Intet signal", variant: "outline" };
    default:
      return { label: action.replace(/_/g, " "), variant: "outline" };
  }
};

export const SignalTransparencyDialog = ({
  open,
  onOpenChange,
  symbol,
  windowMinutes = 10,
}: SignalTransparencyDialogProps) => {
  const [evals, setEvals] = useState<SlotEval[]>([]);
  const [loading, setLoading] = useState(false);
  const [slotNames, setSlotNames] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open || !symbol) return;

    const fetchEvals = async () => {
      setLoading(true);
      try {
        const since = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString();
        const { data, error } = await supabase
          .from("slot_signal_evaluations")
          .select("*")
          .eq("symbol", symbol)
          .gte("created_at", since)
          .order("created_at", { ascending: false });

        if (error) throw error;

        // Get the latest scan_cycle_id only (most recent evaluations)
        const latestCycleId = data?.[0]?.scan_cycle_id;
        const filtered = latestCycleId
          ? (data || []).filter((e) => e.scan_cycle_id === latestCycleId)
          : data || [];

        setEvals(filtered);

        // Fetch slot names for any slot_ids present
        const slotIds = Array.from(new Set(filtered.map((e) => e.slot_id).filter(Boolean))) as string[];
        if (slotIds.length > 0) {
          const { data: slots } = await supabase
            .from("strategy_slots")
            .select("id, name")
            .in("id", slotIds);
          const nameMap: Record<string, string> = {};
          (slots || []).forEach((s) => {
            nameMap[s.id] = s.name;
          });
          setSlotNames(nameMap);
        }
      } catch (err) {
        console.error("Failed to fetch slot evaluations:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchEvals();
  }, [open, symbol, windowMinutes]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Slot-beslutninger for {symbol}</DialogTitle>
          <DialogDescription>
            Hvert slots evaluering af det seneste scan-signal. Viser hvorfor nogle slots åbnede og andre ikke.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : evals.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">
            Ingen slot-evalueringer fundet for {symbol} i de seneste {windowMinutes} minutter.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Slot</TableHead>
                <TableHead>Signal</TableHead>
                <TableHead>Kvalificeret</TableHead>
                <TableHead>Beslutning</TableHead>
                <TableHead>Årsag</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {evals.map((ev) => {
                const action = formatAction(ev.action_taken);
                const slotLabel =
                  (ev.slot_id && slotNames[ev.slot_id]) ||
                  ev.indicators_summary?.slot_name ||
                  (ev.slot_id ? `Slot ${ev.slot_id.slice(0, 6)}` : "Legacy");
                return (
                  <TableRow key={ev.id}>
                    <TableCell className="font-medium">{slotLabel}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          ev.signal === "LONG"
                            ? "default"
                            : ev.signal === "SHORT"
                            ? "secondary"
                            : "outline"
                        }
                      >
                        {ev.signal}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {ev.qualified ? (
                        <CheckCircle2 className="h-5 w-5 text-profit" />
                      ) : ev.signal === "NONE" ? (
                        <MinusCircle className="h-5 w-5 text-muted-foreground" />
                      ) : (
                        <XCircle className="h-5 w-5 text-loss" />
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={action.variant}>{action.label}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-xs">
                      {ev.block_reason || "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}

        {evals.length > 0 && (
          <p className="text-xs text-muted-foreground mt-2">
            Scan-cyklus: {evals[0].scan_cycle_id.slice(0, 8)} ·{" "}
            {new Date(evals[0].created_at).toLocaleString("da-DK", { timeZone: "UTC" })} UTC
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
};
