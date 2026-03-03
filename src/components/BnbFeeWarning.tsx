import { useEffect, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

// With BNB discount: taker ~0.036%, maker ~0.018%
// Without BNB: taker 0.04%, maker 0.02%
// If fees_pct_of_notional consistently >= 0.039% on recent trades, BNB is likely depleted
const FEE_THRESHOLD = 0.039;
const RECENT_TRADES_CHECK = 5;

export const BnbFeeWarning = () => {
  const [showWarning, setShowWarning] = useState(false);
  const [avgFeePct, setAvgFeePct] = useState(0);

  useEffect(() => {
    const checkFees = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("trade_history")
        .select("fees_pct_of_notional, total_fee, notional")
        .eq("user_id", user.id)
        .not("fees_pct_of_notional", "is", null)
        .order("closed_at", { ascending: false })
        .limit(RECENT_TRADES_CHECK);

      if (error || !data || data.length < 2) return;

      const validTrades = data.filter((t) => t.fees_pct_of_notional != null && t.fees_pct_of_notional > 0);
      if (validTrades.length < 2) return;

      const avg = validTrades.reduce((sum, t) => sum + (t.fees_pct_of_notional || 0), 0) / validTrades.length;
      setAvgFeePct(avg);

      // If average fee % is at or above the non-BNB threshold, warn
      if (avg >= FEE_THRESHOLD) {
        setShowWarning(true);
      }
    };

    checkFees();
  }, []);

  if (!showWarning) return null;

  return (
    <Alert variant="destructive" className="border-yellow-500/50 bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 [&>svg]:text-yellow-600 dark:[&>svg]:text-yellow-400">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>BNB Balance lav eller tom</AlertTitle>
      <AlertDescription>
        Dine seneste {RECENT_TRADES_CHECK} handler har en gennemsnitlig fee på{" "}
        <span className="font-bold">{(avgFeePct * 100).toFixed(4)}%</span> af notional, 
        hvilket indikerer at du <span className="font-bold">ikke betaler fees med BNB</span>. 
        Fyld op på BNB for at spare ~10% på trading fees.
      </AlertDescription>
    </Alert>
  );
};
