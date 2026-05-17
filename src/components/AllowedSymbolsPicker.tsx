import { useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Check, ChevronsUpDown, ClipboardPaste, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// Module-level cache so multiple pickers share one fetch
let symbolCache: string[] | null = null;
let symbolCachePromise: Promise<string[]> | null = null;

async function fetchUsdcPerpetualSymbols(): Promise<string[]> {
  if (symbolCache) return symbolCache;
  if (symbolCachePromise) return symbolCachePromise;
  symbolCachePromise = (async () => {
    try {
      const res = await fetch("https://fapi.binance.com/fapi/v1/exchangeInfo");
      const data = await res.json();
      const list: string[] = (data?.symbols ?? [])
        .filter(
          (s: any) =>
            s.quoteAsset === "USDC" &&
            s.status === "TRADING" &&
            s.contractType === "PERPETUAL"
        )
        .map((s: any) => String(s.symbol).toUpperCase())
        .sort();
      symbolCache = list;
      return list;
    } catch (err) {
      symbolCachePromise = null;
      throw err;
    }
  })();
  return symbolCachePromise;
}

function parseSymbolInput(input: string): string[] {
  return [
    ...new Set(
      input
        .split(/[\n,; \t]+/)
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean)
    ),
  ];
}

interface Props {
  value: string[];
  onChange: (next: string[]) => void;
}

export const AllowedSymbolsPicker = ({ value, onChange }: Props) => {
  const [available, setAvailable] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetchUsdcPerpetualSymbols()
      .then((list) => {
        if (!cancelled) setAvailable(list);
      })
      .catch(() => {
        if (!cancelled) toast.error("Kunne ikke hente Binance symbol-liste");
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedSet = useMemo(
    () => new Set(value.map((v) => v.toUpperCase())),
    [value]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toUpperCase();
    if (!q) return available;
    return available.filter((s) => s.includes(q));
  }, [available, query]);

  const toggle = (sym: string) => {
    const next = selectedSet.has(sym)
      ? value.filter((v) => v.toUpperCase() !== sym)
      : [...value, sym];
    onChange(next);
  };

  const selectAll = () => onChange([...available]);
  const clearAll = () => onChange([]);

  const handlePaste = () => {
    const parsed = parseSymbolInput(pasteText);
    if (parsed.length === 0) {
      toast.error("Ingen symboler fundet i tekst");
      return;
    }
    const availSet = new Set(available);
    const valid = parsed.filter((s) => availSet.has(s));
    const invalid = parsed.filter((s) => !availSet.has(s));
    const merged = [...new Set([...value, ...valid])];
    onChange(merged);
    if (invalid.length > 0) {
      toast.warning(`Ignored invalid symbols: ${invalid.join(", ")}`);
    }
    if (valid.length > 0) {
      toast.success(`Tilføjet ${valid.length} symbols`);
    }
    setPasteText("");
    setPasteOpen(false);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              role="combobox"
              aria-expanded={open}
              className="justify-between min-w-[200px]"
              disabled={loading}
            >
              <span className="text-xs">
                {loading
                  ? "Henter symbols…"
                  : value.length === 0
                  ? "Vælg symbols…"
                  : `${value.length} valgt`}
              </span>
              <ChevronsUpDown className="h-3.5 w-3.5 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[280px] p-0" align="start">
            <div className="p-2 border-b">
              <Input
                ref={inputRef}
                placeholder="Søg fx BTC, SUI…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="h-8 text-xs"
                autoFocus
              />
            </div>
            <div className="flex items-center justify-between px-2 py-1 border-b text-[10px] text-muted-foreground">
              <span>{filtered.length} / {available.length}</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={selectAll}
                  className="hover:text-foreground"
                >
                  Select all
                </button>
                <button
                  type="button"
                  onClick={clearAll}
                  className="hover:text-foreground"
                >
                  Clear
                </button>
              </div>
            </div>
            <div className="max-h-[260px] overflow-y-auto">
              {filtered.length === 0 && (
                <div className="px-3 py-4 text-center text-xs text-muted-foreground">
                  Ingen match
                </div>
              )}
              {filtered.map((sym) => {
                const checked = selectedSet.has(sym);
                return (
                  <button
                    key={sym}
                    type="button"
                    onClick={() => toggle(sym)}
                    className={cn(
                      "flex items-center w-full gap-2 px-3 py-1.5 text-xs hover:bg-accent text-left",
                      checked && "bg-accent/40"
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-3.5 w-3.5 items-center justify-center rounded border",
                        checked
                          ? "bg-primary border-primary text-primary-foreground"
                          : "border-muted-foreground/40"
                      )}
                    >
                      {checked && <Check className="h-3 w-3" />}
                    </span>
                    <span className="font-mono">{sym}</span>
                  </button>
                );
              })}
            </div>
          </PopoverContent>
        </Popover>

        <Dialog open={pasteOpen} onOpenChange={setPasteOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm">
              <ClipboardPaste className="h-3.5 w-3.5 mr-1" />
              Paste
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Paste symbols</DialogTitle>
            </DialogHeader>
            <p className="text-xs text-muted-foreground">
              Indsæt symbols adskilt af komma, mellemrum eller linjeskift. Ugyldige symbols ignoreres.
            </p>
            <Textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder="JUPUSDC, ICPUSDC, SUIUSDC"
              rows={6}
              className="font-mono text-xs"
            />
            <DialogFooter>
              <Button variant="ghost" onClick={() => setPasteOpen(false)}>
                Annuller
              </Button>
              <Button onClick={handlePaste}>Tilføj</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {value.length > 0 && (
          <Button variant="ghost" size="sm" onClick={clearAll} className="text-xs">
            Ryd alle
          </Button>
        )}
      </div>

      {value.length === 0 ? (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          No symbol filter — slot scans all USDC perpetuals
        </p>
      ) : (
        <div className="flex flex-wrap gap-1 p-2 rounded-md border bg-muted/30 max-h-[140px] overflow-y-auto">
          {value.map((sym) => (
            <Badge
              key={sym}
              variant="secondary"
              className="text-[10px] gap-1 pr-1 font-mono"
            >
              {sym}
              <button
                type="button"
                onClick={() => toggle(sym.toUpperCase())}
                className="hover:bg-background/60 rounded-sm"
                aria-label={`Fjern ${sym}`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
};
