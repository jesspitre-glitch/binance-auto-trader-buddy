import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { 
  Settings2, 
  Plus, 
  Trash2, 
  Save, 
  Shield, 
  TrendingUp, 
  Timer, 
  Target,
  ChevronDown
} from "lucide-react";

export interface ExitProfile {
  id: string;
  user_id: string;
  name: string;
  version: number;
  be_enabled: boolean;
  be_trigger_profit_pct: number;
  be_stop_over_entry_pct: number;
  be_ratchet_only: boolean;
  peaklock_enabled: boolean;
  peaklock_activate_profit_pct: number;
  peaklock_distance_from_peak_pct: number;
  peaklock_min_profit_floor_pct: number;
  peaklock_ratchet_only: boolean;
  trailing_enabled: boolean;
  trailing_stop_atr_mult: number;
  trailing_activation_enabled: boolean;
  trailing_activation_atr_mult: number;
  max_duration_enabled: boolean;
  max_duration_minutes: number;
  hard_sl_override_enabled: boolean;
  hard_sl_pct: number;
}

interface ExitProfilesProps {
  profiles: ExitProfile[];
  onProfilesChange: (profiles: ExitProfile[]) => void;
}

const defaultProfile: Omit<ExitProfile, "id" | "user_id"> = {
  name: "New Profile",
  version: 1,
  be_enabled: false,
  be_trigger_profit_pct: 1.5,
  be_stop_over_entry_pct: 0.1,
  be_ratchet_only: false,
  peaklock_enabled: false,
  peaklock_activate_profit_pct: 0.6,
  peaklock_distance_from_peak_pct: 0.35,
  peaklock_min_profit_floor_pct: 0.15,
  peaklock_ratchet_only: true,
  trailing_enabled: true,
  trailing_stop_atr_mult: 2.0,
  trailing_activation_enabled: true,
  trailing_activation_atr_mult: 1.0,
  max_duration_enabled: true,
  max_duration_minutes: 120,
  hard_sl_override_enabled: false,
  hard_sl_pct: 3.0,
};

// Helper function to parse floats with comma support (European locale)
const safeParseFloat = (value: string): number => {
  const normalized = value.replace(',', '.');
  const parsed = parseFloat(normalized);
  return isNaN(parsed) ? 0 : parsed;
};

export function ExitProfiles({ profiles, onProfilesChange }: ExitProfilesProps) {
  const [localProfiles, setLocalProfiles] = useState<ExitProfile[]>(profiles);
  const [saving, setSaving] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [profileToDelete, setProfileToDelete] = useState<string | null>(null);

  useEffect(() => {
    setLocalProfiles(profiles);
  }, [profiles]);

  const handleAddProfile = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast.error("Not authenticated");
      return;
    }

    const newProfileName = localProfiles.length === 0 
      ? "RANGE_EXIT" 
      : localProfiles.length === 1 
        ? "TREND_EXIT" 
        : `EXIT_PROFILE_${localProfiles.length + 1}`;

    const { data, error } = await supabase
      .from("exit_profiles")
      .insert({
        ...defaultProfile,
        name: newProfileName,
        user_id: user.id,
      })
      .select()
      .single();

    if (error) {
      toast.error("Failed to create profile: " + error.message);
      return;
    }

    const newProfiles = [...localProfiles, data as ExitProfile];
    setLocalProfiles(newProfiles);
    onProfilesChange(newProfiles);
    toast.success(`Profile "${newProfileName}" created`);
  };

  const handleDeleteProfile = async (id: string) => {
    const { error } = await supabase.from("exit_profiles").delete().eq("id", id);
    if (error) {
      toast.error("Failed to delete profile: " + error.message);
      return;
    }
    const newProfiles = localProfiles.filter((p) => p.id !== id);
    setLocalProfiles(newProfiles);
    onProfilesChange(newProfiles);
    toast.success("Profile deleted");
    setDeleteDialogOpen(false);
    setProfileToDelete(null);
  };

  const handleProfileChange = (id: string, field: string, value: any) => {
    setLocalProfiles((prev) =>
      prev.map((p) => (p.id === id ? { ...p, [field]: value } : p))
    );
  };

  const handleSaveProfile = async (profile: ExitProfile) => {
    setSaving(profile.id);
    const { error } = await supabase
      .from("exit_profiles")
      .update({
        name: profile.name,
        version: profile.version + 1,
        be_enabled: profile.be_enabled,
        be_trigger_profit_pct: profile.be_trigger_profit_pct,
        be_stop_over_entry_pct: profile.be_stop_over_entry_pct,
        be_ratchet_only: profile.be_ratchet_only,
        peaklock_enabled: profile.peaklock_enabled,
        peaklock_activate_profit_pct: profile.peaklock_activate_profit_pct,
        peaklock_distance_from_peak_pct: profile.peaklock_distance_from_peak_pct,
        peaklock_min_profit_floor_pct: profile.peaklock_min_profit_floor_pct,
        peaklock_ratchet_only: profile.peaklock_ratchet_only,
        trailing_enabled: profile.trailing_enabled,
        trailing_stop_atr_mult: profile.trailing_stop_atr_mult,
        trailing_activation_enabled: profile.trailing_activation_enabled,
        trailing_activation_atr_mult: profile.trailing_activation_atr_mult,
        max_duration_enabled: profile.max_duration_enabled,
        max_duration_minutes: profile.max_duration_minutes,
        hard_sl_override_enabled: profile.hard_sl_override_enabled,
        hard_sl_pct: profile.hard_sl_pct,
      })
      .eq("id", profile.id);

    setSaving(null);
    if (error) {
      toast.error("Failed to save profile: " + error.message);
      return;
    }

    // Update version locally
    setLocalProfiles((prev) =>
      prev.map((p) => (p.id === profile.id ? { ...p, version: p.version + 1 } : p))
    );
    onProfilesChange(localProfiles.map((p) => 
      p.id === profile.id ? { ...p, version: p.version + 1 } : p
    ));
    toast.success(`Profile "${profile.name}" saved (v${profile.version + 1})`);
  };

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Settings2 className="h-5 w-5 text-primary" />
            Exit Profiles
          </CardTitle>
          <Button size="sm" onClick={handleAddProfile} className="h-8">
            <Plus className="h-4 w-4 mr-1" />
            Add Profile
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {localProfiles.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            No exit profiles yet. Click "Add Profile" to create one.
          </p>
        ) : (
          <Accordion type="multiple" className="space-y-2">
            {localProfiles.map((profile) => (
              <AccordionItem 
                key={profile.id} 
                value={profile.id}
                className="border rounded-lg px-3"
              >
                <AccordionTrigger className="hover:no-underline py-3">
                  <div className="flex items-center gap-3 flex-1">
                    <Input
                      value={profile.name}
                      onChange={(e) => handleProfileChange(profile.id, "name", e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      className="h-8 w-40 font-medium"
                    />
                    <Badge variant="outline" className="text-xs">
                      v{profile.version}
                    </Badge>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="pt-2 pb-4">
                  <div className="space-y-4">
                    {/* Break-Even Section */}
                    <div className="space-y-2 p-3 bg-muted/30 rounded-lg">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm font-medium flex items-center gap-2">
                          <Shield className="h-4 w-4" />
                          Break-Even
                        </Label>
                        <Switch
                          checked={profile.be_enabled}
                          onCheckedChange={(v) => handleProfileChange(profile.id, "be_enabled", v)}
                        />
                      </div>
                      <div className={`grid grid-cols-3 gap-2 ${!profile.be_enabled ? "opacity-50" : ""}`}>
                        <div className="space-y-1">
                          <Label className="text-xs">Trigger Profit %</Label>
                          <Input
                            type="text"
                            inputMode="decimal"
                            value={profile.be_trigger_profit_pct}
                            onChange={(e) => handleProfileChange(profile.id, "be_trigger_profit_pct", safeParseFloat(e.target.value))}
                            onFocus={(e) => e.target.select()}
                            className="h-8"
                            disabled={!profile.be_enabled}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Stop Over Entry %</Label>
                          <Input
                            type="text"
                            inputMode="decimal"
                            value={profile.be_stop_over_entry_pct}
                            onChange={(e) => handleProfileChange(profile.id, "be_stop_over_entry_pct", safeParseFloat(e.target.value))}
                            onFocus={(e) => e.target.select()}
                            className="h-8"
                            disabled={!profile.be_enabled}
                          />
                        </div>
                        <div className="flex items-end gap-2">
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={profile.be_ratchet_only}
                              onCheckedChange={(v) => handleProfileChange(profile.id, "be_ratchet_only", v)}
                              disabled={!profile.be_enabled}
                            />
                            <Label className="text-xs">Ratchet Only</Label>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Peak-Lock Section */}
                    <div className="space-y-2 p-3 bg-muted/30 rounded-lg">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm font-medium flex items-center gap-2">
                          <Target className="h-4 w-4" />
                          Peak-Lock
                        </Label>
                        <Switch
                          checked={profile.peaklock_enabled}
                          onCheckedChange={(v) => handleProfileChange(profile.id, "peaklock_enabled", v)}
                        />
                      </div>
                      <div className={`grid grid-cols-2 gap-2 ${!profile.peaklock_enabled ? "opacity-50" : ""}`}>
                        <div className="space-y-1">
                          <Label className="text-xs">Activate At Profit %</Label>
                          <Input
                            type="text"
                            inputMode="decimal"
                            value={profile.peaklock_activate_profit_pct}
                            onChange={(e) => handleProfileChange(profile.id, "peaklock_activate_profit_pct", safeParseFloat(e.target.value))}
                            onFocus={(e) => e.target.select()}
                            className="h-8"
                            disabled={!profile.peaklock_enabled}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Distance From Peak %</Label>
                          <Input
                            type="text"
                            inputMode="decimal"
                            value={profile.peaklock_distance_from_peak_pct}
                            onChange={(e) => handleProfileChange(profile.id, "peaklock_distance_from_peak_pct", safeParseFloat(e.target.value))}
                            onFocus={(e) => e.target.select()}
                            className="h-8"
                            disabled={!profile.peaklock_enabled}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Min Profit Floor %</Label>
                          <Input
                            type="text"
                            inputMode="decimal"
                            value={profile.peaklock_min_profit_floor_pct}
                            onChange={(e) => handleProfileChange(profile.id, "peaklock_min_profit_floor_pct", safeParseFloat(e.target.value))}
                            onFocus={(e) => e.target.select()}
                            className="h-8"
                            disabled={!profile.peaklock_enabled}
                          />
                        </div>
                        <div className="flex items-end gap-2">
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={profile.peaklock_ratchet_only}
                              onCheckedChange={(v) => handleProfileChange(profile.id, "peaklock_ratchet_only", v)}
                              disabled={!profile.peaklock_enabled}
                            />
                            <Label className="text-xs">Ratchet Only</Label>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Trailing Stop Section */}
                    <div className="space-y-2 p-3 bg-muted/30 rounded-lg">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm font-medium flex items-center gap-2">
                          <TrendingUp className="h-4 w-4" />
                          Trailing Stop
                        </Label>
                        <Switch
                          checked={profile.trailing_enabled}
                          onCheckedChange={(v) => handleProfileChange(profile.id, "trailing_enabled", v)}
                        />
                      </div>
                      <div className={`grid grid-cols-2 gap-2 ${!profile.trailing_enabled ? "opacity-50" : ""}`}>
                        <div className="space-y-1">
                          <Label className="text-xs">Trailing Stop (x ATR)</Label>
                          <Input
                            type="text"
                            inputMode="decimal"
                            value={profile.trailing_stop_atr_mult}
                            onChange={(e) => handleProfileChange(profile.id, "trailing_stop_atr_mult", safeParseFloat(e.target.value))}
                            onFocus={(e) => e.target.select()}
                            className="h-8"
                            disabled={!profile.trailing_enabled}
                          />
                        </div>
                        <div className="flex items-end gap-2">
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={profile.trailing_activation_enabled}
                              onCheckedChange={(v) => handleProfileChange(profile.id, "trailing_activation_enabled", v)}
                              disabled={!profile.trailing_enabled}
                            />
                            <Label className="text-xs">Activation Enabled</Label>
                          </div>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Activation ATR Mult</Label>
                          <Input
                            type="text"
                            inputMode="decimal"
                            value={profile.trailing_activation_atr_mult}
                            onChange={(e) => handleProfileChange(profile.id, "trailing_activation_atr_mult", safeParseFloat(e.target.value))}
                            onFocus={(e) => e.target.select()}
                            className="h-8"
                            disabled={!profile.trailing_enabled || !profile.trailing_activation_enabled}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Max Duration Section */}
                    <div className="space-y-2 p-3 bg-muted/30 rounded-lg">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm font-medium flex items-center gap-2">
                          <Timer className="h-4 w-4" />
                          Max Duration
                        </Label>
                        <Switch
                          checked={profile.max_duration_enabled}
                          onCheckedChange={(v) => handleProfileChange(profile.id, "max_duration_enabled", v)}
                        />
                      </div>
                      <div className={`${!profile.max_duration_enabled ? "opacity-50" : ""}`}>
                        <div className="space-y-1">
                          <Label className="text-xs">Max Duration (minutes)</Label>
                          <Input
                            type="number"
                            inputMode="numeric"
                            value={profile.max_duration_minutes}
                            onChange={(e) => handleProfileChange(profile.id, "max_duration_minutes", parseInt(e.target.value) || 0)}
                            onFocus={(e) => e.target.select()}
                            className="h-8 w-32"
                            disabled={!profile.max_duration_enabled}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Hard SL Override Section */}
                    <div className="space-y-2 p-3 bg-muted/30 rounded-lg">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm font-medium flex items-center gap-2">
                          <Shield className="h-4 w-4 text-destructive" />
                          Hard SL Override
                        </Label>
                        <Switch
                          checked={profile.hard_sl_override_enabled}
                          onCheckedChange={(v) => handleProfileChange(profile.id, "hard_sl_override_enabled", v)}
                        />
                      </div>
                      <div className={`${!profile.hard_sl_override_enabled ? "opacity-50" : ""}`}>
                        <div className="space-y-1">
                          <Label className="text-xs">Hard SL %</Label>
                          <Input
                            type="text"
                            inputMode="decimal"
                            value={profile.hard_sl_pct}
                            onChange={(e) => handleProfileChange(profile.id, "hard_sl_pct", safeParseFloat(e.target.value))}
                            onFocus={(e) => e.target.select()}
                            className="h-8 w-32"
                            disabled={!profile.hard_sl_override_enabled}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex justify-between pt-2">
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => {
                          setProfileToDelete(profile.id);
                          setDeleteDialogOpen(true);
                        }}
                      >
                        <Trash2 className="h-4 w-4 mr-1" />
                        Delete
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleSaveProfile(profile)}
                        disabled={saving === profile.id}
                      >
                        <Save className="h-4 w-4 mr-1" />
                        {saving === profile.id ? "Saving..." : "Save Profile"}
                      </Button>
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        )}

        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Exit Profile?</AlertDialogTitle>
              <AlertDialogDescription>
                This action cannot be undone. Any regime mappings using this profile will be cleared.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => profileToDelete && handleDeleteProfile(profileToDelete)}
                className="bg-destructive text-destructive-foreground"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
