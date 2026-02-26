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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, Settings2, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface Slot {
  id: string;
  slot_number: number;
  name: string;
  config_id: string | null;
  capital_percent: number;
  is_active: boolean;
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
  const [editCapital, setEditCapital] = useState(25);
  const [dialogOpen, setDialogOpen] = useState(false);

  const totalAllocated = slots
    .filter((s) => s.is_active)
    .reduce((sum, s) => sum + s.capital_percent, 0);

  const addSlot = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Ikke logget ind");

      const nextNumber = slots.length > 0
        ? Math.max(...slots.map((s) => s.slot_number)) + 1
        : 1;

      const { error } = await supabase.from("strategy_slots").insert({
        user_id: user.id,
        slot_number: nextNumber,
        name: `Slot ${nextNumber}`,
        capital_percent: 25,
        is_active: false,
      });

      if (error) throw error;
      onSlotsChanged();
      toast({ title: "Slot oprettet", description: `Slot ${nextNumber} tilføjet` });
    } catch (err: any) {
      toast({ title: "Fejl", description: err.message, variant: "destructive" });
    }
  };

  const openEditDialog = (slot: Slot) => {
    setEditSlot(slot);
    setEditName(slot.name);
    setEditConfigId(slot.config_id);
    setEditCapital(slot.capital_percent);
    setDialogOpen(true);
  };

  const saveSlot = async () => {
    if (!editSlot) return;
    try {
      const { error } = await supabase
        .from("strategy_slots")
        .update({
          name: editName,
          config_id: editConfigId,
          capital_percent: editCapital,
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
      const { error } = await supabase
        .from("strategy_slots")
        .update({ is_active: newActive })
        .eq("id", slot.id);

      if (error) throw error;
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
                : "bg-card border-border hover:bg-accent text-foreground"
            )}
          >
            {slot.is_active && (
              <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
            )}
            <span>{slot.name}</span>
            <Badge variant="secondary" className="text-xs px-1.5 py-0">
              {slot.capital_percent}%
            </Badge>
            <button
              onClick={(e) => {
                e.stopPropagation();
                openEditDialog(slot);
              }}
              className="ml-1 opacity-60 hover:opacity-100"
            >
              <Settings2 className="h-3.5 w-3.5" />
            </button>
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
                fallback={25}
                className="w-24"
              />
            </div>
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
