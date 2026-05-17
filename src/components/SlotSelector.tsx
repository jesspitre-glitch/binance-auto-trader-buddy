import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { IntegerInput } from "@/components/IntegerInput";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AllowedSymbolsPicker } from "@/components/AllowedSymbolsPicker";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, Settings2, Trash2, Clock, Copy } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatBinanceDate } from "@/lib/timeUtils";

export interface Slot {
  id: string;
  slot_number: number;
  name: string;
  config_id: string | null;
  capital_percent: number;
  is_active: boolean;
  allowed_symbols?: string[] | null;
}

interface SlotSelectorProps {
  slots: Slot[];
  selectedSlotId: string | null;
  onSelectSlot: (slotId: string | null) => void;
  configs: { id: string; name: string }[];
  onSlotsChanged: () => void;
}

export const SlotSelector = ({
  slots,
  selectedSlotId,
  onSelectSlot,
  configs,
  onSlotsChanged,
}: SlotSelectorProps) => {
  const { toast } = useToast();
  const [editSlot, setEditSlot] = useState<Slot | null>(null);
  const [editName, setEditName] = useState("");
  const [editConfigId, setEditConfigId] = useState<string | null>(null);
  const [editCapital, setEditCapital] = useState(16);
  const [editAllowedSymbols, setEditAllowedSymbols] = useState<string[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [copyFromSlotId, setCopyFromSlotId] = useState<string>("");
  const [isCopying, setIsCopying] = useState(false);
  const [configTimestamps, setConfigTimestamps] = useState<Record<string, string | null>>({});

  // Fetch strategy_params_changed_at for all slot configs
  useEffect(() => {
    const fetchTimestamps = async () => {
      const configIds = slots.map(s => s.config_id).filter(Boolean) as string[];
      if (configIds.length === 0) return;

      const { data } = await supabase
        .from("indicator_config")
        .select("id, strategy_params_changed_at, created_at")
        .in("id", configIds);

      if (data) {
        const map: Record<string, string | null> = {};
        data.forEach(c => {
          map[c.id] = c.strategy_params_changed_at || c.created_at;
        });
        setConfigTimestamps(map);
      }
    };
    fetchTimestamps();
  }, [slots]);

  const totalAllocated = slots
    .filter((s) => s.is_active)
    .reduce((sum, s) => sum + s.capital_percent, 0);

  const defaultCapitalPercent = (() => {
    const referenceSlots = slots.filter((slot) => slot.is_active);
    const sourceSlots = referenceSlots.length > 0 ? referenceSlots : slots;
    const firstCapitalPercent = Number(sourceSlots[0]?.capital_percent);

    return Number.isFinite(firstCapitalPercent) && firstCapitalPercent > 0
      ? firstCapitalPercent
      : 16;
  })();

  // Clone an existing config and return the new config's id
  const cloneConfig = async (userId: string, slotName: string): Promise<string | null> => {
    // Find a config to clone: prefer the first available
    const { data: existingConfigs } = await supabase
      .from("indicator_config")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1);

    if (!existingConfigs || existingConfigs.length === 0) return null;

    const source = existingConfigs[0];
    // Remove metadata fields, keep all strategy params
    const { id, created_at, updated_at, user_id, ...configParams } = source;

    const { data: newConfig, error } = await supabase
      .from("indicator_config")
      .insert({
        ...configParams,
        user_id: userId,
        name: `${slotName} Strategi`,
      })
      .select("id")
      .single();

    if (error) throw error;
    return newConfig?.id ?? null;
  };

  const addSlot = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Ikke logget ind");

      const nextNumber = slots.length > 0
        ? Math.max(...slots.map((s) => s.slot_number)) + 1
        : 1;

      const slotName = `Slot ${nextNumber}`;

      // Auto-create a unique config for this slot
      const newConfigId = await cloneConfig(user.id, slotName);

      const { error } = await supabase.from("strategy_slots").insert({
        user_id: user.id,
        slot_number: nextNumber,
        name: slotName,
        capital_percent: defaultCapitalPercent,
        is_active: false,
        config_id: newConfigId,
      });

      if (error) throw error;
      onSlotsChanged();
      toast({ title: "Slot oprettet", description: `${slotName} tilføjet med ${defaultCapitalPercent}% kapital og egen strategi` });
    } catch (err: any) {
      toast({ title: "Fejl", description: err.message, variant: "destructive" });
    }
  };

  // Normalize allowed_symbols input. Accepts newline, comma, semicolon, whitespace.
  const normalizeAllowedSymbols = (input: string): string[] => {
    return [...new Set(
      input
        .split(/[\n,; \t]+/)
        .map(s => s.trim().toUpperCase())
        .filter(Boolean)
    )];
  };

  const openEditDialog = (slot: Slot) => {
    setEditSlot(slot);
    setEditName(slot.name);
    setEditConfigId(slot.config_id);
    setEditCapital(slot.capital_percent);
    setEditAllowedSymbols((slot.allowed_symbols ?? []).map(s => s.toUpperCase()));
    setCopyFromSlotId("");
    setDialogOpen(true);
  };

  const copyConfigFromSlot = async () => {
    if (!editSlot || !copyFromSlotId) return;
    const sourceSlot = slots.find(s => s.id === copyFromSlotId);
    if (!sourceSlot?.config_id) {
      toast({ title: "Fejl", description: "Kildeslotet har ingen konfiguration", variant: "destructive" });
      return;
    }
    if (!editSlot.config_id) {
      toast({ title: "Fejl", description: "Dette slot har ingen konfiguration at overskrive", variant: "destructive" });
      return;
    }

    setIsCopying(true);
    try {
      // Fetch full source config
      const { data: source, error: fetchErr } = await supabase
        .from("indicator_config")
        .select("*")
        .eq("id", sourceSlot.config_id)
        .single();
      if (fetchErr || !source) throw fetchErr || new Error("Kunne ikke hente kilde-konfiguration");

      // Strip metadata, keep all strategy params
      const { id, created_at, updated_at, user_id, name, strategy_params_changed_at, ...params } = source;

      // Overwrite target config with source params
      const { error: updateErr } = await supabase
        .from("indicator_config")
        .update({
          ...params,
          strategy_params_changed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", editSlot.config_id);

      if (updateErr) throw updateErr;

      toast({ title: "Konfiguration kopieret", description: `Indstillinger fra ${sourceSlot.name} kopieret til ${editSlot.name}` });
      setCopyFromSlotId("");
      onSlotsChanged();
    } catch (err: any) {
      toast({ title: "Fejl", description: err.message, variant: "destructive" });
    } finally {
      setIsCopying(false);
    }
  };

  const saveSlot = async () => {
    if (!editSlot) return;
    try {
      const normalizedAllowed = [...new Set(editAllowedSymbols.map(s => s.trim().toUpperCase()).filter(Boolean))];
      const { error } = await supabase
        .from("strategy_slots")
        .update({
          name: editName,
          config_id: editConfigId,
          capital_percent: editCapital,
          allowed_symbols: normalizedAllowed,
        })
        .eq("id", editSlot.id);

      if (error) throw error;
      setDialogOpen(false);
      onSlotsChanged();
      toast({ title: "Slot opdateret" });
    } catch (err: any) {
      toast({ title: "Fejl", description: err.message, variant: "destructive" });
    }
  };

  const toggleSlotActive = async (slot: Slot) => {
    const newActive = !slot.is_active;

    // Check capital limit
    if (newActive) {
      const newTotal = totalAllocated + slot.capital_percent;
      if (newTotal > 100) {
        toast({
          title: "Kapital-grænse",
          description: `Kan ikke aktivere — total allokering ville være ${newTotal}% (maks 100%)`,
          variant: "destructive",
        });
        return;
      }
    }

    try {
      // If activating and no config assigned, auto-clone one
      let updateData: any = { is_active: newActive };
      if (newActive && !slot.config_id) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const newConfigId = await cloneConfig(user.id, slot.name);
          if (newConfigId) {
            updateData.config_id = newConfigId;
          }
        }
      }

      const { error } = await supabase
        .from("strategy_slots")
        .update(updateData)
        .eq("id", slot.id);

      if (error) throw error;
      
      // Update local editSlot state immediately so Switch reflects change
      if (editSlot && editSlot.id === slot.id) {
        setEditSlot({ ...editSlot, is_active: newActive });
      }
      
      onSlotsChanged();
    } catch (err: any) {
      toast({ title: "Fejl", description: err.message, variant: "destructive" });
    }
  };

  const deleteSlot = async (slot: Slot) => {
    try {
      // Check for open positions
      const { count } = await supabase
        .from("positions")
        .select("*", { count: "exact", head: true })
        .eq("slot_id", slot.id)
        .eq("status", "OPEN");

      if (count && count > 0) {
        toast({
          title: "Kan ikke slette",
          description: "Slotten har åbne positioner — luk dem først",
          variant: "destructive",
        });
        return;
      }

      const { error } = await supabase
        .from("strategy_slots")
        .delete()
        .eq("id", slot.id);

      if (error) throw error;
      if (selectedSlotId === slot.id) onSelectSlot(null);
      setDialogOpen(false);
      onSlotsChanged();
      toast({ title: "Slot slettet" });
    } catch (err: any) {
      toast({ title: "Fejl", description: err.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        {/* "Alle" aggregate view */}
        <button
          onClick={() => onSelectSlot(null)}
          className={cn(
            "px-4 py-2 rounded-lg border text-sm font-medium transition-all",
            selectedSlotId === null
              ? "bg-primary text-primary-foreground border-primary shadow-sm"
              : "bg-card border-border hover:bg-accent text-foreground"
          )}
        >
          Samlet Overblik
        </button>

        {slots.map((slot) => (
          <button
            key={slot.id}
            onClick={() => onSelectSlot(slot.id)}
            className={cn(
              "px-4 py-2 rounded-lg border text-sm font-medium transition-all flex items-center gap-2",
              selectedSlotId === slot.id
                ? "bg-primary text-primary-foreground border-primary shadow-sm"
                : "bg-card border-border hover:bg-accent text-foreground",
              !slot.is_active && selectedSlotId !== slot.id && "opacity-50"
            )}
          >
            <div className="flex flex-col items-start gap-0.5">
              <div className="flex items-center gap-2">
                <div className={cn(
                  "w-2.5 h-2.5 rounded-full border",
                  slot.is_active
                    ? "bg-green-500 border-green-400 animate-pulse shadow-[0_0_6px_rgba(34,197,94,0.5)]"
                    : "bg-muted border-muted-foreground/30"
                )} />
                <span>{slot.name}</span>
                <Badge variant="secondary" className="text-xs px-1.5 py-0">
                  {slot.capital_percent}%
                </Badge>
                {(slot.allowed_symbols?.length ?? 0) > 0 && (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0" title={(slot.allowed_symbols ?? []).join(', ')}>
                    {slot.allowed_symbols!.length} symbols
                  </Badge>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    openEditDialog(slot);
                  }}
                  className="ml-1 opacity-60 hover:opacity-100"
                >
                  <Settings2 className="h-3.5 w-3.5" />
                </button>
              </div>
              {slot.config_id && configTimestamps[slot.config_id] && (
                <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <Clock className="h-2.5 w-2.5" />
                  Ændret: {formatBinanceDate(configTimestamps[slot.config_id]!, { includeTime: true })}
                </span>
              )}
            </div>
          </button>
        ))}

        <Button variant="outline" size="sm" onClick={addSlot}>
          <Plus className="h-4 w-4 mr-1" />
          Ny Slot
        </Button>

        {slots.length > 0 && (
          <span className={cn(
            "text-xs px-2 py-1 rounded",
            totalAllocated > 100 ? "bg-destructive/10 text-destructive" : "text-muted-foreground"
          )}>
            Allokeret: {totalAllocated}% / 100%
          </span>
        )}
      </div>

      {/* Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rediger {editSlot?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {editSlot?.config_id && configTimestamps[editSlot.config_id] && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-md px-3 py-2">
                <Clock className="h-3.5 w-3.5" />
                <span>Strategi sidst ændret: {formatBinanceDate(configTimestamps[editSlot.config_id]!, { includeTime: true })}</span>
              </div>
            )}
            <div>
              <Label>Navn</Label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
            </div>
            <div>
              <Label>Kapital-andel (%)</Label>
              <IntegerInput
                value={editCapital}
                onValueChange={setEditCapital}
                min={1}
                fallback={editSlot?.capital_percent ?? defaultCapitalPercent}
                className="w-24"
              />
            </div>
            {/* Allowed Symbols whitelist */}
            <div className="space-y-2 border-t pt-3">
              <Label className="text-sm font-medium">Allowed Symbols</Label>
              <p className="text-xs text-muted-foreground">
                Kun disse symbols må scannes og handles af dette slot. Tom liste = slot scanner alle USDC perpetuals.
              </p>
              <AllowedSymbolsPicker
                value={editAllowedSymbols}
                onChange={setEditAllowedSymbols}
              />

            </div>
            {/* Copy config from another slot */}
            {slots.filter(s => s.id !== editSlot?.id && s.config_id).length > 0 && (
              <div className="space-y-2 border-t pt-3">
                <Label className="flex items-center gap-1.5 text-sm">
                  <Copy className="h-3.5 w-3.5" />
                  Kopiér indstillinger fra andet slot
                </Label>
                <div className="flex items-center gap-2">
                  <Select value={copyFromSlotId} onValueChange={setCopyFromSlotId}>
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Vælg kilde-slot" />
                    </SelectTrigger>
                    <SelectContent>
                      {slots
                        .filter(s => s.id !== editSlot?.id && s.config_id)
                        .map(s => (
                          <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={!copyFromSlotId || isCopying}
                    onClick={copyConfigFromSlot}
                  >
                    {isCopying ? "Kopierer…" : "Kopiér"}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">Overskriver alle strategi-indstillinger i dette slot</p>
              </div>
            )}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Switch
                  checked={editSlot?.is_active ?? false}
                  onCheckedChange={() => editSlot && toggleSlotActive(editSlot)}
                />
                <Label>{editSlot?.is_active ? "Tændt" : "Slukket"}</Label>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => editSlot && deleteSlot(editSlot)}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
                <Button onClick={saveSlot}>Gem</Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
