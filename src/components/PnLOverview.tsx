import { useEffect, useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, TrendingUp, TrendingDown, DollarSign, Percent, BarChart3, LineChart as LineChartIcon, Copy, Download, CalendarIcon, Clock } from "lucide-react";
import { ExportTradesDialog } from "@/components/ExportTradesDialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
} from "recharts";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatTradeForExport, compressTradeData, formatWithLineBreaks } from "@/lib/tradeExportUtils";

type TimeRange = "24h" | "7d" | "30d" | "90d" | "1y" | "all" | "since_change" | "custom";
type PnlTotalMode = "strict_trades" | "binance_overview";

interface PnLOverviewProps {
  slotId?: string | null;
  includeLegacyData?: boolean;
  onSelectSlot?: (slotId: string) => void;
}

interface SlotPnlBreakdown {
  slotId: string;
  slotName: string;
  totalNetPnl: number;
  totalNetPnlPct: number;
  trades: number;
  winRate: number;
  chartData: { cumulative: number }[];
  chartDataSinceChange: { cumulative: number }[];
  lastConfigChange: string | null;
  pnlSinceChange: number;
  pnlSinceChangePct: number;
  tradesSinceChange: number;
  winRateSinceChange: number;
}

export const PnLOverview = ({ slotId, includeLegacyData = false, onSelectSlot }: PnLOverviewProps) => {
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<TimeRange>("24h");
  const [pnlMode, setPnlMode] = useState<PnlTotalMode>("strict_trades");
  const [chartType, setChartType] = useState<"line" | "bar">("line");
  const [stats, setStats] = useState<any>(null);
  const [chartData, setChartData] = useState<any[]>([]);
  const [aggregatedData, setAggregatedData] = useState<any[]>([]);
  const [allTrades, setAllTrades] = useState<any[]>([]);
  const [selectedPeriodTrades, setSelectedPeriodTrades] = useState<any[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [customFrom, setCustomFrom] = useState<Date | undefined>(undefined);
  const [customTo, setCustomTo] = useState<Date | undefined>(undefined);
  const { toast } = useToast();
  const isSlotScopedView = Boolean(slotId);
  const effectivePnlMode: PnlTotalMode = isSlotScopedView ? "strict_trades" : pnlMode;

  const fetchPnLData = async (range: TimeRange) => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Calculate selected time window
      const nowMs = Date.now();
      const now = new Date(nowMs);
      const todayUtcStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0);
      
      let startMs: number;
      
      if (range === "since_change") {
        let strategyUpdatedAt: string | null = null;

        if (slotId) {
          const { data: slotData } = await supabase
            .from("strategy_slots")
            .select("config_id")
            .eq("id", slotId)
            .maybeSingle();

          if (slotData?.config_id) {
            const { data: configData } = await supabase
              .from("indicator_config")
              .select("strategy_params_changed_at, updated_at")
              .eq("id", slotData.config_id)
              .maybeSingle();

            strategyUpdatedAt = (configData as any)?.strategy_params_changed_at ?? configData?.updated_at ?? null;
          }
        } else {
          // Aggregate view: use EARLIEST config change across all slots so each slot's
          // per-slot "since strategy change" PnL still has its own trades available.
          // Using the latest change would cut off all earlier slots' trades.
          const { data: configRows } = await supabase
            .from("indicator_config")
            .select("strategy_params_changed_at, updated_at")
            .eq("user_id", user.id);

          if (configRows && configRows.length > 0) {
            const timestamps = configRows
              .map((c: any) => c.strategy_params_changed_at ?? c.updated_at)
              .filter(Boolean)
              .map((t: string) => new Date(t).getTime());
            if (timestamps.length > 0) {
              strategyUpdatedAt = new Date(Math.min(...timestamps)).toISOString();
            }
          }
        }

        startMs = strategyUpdatedAt
          ? new Date(strategyUpdatedAt).getTime()
          : todayUtcStart;
      } else if (range === "custom") {
        if (customFrom) {
          startMs = customFrom.getTime();
        } else {
          startMs = todayUtcStart;
        }
        // Override "now" end time with customTo if set
        if (customTo) {
          const endOfDay = new Date(customTo);
          endOfDay.setUTCHours(23, 59, 59, 999);
          // We'll handle nowMs override below
        }
      } else {
        switch (range) {
          case "24h":
            startMs = nowMs - (24 * 60 * 60 * 1000);
            break;
          case "7d":
            startMs = todayUtcStart - (6 * 24 * 60 * 60 * 1000);
            break;
          case "30d":
            startMs = todayUtcStart - (29 * 24 * 60 * 60 * 1000);
            break;
          case "90d":
            startMs = todayUtcStart - (89 * 24 * 60 * 60 * 1000);
            break;
          case "1y":
            startMs = todayUtcStart - (364 * 24 * 60 * 60 * 1000);
            break;
          case "all":
            startMs = Date.UTC(2020, 0, 1, 0, 0, 0, 0);
            break;
          default:
            startMs = todayUtcStart;
        }
      }

      // For custom range, allow end date override
      let effectiveNowMs = nowMs;
      if (range === "custom" && customTo) {
        const endOfDay = new Date(customTo);
        endOfDay.setUTCHours(23, 59, 59, 999);
        effectiveNowMs = endOfDay.getTime();
      }
      
      const startDate = new Date(startMs);

      console.log(`[PnL] Selected window: ${range}, from ${startDate.toISOString()} to ${new Date(effectiveNowMs).toISOString()}`);
      
      // Fetch portfolio balance (current)
      const portfolioResult = await supabase
        .from("user_portfolio")
        .select("futures_capital, futures_deposited, futures_withdrawn")
        .eq("user_id", user.id)
        .maybeSingle();

      // Fetch Binance P&L from income ledger for ALL time ranges
      let binancePnl: {
        todaysRealizedPnl: number;
        commission: number;
        fundingFee: number;
        netPnl: number;
        unrealizedPnl: number;
        walletBalance: number;
        marginBalance: number;
      } | null = null;
      
      try {
        if (effectivePnlMode === "binance_overview") {
          const { data: sessionData } = await supabase.auth.getSession();
          if (sessionData?.session) {
            const response = await supabase.functions.invoke("get-binance-daily-pnl", {
              headers: {
                Authorization: `Bearer ${sessionData.session.access_token}`,
              },
              body: {
                startTime: startMs,
                endTime: effectiveNowMs,
              },
            });
            
            if (response.error) {
              const errorMsg = typeof response.error === 'object' 
                ? JSON.stringify(response.error) 
                : String(response.error);
              if (errorMsg.includes('banned') || errorMsg.includes('-1003') || errorMsg.includes('rate limit')) {
                console.warn("[PnL] Binance API rate limited, using trade-based fallback");
              } else {
                console.warn("[PnL] Binance API error:", errorMsg);
              }
            } else if (response.data) {
              binancePnl = response.data;
              console.log(`[PnL] Binance income ledger (${range}):`, binancePnl);
            }
          }
        }
      } catch (err: any) {
        // Non-blocking: log error but continue with trade-based fallback
        const errMsg = err?.message || String(err);
        if (errMsg.includes('banned') || errMsg.includes('-1003') || errMsg.includes('rate limit')) {
          console.warn("[PnL] Binance API rate limited, using trade-based fallback");
        } else {
          console.warn("[PnL] Failed to fetch Binance P&L:", err);
        }
      }

      // Fetch ALL trades using pagination
      const allTradesData: any[] = [];
      const pageSize = 1000;
      let page = 0;
      let hasMore = true;

      while (hasMore) {
        const from = page * pageSize;
        const to = from + pageSize - 1;
        
        let tradeQuery = supabase
          .from("trade_history")
          .select("*")
          .eq("user_id", user.id)
          .neq("close_reason", "DUPLICATE")
          .gte("closed_at", startDate.toISOString())
          .lte("closed_at", new Date(effectiveNowMs).toISOString())
          .order("closed_at", { ascending: false })
          .range(from, to);

        if (slotId) {
          tradeQuery = includeLegacyData
            ? tradeQuery.or(`slot_id.eq.${slotId},slot_id.is.null`)
            : tradeQuery.eq("slot_id", slotId);
        }

        const { data, error } = await tradeQuery;

        if (error) throw error;
        
        if (data && data.length > 0) {
          allTradesData.push(...data);
          hasMore = data.length === pageSize;
          page++;
        } else {
          hasMore = false;
        }
      }
      
      // Fetch funding fees for the period (using binance_time in ms)
      const { data: fundingData, error: fundingError } = await supabase
        .from("funding_fees")
        .select("*")
        .eq("user_id", user.id)
        .gte("binance_time", startMs)
        .lte("binance_time", effectiveNowMs)
        .order("binance_time", { ascending: true });
      
      if (fundingError) {
        console.warn("[PnL] Failed to fetch funding fees:", fundingError);
      }
      
      const fundingFees = fundingData || [];
      const totalFundingFees = fundingFees.reduce((sum, f) => sum + Number(f.income), 0);
      
      console.log(`[PnL] Trades: ${allTradesData.length}, Funding fees: ${fundingFees.length} (total: ${totalFundingFees.toFixed(2)} USDT)`);
      
      // Sort trades ascending for cumulative chart
      const sortedTrades = allTradesData.sort((a, b) => 
        new Date(a.closed_at).getTime() - new Date(b.closed_at).getTime()
      );

      // 🛡️ UI fallback dedup: drop rows that share (symbol, side, entry_price, opened-minute, net_pnl)
      // This catches legacy duplicates that were not yet flagged with close_reason='DUPLICATE'.
      const seenDupKey = new Set<string>();
      const trades = sortedTrades.filter((t: any) => {
        const minute = t.opened_at ? new Date(t.opened_at).toISOString().slice(0, 16) : '';
        const npnl = Number(t.net_pnl ?? t.pnl ?? 0).toFixed(6);
        const key = `${t.symbol}|${t.side}|${Number(t.entry_price).toFixed(8)}|${minute}|${npnl}`;
        if (seenDupKey.has(key)) {
          console.warn('[PnL] dedup-fallback dropped duplicate row', t.id, key);
          return false;
        }
        seenDupKey.add(key);
        return true;
      });
      
      const currentBalance = Number(portfolioResult?.data?.futures_capital || 0);
      const portfolioBalance = currentBalance;

      setAllTrades(trades);

      // Slot-level net P&L breakdown for "Samlet Overblik"
      const { data: slotRows } = await supabase
        .from("strategy_slots")
        .select("id, name, slot_number, config_id, capital_percent")
        .eq("user_id", user.id)
        .order("slot_number", { ascending: true });

      // Fetch config strategy_params_changed_at for each slot's config
      const configIds = [...new Set((slotRows || []).map((s: any) => s.config_id).filter(Boolean))];
      let configUpdatedMap: Record<string, string> = {};
      if (configIds.length > 0) {
        const { data: configs } = await supabase
          .from("indicator_config")
          .select("id, strategy_params_changed_at, updated_at")
          .in("id", configIds);
        if (configs) {
          configs.forEach((c: any) => { configUpdatedMap[c.id] = c.strategy_params_changed_at ?? c.updated_at; });
        }
      }

      const getTradeNetPnl = (trade: any) =>
        Number(trade.net_pnl ?? (Number(trade.pnl) - Number(trade.total_fee || 0) + Number(trade.funding_fee || 0)));

      const slotBreakdown: SlotPnlBreakdown[] = !slotId
        ? (slotRows || []).map((slot: any) => {
            const slotTrades = trades
              .filter((t) => t.slot_id === slot.id)
              .sort((a, b) => new Date(a.closed_at).getTime() - new Date(b.closed_at).getTime());
            const totalNetPnl = slotTrades.reduce((sum, t) => sum + getTradeNetPnl(t), 0);
            const slotCapital = portfolioBalance * (Number(slot.capital_percent) / 100);
            const totalNetPnlPct = slotCapital > 0 ? (totalNetPnl / slotCapital) * 100 : 0;
            const winCount = slotTrades.filter((t) => getTradeNetPnl(t) > 0).length;
            const winRate = slotTrades.length > 0 ? (winCount / slotTrades.length) * 100 : 0;

            // Build mini cumulative chart data
            let cum = 0;
            const chartData = slotTrades.map((t) => {
              cum += getTradeNetPnl(t);
              return { cumulative: Number(cum.toFixed(2)) };
            });

            // P&L since last config change
            const lastConfigChange = slot.config_id ? (configUpdatedMap[slot.config_id] || null) : null;
            const tradesSinceChange = lastConfigChange
              ? slotTrades.filter((t) => new Date(t.closed_at).getTime() >= new Date(lastConfigChange).getTime())
              : [];
            const pnlSinceChange = tradesSinceChange.reduce((sum: number, t: any) => sum + getTradeNetPnl(t), 0);
            const pnlSinceChangePct = slotCapital > 0 ? (pnlSinceChange / slotCapital) * 100 : 0;
            const winsSinceChange = tradesSinceChange.filter((t: any) => getTradeNetPnl(t) > 0).length;
            const winRateSinceChange = tradesSinceChange.length > 0 ? (winsSinceChange / tradesSinceChange.length) * 100 : 0;

            return {
              slotId: slot.id,
              slotName: slot.name,
              totalNetPnl,
              totalNetPnlPct,
              trades: slotTrades.length,
              winRate,
              chartData,
              lastConfigChange,
              pnlSinceChange,
              pnlSinceChangePct,
              tradesSinceChange: tradesSinceChange.length,
              winRateSinceChange,
            };
          })
        : [];

      // Calculate P&L based on selected mode
      let totalPnL: number;
      let totalPnLGross: number;
      let totalPnLAfterFees: number;
      let totalPnLNet: number;
      let totalFees: number;
      let totalFunding: number;
      let pnlSource: string;
      
      // Use Binance API data only if it succeeded (not rate-limited) and has actual data
      const binancePnlValid = binancePnl && !(binancePnl as any).rateLimited && (binancePnl as any).success !== false;
      
      if (effectivePnlMode === "binance_overview" && binancePnlValid) {
        // Mode: binance_overview - sum income types from Binance API for the period
        // Matches Binance "Futures PNL" view exactly
        totalPnLGross = binancePnl!.todaysRealizedPnl;  // REALIZED_PNL
        totalFees = Math.abs(binancePnl!.commission);   // COMMISSION (negative in API)
        totalFunding = binancePnl!.fundingFee;          // FUNDING_FEE
        totalPnLAfterFees = binancePnl!.todaysRealizedPnl + binancePnl!.commission;
        totalPnLNet = binancePnl!.netPnl;               // REALIZED_PNL + COMMISSION + FUNDING_FEE
        totalPnL = totalPnLNet;
        pnlSource = "binance_income_api";
        
        console.log(`[PnL] Mode: binance_overview | gross=${totalPnLGross} fees=${totalFees} funding=${totalFunding} net=${totalPnLNet}`);
      } else {
        if (binancePnl && (binancePnl as any).rateLimited) {
          console.warn("[PnL] Binance rate limited – falling back to trade_history DB for totals");
        }
        // Mode: strict_trades - sum net_pnl from trade_history records only
        // Full precision sum, round only at display
        totalPnLGross = 0;
        totalFees = 0;
        totalFunding = 0;
        totalPnLNet = 0;
        
        for (const t of trades) {
          totalPnLGross += Number(t.pnl);
          totalFees += Number(t.total_fee || 0);
          totalFunding += Number(t.funding_fee || 0);
          totalPnLNet += Number(t.net_pnl ?? (Number(t.pnl) - Number(t.total_fee || 0) + Number(t.funding_fee || 0)));
        }
        
        totalPnLAfterFees = totalPnLGross - totalFees;
        totalPnL = totalPnLNet;
        pnlSource = "trade_history_db";
        
        console.log(`[PnL] Mode: strict_trades | gross=${totalPnLGross} fees=${totalFees} funding=${totalFunding} net=${totalPnLNet}`);
      }

      if (trades.length === 0 && fundingFees.length === 0) {
        setStats({
          totalPnL: 0,
          totalPnLPercent: 0,
          totalTrades: 0,
          winRate: 0,
          avgWin: 0,
          avgLoss: 0,
          largestWin: 0,
          largestLoss: 0,
          profitFactor: 0,
          fundingFees: 0,
          // New fee stats
          totalPnLGross: 0,
          totalPnLAfterFees: 0,
          totalPnLNet: 0,
          totalFees: 0,
          totalFunding: 0,
          winsGross: 0,
          winsAfterFees: 0,
          winsNet: 0,
          leverageBreakdown: [],
          slotBreakdown,
        });
        setChartData([]);
        setAggregatedData([]);
        return;
      }

      // Calculate statistics
      const totalPnLPercent = portfolioBalance > 0 ? (totalPnL / portfolioBalance) * 100 : 0;
      const totalPnLGrossPercent = portfolioBalance > 0 ? (totalPnLGross / portfolioBalance) * 100 : 0;
      const totalPnLAfterFeesPercent = portfolioBalance > 0 ? (totalPnLAfterFees / portfolioBalance) * 100 : 0;
      const totalPnLNetPercent = portfolioBalance > 0 ? (totalPnLNet / portfolioBalance) * 100 : 0;
      // Use net_pnl (Binance ground truth) for ALL win/loss stats
      const getNetPnl = (t: any) => Number(t.net_pnl ?? t.pnl);
      const winners = trades.filter(t => getNetPnl(t) > 0);
      const losers = trades.filter(t => getNetPnl(t) < 0);
      const winRate = trades.length > 0 ? (winners.length / trades.length) * 100 : 0;
      
      const totalWins = winners.reduce((sum, t) => sum + getNetPnl(t), 0);
      const totalLosses = Math.abs(losers.reduce((sum, t) => sum + getNetPnl(t), 0));
      const avgWin = winners.length > 0 ? totalWins / winners.length : 0;
      const avgLoss = losers.length > 0 ? totalLosses / losers.length : 0;
      const profitFactor = totalLosses > 0 ? totalWins / totalLosses : totalWins > 0 ? Infinity : 0;

      const largestWin = winners.length > 0 
        ? Math.max(...winners.map(t => getNetPnl(t))) 
        : 0;
      const largestLoss = losers.length > 0 
        ? Math.min(...losers.map(t => getNetPnl(t))) 
        : 0;

      // Win counts for different P&L types
      const winsGross = trades.filter(t => Number(t.pnl) > 0).length;
      const winsAfterFees = trades.filter(t => {
        const pnlAfterFees = Number(t.pnl_after_fees ?? (Number(t.pnl) - Number(t.total_fee || 0)));
        return pnlAfterFees > 0;
      }).length;
      const winsNet = trades.filter(t => getNetPnl(t) > 0).length;

      // Calculate total hours in period for per-hour metrics
      const periodHours = (effectiveNowMs - startMs) / (1000 * 60 * 60);
      const totalDurationMinutes = trades.reduce((sum, t) => sum + Number(t.duration_minutes || 0), 0);
      const totalHoldHours = totalDurationMinutes / 60;

      // Impact calculations
      const absNetPnl = Math.abs(totalPnLNet);
      const absGrossPnl = Math.abs(totalPnLGross);
      const absFunding = Math.abs(totalFunding);
      const absFees = Math.abs(totalFees);

      // Funding impact
      const fundingPctOfNetPnl = absNetPnl > 0 ? (absFunding / absNetPnl) * 100 : 0;
      const fundingPerHour = periodHours > 0 ? totalFunding / periodHours : 0;
      const fundingHelpsStrategy = totalFunding > 0;

      // Fee impact  
      const feesPctOfGrossPnl = absGrossPnl > 0 ? (absFees / absGrossPnl) * 100 : 0;
      const feesPerTrade = trades.length > 0 ? totalFees / trades.length : 0;
      const feesPerHour = periodHours > 0 ? totalFees / periodHours : 0;

      // Leverage breakdown - only include trades with complete fee data
      const leverageGroups = new Map<number, { 
        count: number; 
        grossPnl: number; 
        netPnl: number; 
        fees: number; 
        funding: number; 
        notional: number;
        durationMinutes: number;
      }>();
      trades.forEach(t => {
        // Skip trades without known leverage
        const storedLeverage = t.leverage_used != null ? Number(t.leverage_used) : null;
        const snapshotLeverage = (t.indicators_snapshot as any)?.leverage != null ? Number((t.indicators_snapshot as any).leverage) : null;
        const leverage = storedLeverage ?? snapshotLeverage;
        if (leverage == null) return;
        
        // Skip trades with missing fee data for accurate comparison
        if (t.fees_data_missing === true) return;
        
        const group = leverageGroups.get(leverage) || { 
          count: 0, grossPnl: 0, netPnl: 0, fees: 0, funding: 0, notional: 0, durationMinutes: 0 
        };
        group.count++;
        group.grossPnl += Number(t.pnl);
        group.fees += Number(t.total_fee || 0);
        group.funding += Number(t.funding_fee || 0);
        group.netPnl += Number(t.net_pnl ?? (Number(t.pnl) - Number(t.total_fee || 0) + Number(t.funding_fee || 0)));
        group.notional += Number(t.notional ?? (Number(t.entry_price) * Number(t.quantity)));
        group.durationMinutes += Number(t.duration_minutes || 0);
        leverageGroups.set(leverage, group);
      });

      const leverageBreakdown = Array.from(leverageGroups.entries())
        .map(([leverage, data]) => {
          const absGroupNet = Math.abs(data.netPnl);
          const absGroupGross = Math.abs(data.grossPnl);
          const groupHours = data.durationMinutes / 60;
          return {
            leverage,
            count: data.count,
            grossPnl: data.grossPnl,
            fees: data.fees,
            funding: data.funding,
            netPnl: data.netPnl,
            avgNet: data.count > 0 ? data.netPnl / data.count : 0,
            feesPctOfGross: absGroupGross > 0 ? (Math.abs(data.fees) / absGroupGross) * 100 : 0,
            fundingPctOfNet: absGroupNet > 0 ? (Math.abs(data.funding) / absGroupNet) * 100 : 0,
            netPnlPerHour: groupHours > 0 ? data.netPnl / groupHours : 0,
            lowSample: data.count < 10,
            fundingHelps: data.funding > 0,
            leverageReducesEdge: data.grossPnl > 0 && data.netPnl < data.grossPnl * 0.5, // fees+funding eat >50% of gross
          };
        })
        .sort((a, b) => a.leverage - b.leverage);

      // Determine optimal leverage (highest net P&L per hour with sufficient sample)
      const significantLeverages = leverageBreakdown.filter(l => !l.lowSample);
      const optimalLeverage = significantLeverages.length > 0
        ? significantLeverages.reduce((best, curr) => curr.netPnlPerHour > best.netPnlPerHour ? curr : best)
        : null;

      // Overall indicators
      const leverageReducesEdge = leverageBreakdown.some(l => l.leverageReducesEdge && !l.lowSample);

      setStats({
        totalPnL,
        totalPnLPercent,
        totalPnLGrossPercent,
        totalPnLAfterFeesPercent,
        totalPnLNetPercent,
        totalTrades: trades.length,
        winRate,
        avgWin,
        avgLoss,
        largestWin,
        largestLoss,
        profitFactor,
        fundingFees: totalFunding,
        pnlSource,
        pnlMode: effectivePnlMode,
        // New fee stats
        totalPnLGross,
        totalPnLAfterFees,
        totalPnLNet,
        totalFees,
        totalFunding,
        winsGross,
        winsAfterFees,
        winsNet,
        leverageBreakdown,
        slotBreakdown,
        // Impact metrics
        fundingPctOfNetPnl,
        fundingPerHour,
        fundingHelpsStrategy,
        feesPctOfGrossPnl,
        feesPerTrade,
        feesPerHour,
        totalHoldHours,
        periodHours,
        optimalLeverage,
        leverageReducesEdge,
      });

      // Create cumulative P&L chart data (UTC/Binance time)
      // Use NET P&L (after fees and funding) for accurate real P&L
      let cumulativePnL = 0;
      const cumulativeData = trades.map(trade => {
        // Calculate net P&L: use stored value or compute from pnl - fees + funding
        const netPnl = Number(trade.net_pnl ?? (Number(trade.pnl) - Number(trade.total_fee || 0) + Number(trade.funding_fee || 0)));
        cumulativePnL += netPnl;
        const date = new Date(trade.closed_at);
        return {
          time: date.toLocaleString("da-DK", {
            month: "short",
            day: "numeric",
            hour: range === "24h" ? "2-digit" : undefined,
            minute: range === "24h" ? "2-digit" : undefined,
            timeZone: "UTC",
          }) + " UTC",
          fullDateTime: date.toLocaleString("da-DK", {
            day: "numeric",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            timeZone: "UTC",
          }) + " UTC",
          pnl: Number(netPnl.toFixed(2)),
          cumulative: Number(cumulativePnL.toFixed(2)),
        };
      });

      // Create aggregated P&L data for bar chart (UTC/Binance time)
      // Use timestamp as key for reliable sorting, store label separately
      const aggregatedPnL = new Map<number, { label: string; pnl: number }>();
      
      // Helper to get week number
      const getWeekNumber = (date: Date): number => {
        const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
        const dayNum = d.getUTCDay() || 7;
        d.setUTCDate(d.getUTCDate() + 4 - dayNum);
        const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
      };

      // Helper to get timestamp key and label for a date
      const getKeyAndLabel = (date: Date, rangeType: TimeRange): { key: number; label: string } => {
        if (rangeType === "24h") {
          const key = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), date.getUTCHours());
          const label = new Date(key).toLocaleString("da-DK", {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            timeZone: "UTC",
          }) + " UTC";
          return { key, label };
        } else if (rangeType === "7d" || rangeType === "30d" || rangeType === "since_change" || rangeType === "custom") {
          const key = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
          const label = new Date(key).toLocaleString("da-DK", {
            month: "short",
            day: "numeric",
            timeZone: "UTC",
          }) + " UTC";
          return { key, label };
        } else if (rangeType === "90d") {
          const weekNum = getWeekNumber(date);
          const key = Date.UTC(date.getUTCFullYear(), 0, 1) + (weekNum * 7 * 24 * 60 * 60 * 1000);
          const label = `Uge ${weekNum}, ${date.getUTCFullYear()}`;
          return { key, label };
        } else {
          const key = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
          const label = new Date(key).toLocaleString("da-DK", {
            month: "short",
            year: "numeric",
            timeZone: "UTC",
          });
          return { key, label };
        }
      };

      // Pre-fill all time slots with 0 for ranges that need complete data
      if (range === "24h" || range === "7d" || range === "30d") {
        // Create fresh copies to avoid mutating startDate
        const rangeStart = new Date(startDate.getTime());
        const rangeEnd = new Date(now.getTime());
        
        // Reset to start of day/hour for consistent keys
        if (range === "24h") {
          rangeStart.setUTCMinutes(0, 0, 0);
          rangeEnd.setUTCMinutes(0, 0, 0);
        } else {
          rangeStart.setUTCHours(0, 0, 0, 0);
          rangeEnd.setUTCHours(0, 0, 0, 0);
        }
        
        const current = new Date(rangeStart.getTime());
        console.log(`Pre-fill: range=${range}, from ${rangeStart.toISOString()} to ${rangeEnd.toISOString()}`);
        let prefillCount = 0;
        while (current <= rangeEnd) {
          const { key, label } = getKeyAndLabel(current, range);
          aggregatedPnL.set(key, { label, pnl: 0 });
          prefillCount++;
          if (range === "24h") {
            current.setUTCHours(current.getUTCHours() + 1);
          } else {
            current.setUTCDate(current.getUTCDate() + 1);
          }
        }
        console.log(`Pre-filled ${prefillCount} slots, Map size: ${aggregatedPnL.size}`);
      }
      
      let matchedCount = 0;
      let unmatchedCount = 0;
      
      // Debug: log first and last few trades to see their dates
      if (trades.length > 0) {
        console.log(`First trade closed_at: ${trades[0].closed_at}`);
        console.log(`Last trade closed_at: ${trades[trades.length - 1].closed_at}`);
      }
      
      trades.forEach((trade, idx) => {
        const date = new Date(trade.closed_at);
        const { key, label } = getKeyAndLabel(date, range);
        const existing = aggregatedPnL.get(key);
        
        // Calculate net P&L: use stored value or compute from pnl - fees + funding
        const netPnl = Number(trade.net_pnl ?? (Number(trade.pnl) - Number(trade.total_fee || 0) + Number(trade.funding_fee || 0)));
        
        // Debug first few trades
        if (idx < 3) {
          console.log(`Trade ${idx}: closed_at=${trade.closed_at}, key=${key}, label=${label}, exists=${!!existing}, netPnl=${netPnl.toFixed(2)}`);
        }
        
        if (existing) {
          existing.pnl += netPnl;
          matchedCount++;
        } else {
          aggregatedPnL.set(key, { label, pnl: netPnl });
          unmatchedCount++;
        }
      });

      console.log(`Trades processed: ${matchedCount} matched, ${unmatchedCount} unmatched, total: ${trades.length}`);
      console.log(`After trades: Map size: ${aggregatedPnL.size}`);
      
      // Log all pre-filled keys for 30d range
      if (range === "30d") {
        const allKeys = Array.from(aggregatedPnL.keys()).sort((a, b) => a - b);
        console.log(`All pre-filled keys (first 5):`, allKeys.slice(0, 5).map(k => ({ key: k, date: new Date(k).toISOString() })));
        console.log(`All pre-filled keys (last 5):`, allKeys.slice(-5).map(k => ({ key: k, date: new Date(k).toISOString() })));
      }
      
      // Log entries with non-zero pnl
      const nonZeroEntries = Array.from(aggregatedPnL.entries()).filter(([_, data]) => data.pnl !== 0);
      console.log(`Non-zero entries (${nonZeroEntries.length}):`, nonZeroEntries.map(([k, d]) => ({ key: k, label: d.label, pnl: d.pnl.toFixed(2) })));

      // Convert to array, sort by timestamp key, and extract display data
      const aggregatedData = Array.from(aggregatedPnL.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([_, data]) => ({
          time: data.label,
          pnl: Number(data.pnl.toFixed(2)),
        }));
      
      console.log(`Final aggregatedData length: ${aggregatedData.length}`);

      setChartData(cumulativeData);
      setAggregatedData(aggregatedData);
    } catch (error: any) {
      console.error("P&L fetch error:", error);
      toast({
        title: "Fejl",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Ref to track current timeRange for use in subscription callback
  const timeRangeRef = useRef(timeRange);
  
  useEffect(() => {
    timeRangeRef.current = timeRange;
  }, [timeRange]);

  useEffect(() => {
    if (timeRange === "custom" && (!customFrom || !customTo)) return;
    fetchPnLData(timeRange);
  }, [timeRange, pnlMode, customFrom, customTo, slotId, includeLegacyData]);

  // Separate effect for realtime subscription - only set up once
  // Non-blocking: errors don't prevent the component from rendering
  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let mounted = true;

    const setupSubscription = () => {
      if (!mounted) return;
      
      console.log("[PnL] Setting up realtime subscription for trade_history changes");
      
      channel = supabase
        .channel("pnl-trade-history-changes")
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "trade_history",
          },
          (payload) => {
            if (!mounted) return;
            console.log("[PnL] Realtime: trade_history changed, refetching data", payload);
            fetchPnLData(timeRangeRef.current);
          }
        )
        .subscribe((status) => {
          console.log("[PnL] Realtime subscription status:", status);
          // Don't let subscription errors affect the UI
        });
    };

    // Delay subscription setup slightly to not block initial render
    const timer = window.setTimeout(setupSubscription, 500);

    return () => {
      mounted = false;
      window.clearTimeout(timer);
      if (channel) {
        console.log("[PnL] Cleaning up realtime subscription");
        supabase.removeChannel(channel);
      }
    };
  }, []);

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const isProfitable = stats?.totalPnL >= 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Profit & Loss Oversigt</CardTitle>
          <div className="flex items-center gap-1 text-xs">
            {isSlotScopedView ? (
              <Button
                variant="default"
                size="sm"
                className="text-xs h-7 px-2"
                disabled
              >
                Trades (slot)
              </Button>
            ) : (
              <>
                <Button
                  variant={pnlMode === "binance_overview" ? "default" : "outline"}
                  size="sm"
                  className="text-xs h-7 px-2"
                  onClick={() => setPnlMode("binance_overview")}
                >
                  Binance
                </Button>
                <Button
                  variant={pnlMode === "strict_trades" ? "default" : "outline"}
                  size="sm"
                  className="text-xs h-7 px-2"
                  onClick={() => setPnlMode("strict_trades")}
                >
                  Trades
                </Button>
              </>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <Tabs value={timeRange} onValueChange={(v) => setTimeRange(v as TimeRange)}>
          <TabsList className="grid w-full grid-cols-8">
            <TabsTrigger value="24h">24t</TabsTrigger>
            <TabsTrigger value="7d">7d</TabsTrigger>
            <TabsTrigger value="30d">30d</TabsTrigger>
            <TabsTrigger value="90d">90d</TabsTrigger>
            <TabsTrigger value="1y">1år</TabsTrigger>
            <TabsTrigger value="all">Alt</TabsTrigger>
            <TabsTrigger value="since_change" className="text-xs">Strategi</TabsTrigger>
            <TabsTrigger value="custom" className="text-xs">Periode</TabsTrigger>
          </TabsList>

          {/* Custom date range picker */}
          {timeRange === "custom" && (
            <div className="flex items-center gap-2 mt-3 flex-wrap">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className={cn("text-xs h-8", !customFrom && "text-muted-foreground")}>
                    <CalendarIcon className="h-3 w-3 mr-1" />
                    {customFrom ? format(customFrom, "dd/MM/yyyy") : "Fra dato"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={customFrom}
                    onSelect={setCustomFrom}
                    disabled={(date) => date > new Date()}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
              <span className="text-xs text-muted-foreground">→</span>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className={cn("text-xs h-8", !customTo && "text-muted-foreground")}>
                    <CalendarIcon className="h-3 w-3 mr-1" />
                    {customTo ? format(customTo, "dd/MM/yyyy") : "Til dato"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={customTo}
                    onSelect={setCustomTo}
                    disabled={(date) => date > new Date() || (customFrom ? date < customFrom : false)}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
            </div>
          )}

          <TabsContent value={timeRange} className="space-y-6">
            {/* Key Metrics */}
            <div className="grid gap-4 md:grid-cols-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <DollarSign className="h-4 w-4" />
                  <span>P&L (Gross)</span>
                </div>
                <div
                  className={`text-xl font-bold ${
                    stats?.totalPnLGross >= 0 ? "text-profit" : "text-loss"
                  }`}
                >
                  {stats?.totalPnLGross >= 0 ? "+" : ""}${stats?.totalPnLGross?.toFixed(2) || "0.00"}
                  <span className="text-sm ml-2">
                    ({stats?.totalPnLGrossPercent >= 0 ? "+" : ""}{stats?.totalPnLGrossPercent?.toFixed(2) || "0.00"}%)
                  </span>
                </div>
                <div className="text-xs text-muted-foreground">
                  Wins: {stats?.winsGross || 0}
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <DollarSign className="h-4 w-4" />
                  <span>P&L (Efter fees)</span>
                </div>
                <div
                  className={`text-xl font-bold ${
                    stats?.totalPnLAfterFees >= 0 ? "text-profit" : "text-loss"
                  }`}
                >
                  {stats?.totalPnLAfterFees >= 0 ? "+" : ""}${stats?.totalPnLAfterFees?.toFixed(2) || "0.00"}
                  <span className="text-sm ml-2">
                    ({stats?.totalPnLAfterFeesPercent >= 0 ? "+" : ""}{stats?.totalPnLAfterFeesPercent?.toFixed(2) || "0.00"}%)
                  </span>
                </div>
                <div className="text-xs text-muted-foreground">
                  Wins: {stats?.winsAfterFees || 0} | Fees: ${stats?.totalFees?.toFixed(2) || "0.00"}
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <DollarSign className="h-4 w-4" />
                  <span>P&L (Efter fees + funding)</span>
                </div>
                <div
                  className={`text-xl font-bold ${
                    stats?.totalPnLNet >= 0 ? "text-profit" : "text-loss"
                  }`}
                >
                  {stats?.totalPnLNet >= 0 ? "+" : ""}${stats?.totalPnLNet?.toFixed(2) || "0.00"}
                  <span className="text-sm ml-2">
                    ({stats?.totalPnLNetPercent >= 0 ? "+" : ""}{stats?.totalPnLNetPercent?.toFixed(2) || "0.00"}%)
                  </span>
                </div>
                <div className="text-xs text-muted-foreground">
                  Wins: {stats?.winsNet || 0} | Funding: {stats?.totalFunding >= 0 ? "+" : ""}{stats?.totalFunding?.toFixed(2) || "0.00"}
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Percent className="h-4 w-4" />
                  <span>Win Rate / Profit Factor</span>
                </div>
                <div className="text-xl font-bold">{stats?.winRate?.toFixed(1) || 0}%</div>
                <div className="text-xs text-muted-foreground">
                  PF: {stats?.profitFactor === Infinity ? "∞" : stats?.profitFactor?.toFixed(2) || "0"} | Trades: {stats?.totalTrades || 0}
                </div>
              </div>
            </div>

            {!slotId && Array.isArray(stats?.slotBreakdown) && stats.slotBreakdown.length > 0 && (
              <div className="border rounded-lg p-4 space-y-3">
                <h3 className="text-sm font-medium">P&L pr. Slot (net)</h3>
                <div className="grid gap-3 md:grid-cols-2">
                  {stats.slotBreakdown.map((slot: SlotPnlBreakdown) => {
                    const slotProfitable = slot.totalNetPnl >= 0;
                    return (
                      <div
                        key={slot.slotId}
                        className={cn(
                          "rounded-md border p-3 space-y-2 transition-colors",
                          onSelectSlot && "cursor-pointer hover:bg-accent/50 hover:border-primary/40"
                        )}
                        onClick={() => onSelectSlot?.(slot.slotId)}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium">{slot.slotName}</span>
                          <span className={`text-sm font-bold ${slotProfitable ? "text-profit" : "text-loss"}`}>
                            {slotProfitable ? "+" : ""}{slot.totalNetPnl.toFixed(2)} USD ({slotProfitable ? "+" : ""}{slot.totalNetPnlPct.toFixed(2)}%)
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Trades: {slot.trades} · Win rate: {slot.winRate.toFixed(1)}%
                        </div>
                        {/* Last config change + P&L since – only when "Strategi" tab is active */}
                        {slot.lastConfigChange && timeRange === "since_change" && (
                          <div className="border-t pt-2 mt-1 space-y-1">
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Clock className="h-3 w-3" />
                              <span>Strategi ændret: {format(new Date(slot.lastConfigChange), "dd/MM/yyyy HH:mm")}</span>
                            </div>
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-muted-foreground">Siden ændring:</span>
                              <span className={slot.pnlSinceChange >= 0 ? "text-profit font-medium" : "text-loss font-medium"}>
                                {slot.pnlSinceChange >= 0 ? "+" : ""}{slot.pnlSinceChange.toFixed(2)} USD ({slot.pnlSinceChangePct >= 0 ? "+" : ""}{slot.pnlSinceChangePct.toFixed(2)}%) · {slot.tradesSinceChange} trades, {slot.winRateSinceChange.toFixed(0)}% WR
                              </span>
                            </div>
                            <ExportTradesDialog
                              slotId={slot.slotId}
                              buttonVariant="ghost"
                              buttonSize="sm"
                              defaultFilterType="since_change"
                            />
                          </div>
                        )}
                        {slot.chartData.length > 1 && (
                          <ResponsiveContainer width="100%" height={60}>
                            <LineChart data={slot.chartData}>
                              <Line
                                type="monotone"
                                dataKey="cumulative"
                                stroke={slotProfitable ? "#10b981" : "#ef4444"}
                                strokeWidth={1.5}
                                dot={false}
                              />
                              <YAxis hide domain={['dataMin', 'dataMax']} />
                            </LineChart>
                          </ResponsiveContainer>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Impact Analysis Section */}
            <div className="grid gap-4 md:grid-cols-2">
              {/* Funding Impact */}
              <div className="border rounded-lg p-4 space-y-3">
                <h3 className="text-sm font-medium flex items-center gap-2">
                  Funding Impact
                  {stats?.fundingHelpsStrategy && (
                    <span className="text-xs bg-profit/20 text-profit px-2 py-0.5 rounded">Hjælper ✓</span>
                  )}
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-xs text-muted-foreground">Funding % af Net P&L</div>
                    <div className={`text-lg font-semibold ${stats?.fundingHelpsStrategy ? "text-profit" : "text-loss"}`}>
                      {stats?.fundingPctOfNetPnl?.toFixed(1) || "0.0"}%
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Funding pr. time</div>
                    <div className={`text-lg font-semibold ${stats?.fundingPerHour >= 0 ? "text-profit" : "text-loss"}`}>
                      {stats?.fundingPerHour >= 0 ? "+" : ""}{stats?.fundingPerHour?.toFixed(4) || "0.00"} USD
                    </div>
                  </div>
                </div>
                <div className="text-xs text-muted-foreground">
                  Total funding: {stats?.totalFunding >= 0 ? "+" : ""}{stats?.totalFunding?.toFixed(2)} USD over {stats?.periodHours?.toFixed(0)}t
                </div>
              </div>

              {/* Fee Impact */}
              <div className="border rounded-lg p-4 space-y-3">
                <h3 className="text-sm font-medium">Fee Impact</h3>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <div className="text-xs text-muted-foreground">Fees % af Gross</div>
                    <div className="text-lg font-semibold text-muted-foreground">
                      {stats?.feesPctOfGrossPnl?.toFixed(1) || "0.0"}%
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Fees pr. trade</div>
                    <div className="text-lg font-semibold text-muted-foreground">
                      {stats?.feesPerTrade?.toFixed(2) || "0.00"} USD
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Fees pr. time</div>
                    <div className="text-lg font-semibold text-muted-foreground">
                      {stats?.feesPerHour?.toFixed(4) || "0.00"} USD
                    </div>
                  </div>
                </div>
                <div className="text-xs text-muted-foreground">
                  Total fees: {stats?.totalFees?.toFixed(2)} USD | Hold-tid: {stats?.totalHoldHours?.toFixed(1)}t
                </div>
              </div>
            </div>

            {/* Overall Indicators */}
            {(stats?.optimalLeverage || stats?.leverageReducesEdge) && (
              <div className="border rounded-lg p-4 bg-muted/30">
                <h3 className="text-sm font-medium mb-2">Samlet Vurdering</h3>
                <div className="flex flex-wrap gap-3">
                  {stats?.fundingHelpsStrategy && (
                    <div className="flex items-center gap-2 text-sm bg-profit/10 text-profit px-3 py-1.5 rounded-lg">
                      <TrendingUp className="h-4 w-4" />
                      Funding hjælper strategien
                    </div>
                  )}
                  {!stats?.fundingHelpsStrategy && stats?.totalFunding < 0 && (
                    <div className="flex items-center gap-2 text-sm bg-loss/10 text-loss px-3 py-1.5 rounded-lg">
                      <TrendingDown className="h-4 w-4" />
                      Funding koster {Math.abs(stats?.totalFunding).toFixed(2)} USD
                    </div>
                  )}
                  {stats?.leverageReducesEdge && (
                    <div className="flex items-center gap-2 text-sm bg-yellow-500/10 text-yellow-600 px-3 py-1.5 rounded-lg">
                      ⚠️ Høj leverage reducerer edge ({">"}50% af gross tabt til fees/funding)
                    </div>
                  )}
                  {stats?.optimalLeverage && (
                    <div className="flex items-center gap-2 text-sm bg-primary/10 text-primary px-3 py-1.5 rounded-lg">
                      🎯 Bedste leverage: {stats.optimalLeverage.leverage}x ({stats.optimalLeverage.netPnlPerHour.toFixed(2)} USD/time)
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Leverage Breakdown */}
            {stats?.leverageBreakdown && stats.leverageBreakdown.length > 0 && (
              <div className="border rounded-lg p-4">
                <h3 className="text-sm font-medium mb-1">Breakdown pr. Leverage</h3>
                <p className="text-xs text-muted-foreground mb-3">
                  Kun trades med komplet fee-data inkluderet. 
                  {stats.leverageBreakdown.some((r: any) => r.lowSample) && (
                    <span className="text-yellow-500 ml-1">⚠️ = &lt;10 trades (lav sample size)</span>
                  )}
                </p>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Leverage</TableHead>
                        <TableHead className="text-xs">Trades</TableHead>
                        <TableHead className="text-xs">Gross P&L</TableHead>
                        <TableHead className="text-xs">Fees</TableHead>
                        <TableHead className="text-xs">Fees %</TableHead>
                        <TableHead className="text-xs">Funding</TableHead>
                        <TableHead className="text-xs">Fund %</TableHead>
                        <TableHead className="text-xs">Net P&L</TableHead>
                        <TableHead className="text-xs">Net/time</TableHead>
                        <TableHead className="text-xs">Avg Net</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {stats.leverageBreakdown.map((row: any) => (
                        <TableRow key={row.leverage} className={row.lowSample ? "opacity-60" : ""}>
                          <TableCell className="font-medium">
                            {row.leverage}x {row.lowSample && <span className="text-yellow-500">⚠️</span>}
                            {row.leverageReducesEdge && !row.lowSample && <span className="text-yellow-500 ml-1">📉</span>}
                          </TableCell>
                          <TableCell>{row.count}</TableCell>
                          <TableCell className={row.grossPnl >= 0 ? "text-profit" : "text-loss"}>
                            {row.grossPnl >= 0 ? "+" : ""}{row.grossPnl.toFixed(2)}
                          </TableCell>
                          <TableCell className="text-muted-foreground">{row.fees.toFixed(2)}</TableCell>
                          <TableCell className="text-muted-foreground">{row.feesPctOfGross.toFixed(1)}%</TableCell>
                          <TableCell className={row.funding >= 0 ? "text-profit" : "text-loss"}>
                            {row.funding >= 0 ? "+" : ""}{row.funding.toFixed(2)}
                          </TableCell>
                          <TableCell className={row.fundingHelps ? "text-profit" : "text-muted-foreground"}>
                            {row.fundingPctOfNet.toFixed(1)}%
                          </TableCell>
                          <TableCell className={row.netPnl >= 0 ? "text-profit" : "text-loss"}>
                            {row.netPnl >= 0 ? "+" : ""}{row.netPnl.toFixed(2)}
                          </TableCell>
                          <TableCell className={row.netPnlPerHour >= 0 ? "text-profit" : "text-loss"}>
                            {row.netPnlPerHour >= 0 ? "+" : ""}{row.netPnlPerHour.toFixed(2)}
                          </TableCell>
                          <TableCell className={row.avgNet >= 0 ? "text-profit" : "text-loss"}>
                            {row.avgNet >= 0 ? "+" : ""}{row.avgNet.toFixed(2)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            {/* Cumulative P&L Chart */}
            {chartData.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-medium">Kumulativ P&L</h3>
                  <div className="flex gap-1">
                    <Button
                      variant={chartType === "line" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setChartType("line")}
                    >
                      <LineChartIcon className="h-4 w-4" />
                    </Button>
                    <Button
                      variant={chartType === "bar" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setChartType("bar")}
                    >
                      <BarChart3 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={300}>
                  {chartType === "line" ? (
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="time" />
                      <YAxis />
                      <Tooltip content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const data = payload[0].payload;
                        return (
                          <div className="rounded-lg border border-border/50 bg-background px-3 py-2 text-xs shadow-xl">
                            <div className="text-muted-foreground mb-1">{data.fullDateTime}</div>
                            <div className="font-mono font-medium">
                              cumulative: <span className={data.cumulative >= 0 ? "text-profit" : "text-loss"}>{data.cumulative.toFixed(2)}</span>
                            </div>
                            <div className="font-mono text-muted-foreground">
                              trade: {data.pnl >= 0 ? "+" : ""}{data.pnl.toFixed(2)}
                            </div>
                          </div>
                        );
                      }} />
                      <Line
                        type="monotone"
                        dataKey="cumulative"
                        stroke={isProfitable ? "#10b981" : "#ef4444"}
                        strokeWidth={2}
                      />
                    </LineChart>
                  ) : (
                    <BarChart 
                      data={aggregatedData}
                      onClick={(data) => {
                        if (data && data.activePayload && data.activePayload[0]) {
                          const clickedTime = data.activePayload[0].payload.time;
                          const tradesInPeriod = allTrades.filter(trade => {
                            const date = new Date(trade.closed_at);
                            let timeKey: string;
                            
                            // Helper to get week number
                            const getWeekNumber = (d: Date): number => {
                              const utcDate = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
                              const dayNum = utcDate.getUTCDay() || 7;
                              utcDate.setUTCDate(utcDate.getUTCDate() + 4 - dayNum);
                              const yearStart = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 1));
                              return Math.ceil((((utcDate.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
                            };
                            
                            if (timeRange === "24h") {
                              timeKey = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), date.getUTCHours())).toLocaleString("da-DK", {
                                month: "short",
                                day: "numeric",
                                hour: "2-digit",
                                timeZone: "UTC",
                              }) + " UTC";
                            } else if (timeRange === "7d" || timeRange === "30d") {
                              timeKey = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())).toLocaleString("da-DK", {
                                month: "short",
                                day: "numeric",
                                timeZone: "UTC",
                              }) + " UTC";
                            } else if (timeRange === "90d") {
                              const weekNum = getWeekNumber(date);
                              timeKey = `Uge ${weekNum}, ${date.getUTCFullYear()}`;
                            } else {
                              timeKey = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)).toLocaleString("da-DK", {
                                month: "short",
                                year: "numeric",
                                timeZone: "UTC",
                              });
                            }
                            
                            return timeKey === clickedTime;
                          });
                          setSelectedPeriodTrades(tradesInPeriod);
                          setDialogOpen(true);
                        }
                      }}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="time" />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="pnl" cursor="pointer">
                        {aggregatedData.map((entry, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={entry.pnl >= 0 ? "#10b981" : "#ef4444"}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  )}
                </ResponsiveContainer>
              </div>
            )}

            {/* Additional Stats */}
            <div className="grid gap-4 md:grid-cols-4 pt-4 border-t">
              <div className="space-y-1">
                <div className="text-sm text-muted-foreground">Gns. Gevinst</div>
                <div className="text-lg font-semibold text-profit">
                  ${stats?.avgWin.toFixed(2)}
                </div>
              </div>

              <div className="space-y-1">
                <div className="text-sm text-muted-foreground">Gns. Tab</div>
                <div className="text-lg font-semibold text-loss">
                  ${stats?.avgLoss.toFixed(2)}
                </div>
              </div>

              <div className="space-y-1">
                <div className="text-sm text-muted-foreground">Største Gevinst</div>
                <div className="text-lg font-semibold text-profit">
                  ${stats?.largestWin.toFixed(2)}
                </div>
              </div>

              <div className="space-y-1">
                <div className="text-sm text-muted-foreground">Største Tab</div>
                <div className="text-lg font-semibold text-loss">
                  ${stats?.largestLoss.toFixed(2)}
                </div>
              </div>
            </div>

            {chartData.length === 0 && (
              <p className="text-center text-muted-foreground py-8">
                Ingen trades i denne periode
              </p>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle>Trades i perioden</DialogTitle>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (selectedPeriodTrades.length === 0) {
                      toast({
                        title: "Ingen handler",
                        description: "Ingen handler i denne periode",
                        variant: "destructive",
                      });
                      return;
                    }
                    
                    // Sort trades descending by closed_at for export
                    const sortedTrades = [...selectedPeriodTrades].sort(
                      (a, b) => new Date(b.closed_at).getTime() - new Date(a.closed_at).getTime()
                    );
                    
                    const compressed = compressTradeData(sortedTrades);
                    const jsonStr = formatWithLineBreaks(compressed);
                    
                    navigator.clipboard.writeText(jsonStr).then(() => {
                      toast({
                        title: "Eksporteret til clipboard! ✓",
                        description: `${selectedPeriodTrades.length} handler kopieret i kompakt format`,
                      });
                    }).catch((err) => {
                      console.error('Clipboard failed:', err);
                      toast({
                        title: "Fejl",
                        description: "Kunne ikke kopiere til clipboard",
                        variant: "destructive",
                      });
                    });
                  }}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Eksporter til AI
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const totalPnL = selectedPeriodTrades.reduce((sum, t) => sum + Number(t.pnl), 0);
                    const winRate = selectedPeriodTrades.length > 0
                      ? ((selectedPeriodTrades.filter(t => Number(t.pnl) > 0).length / selectedPeriodTrades.length) * 100).toFixed(1)
                      : 0;
                    
                    // Formater indicators_snapshot til læsbar tekst
                    const formatIndicatorsText = (snapshot: any) => {
                      if (!snapshot) return "Ingen indikator data tilgængelig";
                      
                      const lines = [];
                      
                      // EMA værdier
                      if (snapshot.ema_enabled) {
                        lines.push(`EMA Fast (9): ${snapshot.emaFast?.toFixed(2)}`);
                        lines.push(`EMA Medium (21): ${snapshot.emaMedium?.toFixed(2)}`);
                        lines.push(`EMA Slow (50): ${snapshot.emaSlow?.toFixed(2)}`);
                        if (snapshot.ema_medium_trend) lines.push(`EMA Trend (50): ${snapshot.ema_medium_trend.toFixed(2)}`);
                      }
                      
                      // RSI værdier
                      if (snapshot.rsi_enabled) {
                        lines.push(`RSI Værdi: ${snapshot.rsi?.toFixed(2)}`);
                        lines.push(`RSI Min Long: ${snapshot.rsi_min_long || 30}`);
                        lines.push(`RSI Max Short: ${snapshot.rsi_max_short || 70}`);
                      }
                      
                      // MACD værdier
                      if (snapshot.macd_enabled) {
                        lines.push(`MACD Histogram: ${snapshot.macd?.toFixed(6)}`);
                        lines.push(`MACD Fast: ${snapshot.macd_fast || 12}, Slow: ${snapshot.macd_slow || 26}, Signal: ${snapshot.macd_signal || 9}`);
                      }
                      
                      // ATR værdier
                      if (snapshot.atr_enabled) {
                        lines.push(`ATR Værdi: ${snapshot.atr?.toFixed(2)}`);
                        lines.push(`ATR Stop Loss: ${snapshot.atr_stop_loss_multiplier || 2.8}x, Trailing: ${snapshot.atr_trailing_stop_multiplier || 2.0}x, Break Even: ${snapshot.break_even_atr || 0.8}x`);
                      }
                      
                      // ADX værdier
                      if (snapshot.adx_enabled) {
                        lines.push(`ADX Værdi: ${snapshot.adx?.toFixed(2)}`);
                        lines.push(`ADX Threshold: ${snapshot.adx_threshold || 40}`);
                      }
                      
                      // Volume
                      if (snapshot.volume_enabled) {
                        lines.push(`Volume: ${snapshot.volume?.toFixed(2)}`);
                        lines.push(`Volume Average: ${snapshot.avgVolume?.toFixed(2)}`);
                      }
                      
                      // Pivot Points
                      if (snapshot.pivot_points_enabled && snapshot.pivotPoints) {
                        lines.push(`Pivot Points - PP: ${snapshot.pivotPoints.pp?.toFixed(2)}, R1: ${snapshot.pivotPoints.r1?.toFixed(2)}, R2: ${snapshot.pivotPoints.r2?.toFixed(2)}, S1: ${snapshot.pivotPoints.s1?.toFixed(2)}, S2: ${snapshot.pivotPoints.s2?.toFixed(2)}`);
                      }
                      
                      // Config
                      lines.push(`Timeframes: Scan ${snapshot.scan_interval}, Trend ${snapshot.trend_timeframe}, Higher ${snapshot.higher_trend_timeframe}`);
                      lines.push(`Risk: Leverage ${snapshot.leverage}x, Position ${snapshot.position_size_percent}%, Risk/Trade ${snapshot.risk_per_trade_percent}%`);
                      lines.push(`Limits: Max Positions ${snapshot.max_open_positions}, Max Duration ${snapshot.max_position_duration_minutes}m`);
                      
                      return lines.join(", ");
                    };
                    
                    // Byg TSV tabel med indikatorer i én kolonne som 'NAVN værdi'
                    const header = `Symbol\tSide\tÅbnet\tLukket\tEntry\tExit\tP&L\tP&L%\tVarighed\tÅrsag\tScan TF\tTrend TF\tHigher TF\tMFE%\tIndikatorer\n`;

                    const formatIndicatorLine = (s: any) => {
                      if (!s) return "";
                      const parts: string[] = [];
                      const pushNum = (label: string, val?: number | null, digits = 2) => {
                        if (val === undefined || val === null || isNaN(Number(val))) return;
                        parts.push(`${label} ${Number(val).toFixed(digits)}`);
                      };
                      pushNum("ADX", s.adx, 2);
                      pushNum("RSI", s.rsi, 2);
                      pushNum("MACD", s.macd, 6);
                      pushNum("ATR", s.atr, 2);
                      pushNum("EMA9", s.emaFast, 2);
                      pushNum("EMA21", s.emaMedium, 2);
                      pushNum("EMA50", s.emaSlow, 2);
                      pushNum("VOL", s.volume, 2);
                      if (s.pivotPoints) pushNum("PP", s.pivotPoints.pp, 2);
                      return parts.join(" ");
                    };

                    const rows = selectedPeriodTrades.map((t) => {
                      const s = t.indicators_snapshot || {};
                      const opened = new Date(t.opened_at).toLocaleString("da-DK", { timeZone: "UTC" }) + " UTC";
                      const closed = new Date(t.closed_at).toLocaleString("da-DK", { timeZone: "UTC" }) + " UTC";
                      const entry = String(t.entry_price);
                      const exit = String(t.exit_price);
                      const pnl = `${Number(t.pnl) >= 0 ? "" : "-"}$${Math.abs(Number(t.pnl)).toFixed(2)}`;
                      const pnlPct = `${Number(t.pnl_percent).toFixed(2)}%`;
                      const duration = `${t.duration_minutes}m`;
                      const reason = t.close_reason || "";
                      const scanTf = s.scan_interval || "";
                      const trendTf = s.trend_timeframe || "";
                      const higherTf = s.higher_trend_timeframe || "";
                      const mfePct = s.mfe_percent != null ? `${Number(s.mfe_percent).toFixed(2)}%` : "";
                      const ind = formatIndicatorLine(s);
                      return `${t.symbol}\t${t.side}\t${opened}\t${closed}\t${entry}\t${exit}\t${pnl}\t${pnlPct}\t${duration}\t${reason}\t${scanTf}\t${trendTf}\t${higherTf}\t${mfePct}\t${ind}`;
                    }).join("\n");

                    const text = header + rows;
                    
                    navigator.clipboard.writeText(text).then(() => {
                      toast({
                        title: "Kopieret!",
                        description: `${selectedPeriodTrades.length} trades med indikatorer kopieret`,
                      });
                    });
                  }}
                >
                  <Copy className="h-4 w-4 mr-2" />
                  Kopier TSV
                </Button>
              </div>
            </div>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <div className="text-sm text-muted-foreground">Total P&L (net)</div>
                <div className={`text-xl font-bold ${
                  selectedPeriodTrades.reduce((sum, t) => sum + Number(t.net_pnl ?? (Number(t.pnl) - Number(t.total_fee || 0) + Number(t.funding_fee || 0))), 0) >= 0 
                    ? "text-profit" 
                    : "text-loss"
                }`}>
                  ${selectedPeriodTrades.reduce((sum, t) => sum + Number(t.net_pnl ?? (Number(t.pnl) - Number(t.total_fee || 0) + Number(t.funding_fee || 0))), 0).toFixed(2)}
                </div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Antal Trades</div>
                <div className="text-xl font-bold">{selectedPeriodTrades.length}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Win Rate (net)</div>
                <div className="text-xl font-bold">
                  {selectedPeriodTrades.length > 0
                    ? ((selectedPeriodTrades.filter(t => Number(t.net_pnl ?? (Number(t.pnl) - Number(t.total_fee || 0) + Number(t.funding_fee || 0))) > 0).length / selectedPeriodTrades.length) * 100).toFixed(1)
                    : 0}%
                </div>
              </div>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Symbol</TableHead>
                  <TableHead>Side</TableHead>
                  <TableHead>Entry</TableHead>
                  <TableHead>Exit</TableHead>
                  <TableHead>Quantity</TableHead>
                  <TableHead>P&L</TableHead>
                  <TableHead>P&L %</TableHead>
                  <TableHead>Tidspunkt</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {selectedPeriodTrades.map((trade) => (
                  <TableRow key={trade.id}>
                    <TableCell className="font-medium">{trade.symbol}</TableCell>
                    <TableCell>
                      <span className={trade.side === "LONG" ? "text-profit" : "text-loss"}>
                        {trade.side}
                      </span>
                    </TableCell>
                    <TableCell>${Number(trade.entry_price).toFixed(2)}</TableCell>
                    <TableCell>${Number(trade.exit_price).toFixed(2)}</TableCell>
                    <TableCell>{Number(trade.quantity).toFixed(4)}</TableCell>
                    <TableCell className={Number(trade.net_pnl ?? (Number(trade.pnl) - Number(trade.total_fee || 0) + Number(trade.funding_fee || 0))) >= 0 ? "text-profit" : "text-loss"}>
                      {Number(trade.net_pnl ?? (Number(trade.pnl) - Number(trade.total_fee || 0) + Number(trade.funding_fee || 0))) >= 0 ? "+" : ""}${Number(trade.net_pnl ?? (Number(trade.pnl) - Number(trade.total_fee || 0) + Number(trade.funding_fee || 0))).toFixed(2)}
                    </TableCell>
                    <TableCell className={Number(trade.pnl_percent) >= 0 ? "text-profit" : "text-loss"}>
                      {Number(trade.pnl_percent) >= 0 ? "+" : ""}{Number(trade.pnl_percent).toFixed(2)}%
                    </TableCell>
                    <TableCell>
                      {new Date(trade.closed_at).toLocaleString("da-DK", { timeZone: "UTC" })} UTC
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
};
