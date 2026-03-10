import { useEffect, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle, CheckCircle, Info, Fuel } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

// fees_pct_of_notional stores percentage values (e.g. 0.036 = 0.036%)
// With BNB discount: taker ~0.036%, maker ~0.018%
// Without BNB: taker 0.05%, maker 0.02%
const FEE_THRESHOLD_NO_BNB = 0.039; // 0.039% — likely no BNB discount
const FEE_THRESHOLD_WARNING = 0.037; // borderline

interface BnbStatus {
  level: "ok" | "low" | "empty" | "unknown";
  bnbBalance: number | null;
  avgFeePct: number;
  avgBnbPerTrade: number | null;
  estimatedTradesLeft: number | null;
  estimatedDaysLeft: number | null;
  usingBnb: boolean;
}

export const BnbFeeWarning = () => {
  const [status, setStatus] = useState<BnbStatus | null>(null);

  useEffect(() => {
    const checkBnbStatus = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Fetch recent trades with fee data
      const { data: trades, error } = await supabase
        .from("trade_history")
        .select("fees_pct_of_notional, total_fee, notional, closed_at")
        .eq("user_id", user.id)
        .not("fees_pct_of_notional", "is", null)
        .not("total_fee", "is", null)
        .order("closed_at", { ascending: false })
        .limit(20);

      if (error || !trades || trades.length < 2) return;

      const validTrades = trades.filter(
        (t) => t.fees_pct_of_notional != null && t.fees_pct_of_notional > 0
      );
      if (validTrades.length < 2) return;

      // Calculate average fee %
      const recentForFeeCheck = validTrades.slice(0, 5);
      const avgFeePct =
        recentForFeeCheck.reduce((sum, t) => sum + (t.fees_pct_of_notional || 0), 0) /
        recentForFeeCheck.length;

      const usingBnb = avgFeePct < FEE_THRESHOLD_NO_BNB;

      // Fetch actual BNB balance from Binance
      let bnbBalance: number | null = null;
      try {
        const { data: balanceData, error: balanceError } = await supabase.functions.invoke(
          "check-bnb-balance"
        );
        if (!balanceError && balanceData?.bnb_balance != null) {
          bnbBalance = balanceData.bnb_balance;
        }
      } catch (e) {
        console.warn("Could not fetch BNB balance:", e);
      }

      // Estimate BNB burn rate from trades that used BNB discount
      // Fee difference: without BNB ~0.05% taker, with BNB ~0.036% taker
      // The BNB cost per trade ≈ fee_in_USDT * (discount_pct / (1 - discount_pct))
      // Simpler: estimate average BNB spent per trade based on notional
      // Typical BNB fee ≈ 0.00075 * notional (referral + BNB combo) paid in BNB
      // We'll estimate from the fee savings
      let avgBnbPerTrade: number | null = null;
      let estimatedTradesLeft: number | null = null;
      let estimatedDaysLeft: number | null = null;

      if (bnbBalance !== null && validTrades.length >= 3) {
        // Average total fee per trade (in USDT) when BNB is used
        const bnbTrades = validTrades.filter(
          (t) => (t.fees_pct_of_notional || 0) < FEE_THRESHOLD_NO_BNB
        );

        if (bnbTrades.length >= 2) {
          const avgFeeUsdt =
            bnbTrades.reduce((sum, t) => sum + Math.abs(t.total_fee || 0), 0) /
            bnbTrades.length;

          // BNB discount pays ~10% of fee in BNB, rest in USDT
          // Actually: when paying with BNB, the fee IS deducted from BNB balance
          // So total_fee in USDT reflects the discounted amount, and BNB is consumed
          // Estimate: BNB consumed per trade ≈ avgFeeUsdt / BNB_price (approx)
          // Get BNB price from price_cache
          const { data: bnbPrice } = await supabase
            .from("price_cache")
            .select("price")
            .eq("symbol", "BNBUSDT")
            .maybeSingle();

          if (bnbPrice?.price) {
            avgBnbPerTrade = avgFeeUsdt / bnbPrice.price;
            if (avgBnbPerTrade > 0) {
              estimatedTradesLeft = Math.floor(bnbBalance / avgBnbPerTrade);

              // Estimate trades per day from trade history
              const oldestTrade = trades[trades.length - 1];
              const newestTrade = trades[0];
              if (oldestTrade?.closed_at && newestTrade?.closed_at) {
                const daySpan =
                  (new Date(newestTrade.closed_at).getTime() -
                    new Date(oldestTrade.closed_at).getTime()) /
                  (1000 * 60 * 60 * 24);
                if (daySpan > 0) {
                  const tradesPerDay = trades.length / daySpan;
                  estimatedDaysLeft =
                    tradesPerDay > 0
                      ? Math.round((estimatedTradesLeft / tradesPerDay) * 10) / 10
                      : null;
                }
              }
            }
          }
        }
      }

      // Determine warning level — actual balance takes priority over fee heuristics
      let level: BnbStatus["level"] = "unknown";
      if (bnbBalance !== null) {
        if (bnbBalance <= 0.001) {
          level = "empty";
        } else if (
          (estimatedDaysLeft !== null && estimatedDaysLeft < 3) ||
          bnbBalance < 0.01
        ) {
          level = "low";
        } else {
          level = "ok";
        }
      } else {
        // Fallback: use fee analysis only when we can't check balance
        level = usingBnb ? "ok" : "empty";
      }

      setStatus({
        level,
        bnbBalance,
        avgFeePct,
        avgBnbPerTrade,
        estimatedTradesLeft,
        estimatedDaysLeft,
        usingBnb,
      });
    };

    checkBnbStatus();
    // Re-check every 5 minutes
    const interval = setInterval(checkBnbStatus, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  if (!status || status.level === "ok") return null;

  const isEmpty = status.level === "empty";
  const isLow = status.level === "low";

  return (
    <Alert
      variant="destructive"
      className={
        isEmpty
          ? "border-destructive/50 bg-destructive/10 text-destructive [&>svg]:text-destructive"
          : "border-yellow-500/50 bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 [&>svg]:text-yellow-600 dark:[&>svg]:text-yellow-400"
      }
    >
      {isEmpty ? (
        <AlertTriangle className="h-4 w-4" />
      ) : (
        <Fuel className="h-4 w-4" />
      )}
      <AlertTitle>
        {isEmpty ? "BNB balance tom — fees er dyrere!" : "BNB balance lav"}
      </AlertTitle>
      <AlertDescription className="space-y-1">
        {status.bnbBalance !== null && (
          <p>
            Aktuel BNB balance:{" "}
            <span className="font-bold">{status.bnbBalance.toFixed(4)} BNB</span>
          </p>
        )}
        {isEmpty && !status.usingBnb && (
          <p>
            Dine seneste handler betaler{" "}
            <span className="font-bold">
              {status.avgFeePct.toFixed(4)}%
            </span>{" "}
            i fees — uden BNB-rabat. Fyld op for at spare ~10% på fees.
          </p>
        )}
        {isLow && status.estimatedTradesLeft !== null && (
          <p>
            Estimeret:{" "}
            <span className="font-bold">
              ~{status.estimatedTradesLeft} handler
            </span>{" "}
            tilbage
            {status.estimatedDaysLeft !== null && (
              <>
                {" "}
                (~
                <span className="font-bold">
                  {status.estimatedDaysLeft < 1
                    ? "< 1 dag"
                    : `${status.estimatedDaysLeft} dage`}
                </span>
                )
              </>
            )}
            {" "}før BNB er opbrugt.
          </p>
        )}
        {isLow && status.avgBnbPerTrade !== null && (
          <p className="text-xs opacity-80">
            Gns. BNB-forbrug pr. handel: ~{status.avgBnbPerTrade.toFixed(5)} BNB
          </p>
        )}
      </AlertDescription>
    </Alert>
  );
};
