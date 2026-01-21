import { Badge } from "@/components/ui/badge";
import { TrendingUp, BarChart3 } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface RegimeIndicatorProps {
  adx?: number;
  atrPercent?: number;
  adxThreshold?: number;
  atrPctThreshold?: number;
  method?: string;
  operator?: string;
  enabled?: boolean;
  size?: "sm" | "md" | "lg";
  showDetails?: boolean;
}

export function RegimeIndicator({
  adx,
  atrPercent,
  adxThreshold = 22,
  atrPctThreshold = 0.15,
  method = "ADX_AND_ATR",
  operator = "AND",
  enabled = true,
  size = "md",
  showDetails = false,
}: RegimeIndicatorProps) {
  if (!enabled) {
    return null;
  }

  // Calculate regime based on ADX and ATR% thresholds
  const adxCondition = adx !== undefined ? adx > adxThreshold : false;
  const atrCondition = atrPercent !== undefined ? atrPercent > atrPctThreshold : false;

  let isTrend = false;
  
  if (method === "ADX_AND_ATR" || method === "ADX + ATR%") {
    if (operator === "AND") {
      isTrend = adxCondition && atrCondition;
    } else {
      isTrend = adxCondition || atrCondition;
    }
  } else if (method === "ADX_ONLY" || method === "ADX Only") {
    isTrend = adxCondition;
  } else if (method === "ATR_ONLY" || method === "ATR% Only") {
    isTrend = atrCondition;
  }

  const regime = isTrend ? "TREND" : "RANGE";

  const sizeClasses = {
    sm: "text-xs px-1.5 py-0.5",
    md: "text-xs px-2 py-1",
    lg: "text-sm px-3 py-1.5",
  };

  const iconSize = {
    sm: "h-3 w-3",
    md: "h-3.5 w-3.5",
    lg: "h-4 w-4",
  };

  const content = (
    <Badge
      variant="outline"
      className={`${sizeClasses[size]} font-medium gap-1 ${
        isTrend
          ? "border-amber-500/50 bg-amber-500/10 text-amber-600 dark:text-amber-400"
          : "border-blue-500/50 bg-blue-500/10 text-blue-600 dark:text-blue-400"
      }`}
    >
      {isTrend ? (
        <TrendingUp className={iconSize[size]} />
      ) : (
        <BarChart3 className={iconSize[size]} />
      )}
      {regime}
    </Badge>
  );

  if (showDetails) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{content}</TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <div className="space-y-1 text-xs">
            <p className="font-semibold">Regime Classification</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              <span className="text-muted-foreground">Method:</span>
              <span>{method.replace(/_/g, " ")}</span>
              
              {(method === "ADX_AND_ATR" || method === "ADX + ATR%") && (
                <>
                  <span className="text-muted-foreground">Operator:</span>
                  <span>{operator}</span>
                </>
              )}
              
              {method !== "ATR_ONLY" && method !== "ATR% Only" && (
                <>
                  <span className="text-muted-foreground">ADX:</span>
                  <span className={adxCondition ? "text-green-500" : "text-muted-foreground"}>
                    {adx?.toFixed(1) ?? "N/A"} {adxCondition ? ">" : "≤"} {adxThreshold}
                  </span>
                </>
              )}
              
              {method !== "ADX_ONLY" && method !== "ADX Only" && (
                <>
                  <span className="text-muted-foreground">ATR%:</span>
                  <span className={atrCondition ? "text-green-500" : "text-muted-foreground"}>
                    {atrPercent?.toFixed(3) ?? "N/A"} {atrCondition ? ">" : "≤"} {atrPctThreshold}
                  </span>
                </>
              )}
            </div>
            <p className="text-muted-foreground pt-1">
              {isTrend
                ? "Markedet er i trending tilstand - brug trailing stops"
                : "Markedet er i range tilstand - brug faste targets"}
            </p>
          </div>
        </TooltipContent>
      </Tooltip>
    );
  }

  return content;
}
