import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Route, TrendingUp, BarChart3, Lock } from "lucide-react";

interface ExitProfile {
  id: string;
  name: string;
}

interface RegimeRouterProps {
  enabled: boolean;
  method: string;
  adxThreshold: number;
  atrPctThreshold: number;
  operator: string;
  ifTrue: string;
  ifFalse: string;
  lockAtEntry: boolean;
  trendExitProfileId: string | null;
  rangeExitProfileId: string | null;
  exitProfiles: ExitProfile[];
  onChange: (field: string, value: any) => void;
}

export function RegimeRouter({
  enabled,
  method,
  adxThreshold,
  atrPctThreshold,
  operator,
  ifTrue,
  ifFalse,
  lockAtEntry,
  trendExitProfileId,
  rangeExitProfileId,
  exitProfiles,
  onChange,
}: RegimeRouterProps) {
  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Route className="h-5 w-5 text-primary" />
            Regime Router
          </CardTitle>
          <Switch
            checked={enabled}
            onCheckedChange={(v) => onChange("regime_router_enabled", v)}
          />
        </div>
      </CardHeader>
      <CardContent className={`space-y-4 ${!enabled ? "opacity-50 pointer-events-none" : ""}`}>
        {/* Regime Classification */}
        <div className="space-y-3">
          <h4 className="text-sm font-medium flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Regime Classification
          </h4>
          
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Method</Label>
              <Select value={method} onValueChange={(v) => onChange("regime_method", v)}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ADX_AND_ATR">ADX + ATR%</SelectItem>
                  <SelectItem value="ADX_ONLY">ADX Only</SelectItem>
                  <SelectItem value="ATR_ONLY">ATR% Only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-1.5">
              <Label className="text-xs">Operator</Label>
              <Select value={operator} onValueChange={(v) => onChange("regime_operator", v)}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="AND">AND</SelectItem>
                  <SelectItem value="OR">OR</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">ADX Threshold</Label>
              <Input
                type="number"
                step="0.1"
                value={adxThreshold}
                onChange={(e) => onChange("regime_adx_threshold", parseFloat(e.target.value) || 22)}
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">ATR% Threshold</Label>
              <Input
                type="number"
                step="0.01"
                value={atrPctThreshold}
                onChange={(e) => onChange("regime_atr_pct_threshold", parseFloat(e.target.value) || 0.15)}
                className="h-9"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">If condition TRUE → Regime</Label>
              <Select value={ifTrue} onValueChange={(v) => onChange("regime_if_true", v)}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="TREND">TREND</SelectItem>
                  <SelectItem value="RANGE">RANGE</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Else → Regime</Label>
              <Select value={ifFalse} onValueChange={(v) => onChange("regime_if_false", v)}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="RANGE">RANGE</SelectItem>
                  <SelectItem value="TREND">TREND</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <Separator />

        {/* Regime Persistence */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Lock className="h-4 w-4 text-muted-foreground" />
            <Label className="text-sm">Lock Regime At Entry</Label>
          </div>
          <Switch
            checked={lockAtEntry}
            onCheckedChange={(v) => onChange("regime_lock_at_entry", v)}
          />
        </div>

        <Separator />

        {/* Regime → Exit Profile Mapping */}
        <div className="space-y-3">
          <h4 className="text-sm font-medium flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Regime → Exit Profile Mapping
          </h4>
          
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">TREND → Exit Profile</Label>
              <Select 
                value={trendExitProfileId || ""} 
                onValueChange={(v) => onChange("regime_trend_exit_profile_id", v || null)}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Select profile..." />
                </SelectTrigger>
                <SelectContent>
                  {exitProfiles.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">RANGE → Exit Profile</Label>
              <Select 
                value={rangeExitProfileId || ""} 
                onValueChange={(v) => onChange("regime_range_exit_profile_id", v || null)}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Select profile..." />
                </SelectTrigger>
                <SelectContent>
                  {exitProfiles.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          
          {exitProfiles.length === 0 && (
            <p className="text-xs text-muted-foreground">
              Ingen exit-profiler oprettet endnu. Opret profiler i "Exit Profiles" sektionen.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
