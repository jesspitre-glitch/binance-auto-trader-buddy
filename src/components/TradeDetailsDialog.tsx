import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TrendingUp, TrendingDown, Clock, DollarSign, Target, AlertTriangle, X, Download, Copy, Check, Trash2 } from "lucide-react";
import { getBinanceTimeAgo, formatBinanceDate } from "@/lib/timeUtils";
import { TradeChart } from "./TradeChart";
import { formatTradeForExport } from "@/lib/tradeExportUtils";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

/**
 * Adaptiv pris-formattering: vælg antal decimaler ud fra prisens størrelse,
 * så low-cap coins som PENGU/BONK får meningsfulde decimaler i stedet for "$0.01".
 */
const formatPrice = (price: number | null | undefined): string => {
  if (price == null || !Number.isFinite(Number(price))) return '-';
  const abs = Math.abs(Number(price));
  let digits: number;
  if (abs >= 1000) digits = 2;
  else if (abs >= 100) digits = 3;
  else if (abs >= 1) digits = 4;
  else if (abs >= 0.1) digits = 5;
  else if (abs >= 0.01) digits = 6;
  else if (abs >= 0.001) digits = 7;
  else digits = 8;
  return Number(price).toFixed(digits);
};

interface TradeDetailsDialogProps {
  trade: any;
  isOpen: boolean;
  onClose: () => void;
  onDeleted?: () => void;
}

export const TradeDetailsDialog = ({ trade, isOpen, onClose, onDeleted }: TradeDetailsDialogProps) => {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();
  
  const snapshot = trade.indicators_snapshot ?? {};
  const leverage = trade.leverage_used ?? snapshot.leverage ?? null;
  
  const isProfitable = trade.pnl >= 0;
  const durationMinutes = trade.duration_minutes || 0;
  const hours = Math.floor(durationMinutes / 60);
  const minutes = durationMinutes % 60;

  // Calculate live P&L if position is open
  const isPositionOpen = trade.status === 'OPEN';
  const currentPrice = Number(trade.current_price || trade.exit_price);
  const entryPrice = Number(trade.entry_price);
  const quantity = Number(trade.quantity);
  
  let livePnl = Number.isFinite(Number(trade.unrealized_pnl)) ? Number(trade.unrealized_pnl) : trade.pnl;
  let livePnlPercent = trade.pnl_percent;
  
  if (isPositionOpen && currentPrice) {
    if (!Number.isFinite(Number(trade.unrealized_pnl))) {
      if (trade.side === 'LONG') {
        livePnl = (currentPrice - entryPrice) * quantity;
      } else {
        livePnl = (entryPrice - currentPrice) * quantity;
      }
    }
    livePnlPercent = (livePnl / (entryPrice * quantity)) * 100;
  }
  
  const isLiveProfitable = livePnl >= 0;
  
  const handleExportTrade = async () => {
    try {
      const formatted = formatTradeForExport(trade);
      const jsonStr = JSON.stringify(formatted, null, 2);
      
      await navigator.clipboard.writeText(jsonStr);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      
      toast({
        title: "Kopieret til clipboard",
        description: "Handelsdata klar til AI analyse",
      });
    } catch (err) {
      toast({
        title: "Kunne ikke kopiere",
        description: "Prøv igen",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {trade.side === "LONG" ? (
              <TrendingUp className="h-5 w-5 text-profit" />
            ) : (
              <TrendingDown className="h-5 w-5 text-loss" />
            )}
            <span>{trade.symbol}</span>
            <Badge variant={trade.side === "LONG" ? "default" : "secondary"}>
              {trade.side}
            </Badge>
            {isPositionOpen ? (
              <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">
                LIVE
              </Badge>
            ) : (
              <div className="flex items-center justify-center h-6 w-6 rounded-full bg-loss/20 border border-loss/40">
                <X className="h-3.5 w-3.5 text-loss" />
              </div>
            )}
          </DialogTitle>
        </DialogHeader>

        {/* Action buttons */}
        <div className="flex justify-between -mt-2 mb-2">
          <Button
            variant="destructive"
            size="sm"
            onClick={async () => {
              if (!confirm("Er du sikker på at du vil slette denne handel? Det kan ikke fortrydes.")) return;
              const { error } = await supabase.from("trade_history").delete().eq("id", trade.id);
              if (error) {
                toast({ title: "Fejl", description: error.message, variant: "destructive" });
              } else {
                toast({ title: "Slettet", description: `${trade.symbol} handel fjernet fra historik` });
                onDeleted?.();
                onClose();
              }
            }}
            className="flex items-center gap-2"
          >
            <Trash2 className="h-4 w-4" />
            Slet handel
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportTrade}
            className="flex items-center gap-2"
          >
            {copied ? <Check className="h-4 w-4 text-profit" /> : <Copy className="h-4 w-4" />}
            {copied ? "Kopieret" : "Eksporter til AI"}
          </Button>
        </div>

        <div className="space-y-6">
          {/* Live Status - Only show for open positions */}
          {isPositionOpen && (
            <div className="border-2 border-primary/30 rounded-lg p-4 bg-primary/5">
              <div className="text-sm font-semibold text-primary mb-3">📊 Live Position Status</div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Entry → Current</div>
                  <div className="font-mono text-lg font-bold">
                    ${entryPrice.toFixed(2)} → ${currentPrice.toFixed(4)}
                  </div>
                  <div className={`text-sm ${isLiveProfitable ? 'text-profit' : 'text-loss'}`}>
                    {trade.side === 'LONG' ? 
                      (currentPrice > entryPrice ? '↑' : '↓') : 
                      (currentPrice < entryPrice ? '↑' : '↓')
                    } ${Math.abs(currentPrice - entryPrice).toFixed(4)}
                  </div>
                </div>
                
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Live P&L</div>
                  <div className={`text-2xl font-bold ${isLiveProfitable ? "text-profit" : "text-loss"}`}>
                    {isLiveProfitable ? "+" : ""}{livePnl.toFixed(2)}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {livePnlPercent >= 0 ? "+" : ""}{livePnlPercent.toFixed(2)}%
                  </div>
                </div>

                <div>
                  <div className="text-xs text-muted-foreground mb-1">Varighed</div>
                  <div className="text-lg font-semibold">
                    {hours > 0 ? `${hours}t ` : ""}{minutes}m
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {getBinanceTimeAgo(trade.opened_at)}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Closed Status Banner - For closed positions */}
          {!isPositionOpen && (
            <div className="flex items-center gap-3 border border-loss/30 rounded-lg p-4 bg-loss/10">
              <div className="flex items-center justify-center h-10 w-10 rounded-full bg-loss/20 border border-loss/40">
                <X className="h-5 w-5 text-loss" />
              </div>
              <div>
                <div className="text-sm font-semibold text-loss">Lukket Position</div>
                <div className="text-xs text-muted-foreground">
                  {trade.close_reason === 'STOP_LOSS_HIT' && 'Stop Loss ramt'}
                  {trade.close_reason === 'TRAILING_STOP_HIT' && 'Trailing Stop ramt'}
                  {trade.close_reason === 'TAKE_PROFIT_HIT' && 'Take Profit ramt'}
                  {trade.close_reason === 'TIMEOUT' && 'Timeout'}
                  {trade.close_reason === 'MANUAL' && 'Manuel lukning'}
                  {!['STOP_LOSS_HIT', 'TRAILING_STOP_HIT', 'TAKE_PROFIT_HIT', 'TIMEOUT', 'MANUAL'].includes(trade.close_reason || '') && (trade.close_reason || 'Lukket')}
                </div>
              </div>
            </div>
          )}

          {/* P&L Overview - For closed positions */}
          {!isPositionOpen && (
            <div className="grid grid-cols-3 gap-4">
              <div className="border rounded-lg p-4">
                <div className="text-sm text-muted-foreground mb-1">Gross P&L</div>
                <div className={`text-2xl font-bold ${isProfitable ? "text-profit" : "text-loss"}`}>
                  {isProfitable ? "+" : ""}{trade.pnl.toFixed(2)} USDT
                </div>
                <div className="text-sm text-muted-foreground">
                  {trade.pnl_percent >= 0 ? "+" : ""}{trade.pnl_percent.toFixed(2)}%
                </div>
              </div>

              <div className="border rounded-lg p-4 border-primary/30 bg-primary/5">
                <div className="text-sm text-muted-foreground mb-1">
                  Net P&L (Binance)
                  {trade.fees_pending && <span className="text-xs text-yellow-500 ml-1">(afventer fees)</span>}
                </div>
                {(() => {
                  const feesPending = trade.fees_pending && (trade.net_pnl === 0 || trade.net_pnl == null);
                  const netPnl = feesPending ? trade.pnl : (trade.net_pnl ?? trade.pnl);
                  const isNetProfit = netPnl >= 0;
                  return (
                    <>
                      <div className={`text-2xl font-bold ${isNetProfit ? "text-profit" : "text-loss"}`}>
                        {isNetProfit ? "+" : ""}{netPnl.toFixed(2)} USDT
                        {feesPending && <span className="text-sm font-normal text-yellow-500"> ~</span>}
                      </div>
                      <div className="text-xs text-muted-foreground space-y-0.5">
                        {trade.total_fee != null && !feesPending && <div>Commission: -{Math.abs(trade.total_fee).toFixed(4)}</div>}
                        {trade.funding_fee != null && !feesPending && <div>Funding: {trade.funding_fee >= 0 ? "+" : ""}{trade.funding_fee.toFixed(4)}</div>}
                        {feesPending && <div className="text-yellow-500">Viser gross – fees hentes snart</div>}
                      </div>
                    </>
                  );
                })()}
              </div>

              <div className="border rounded-lg p-4">
                <div className="text-sm text-muted-foreground mb-1 flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Varighed
                </div>
                <div className="text-2xl font-bold">
                  {hours > 0 ? `${hours}t ` : ""}{minutes}m
                </div>
                <div className="text-sm text-muted-foreground">
                  {getBinanceTimeAgo(trade.closed_at)}
                </div>
              </div>
            </div>
          )}

          {/* Trade Details */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="border rounded-lg p-3">
              <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                <DollarSign className="h-3 w-3" />
                Entry Price
              </div>
              <div className="font-mono font-semibold">${trade.entry_price}</div>
            </div>

            {/* Exit Price - only show for closed positions */}
            {!isPositionOpen && trade.exit_price && (
              <div className="border rounded-lg p-3">
                <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                  <Target className="h-3 w-3" />
                  Exit Price
                </div>
                <div className="font-mono font-semibold">${trade.exit_price}</div>
              </div>
            )}

            <div className="border rounded-lg p-3">
              <div className="text-xs text-muted-foreground mb-1">Quantity</div>
              <div className="font-mono font-semibold">{trade.quantity}</div>
            </div>

            <div className="border rounded-lg p-3">
              <div className="text-xs text-muted-foreground mb-1">Position Size</div>
              <div className="font-mono font-semibold">
                ${(trade.entry_price * trade.quantity).toFixed(2)}
              </div>
            </div>

            {(trade.stop_loss || trade.indicators_snapshot?.stop_loss) && (
              <div className="border rounded-lg p-3">
                <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  Stop Loss {trade.break_even_activated && "(Break-Even)"}
                </div>
                <div className="font-mono font-semibold text-loss">
                  ${(trade.stop_loss || trade.indicators_snapshot?.stop_loss)}
                </div>
              </div>
            )}

            {/* Break-Even Level - vis når BE er aktiveret */}
            {trade.break_even_activated && (() => {
              const tsVal = Number(trade.trailing_stop || trade.indicators_snapshot?.trailing_stop);
              const epVal = Number(trade.entry_price);
              const trailingHasOvertaken = !isNaN(tsVal) && tsVal > 0 && (
                trade.side === 'LONG' ? tsVal >= epVal : tsVal <= epVal
              );
              return (
                <div className={`border rounded-lg p-3 ${trailingHasOvertaken ? 'border-muted/50 bg-muted/5 opacity-60' : 'border-blue-500/50 bg-blue-500/5'}`}>
                  <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                    🛡️ Break-Even Niveau
                    {trailingHasOvertaken ? (
                      <Badge variant="outline" className="ml-1 text-xs bg-muted/20 text-muted-foreground border-muted/40">
                        OVERTAGET
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="ml-1 text-xs bg-blue-500/20 text-blue-400 border-blue-500/40">
                        AKTIV
                      </Badge>
                    )}
                  </div>
                  <div className={`font-mono font-semibold ${trailingHasOvertaken ? 'text-muted-foreground' : 'text-blue-400'}`}>
                    ${Number(trade.indicators_snapshot?.break_even_at_price ?? trade.stop_loss ?? trade.entry_price).toFixed(4)}
                  </div>
                </div>
              );
            })()}

            {/* Trailing Stop - use position data for live, snapshot for closed */}
            {(trade.trailing_stop || trade.indicators_snapshot?.trailing_stop) && (() => {
              const trailingStopValue = Number(trade.trailing_stop || trade.indicators_snapshot?.trailing_stop);
              const entryPriceVal = Number(trade.entry_price);
              // Trailing is active when stop is in profit zone (above entry for LONG, below for SHORT)
              const trailingIsActive = trade.side === 'LONG' 
                ? trailingStopValue >= entryPriceVal 
                : trailingStopValue <= entryPriceVal;
              
              // Calculate distance from peak
              const peakPrice = Number(trade.peak_price || trade.indicators_snapshot?.peak_price);
              const distanceFromPeak = peakPrice > 0 
                ? Math.abs(peakPrice - trailingStopValue) / peakPrice * 100 
                : null;
              
              return (
                <div className={`border rounded-lg p-3 ${trailingIsActive ? 'border-profit/50 bg-profit/5' : 'border-warning/50 bg-warning/5'}`}>
                  <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                    🎯 Trailing Stop
                    {trailingIsActive && (
                      <Badge variant="outline" className="ml-1 text-xs bg-profit/20 text-profit border-profit/40">
                        AKTIV
                      </Badge>
                    )}
                  </div>
                  <div className={`font-mono font-semibold ${trailingIsActive ? 'text-profit' : 'text-warning'}`}>
                    ${trailingStopValue.toFixed(2)}
                  </div>
                  {distanceFromPeak !== null && (
                    <div className="text-xs text-muted-foreground">
                      {distanceFromPeak.toFixed(2)}% fra peak
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Peak-Lock Status */}
            {(trade.indicators_snapshot?.peak_lock_enabled || trade.indicators_snapshot?.peak_lock_activated) && (
              <div className="border rounded-lg p-3 border-cyan-500/50 bg-cyan-500/5">
                <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                  🔒 Peak-Lock Trailing
                  {trade.indicators_snapshot?.peak_lock_activated && (
                    <Badge variant="outline" className="ml-1 text-xs bg-cyan-500/20 text-cyan-400 border-cyan-500/40">
                      AKTIV
                    </Badge>
                  )}
                </div>
                <div className="space-y-1">
                  {trade.indicators_snapshot?.peak_lock_stop_price && (
                    <div className="font-mono font-semibold text-cyan-400">
                      Stop: ${Number(trade.indicators_snapshot.peak_lock_stop_price).toFixed(4)}
                    </div>
                  )}
                  <div className="text-xs text-muted-foreground grid grid-cols-2 gap-1">
                    <span>Aktivering: {trade.indicators_snapshot?.peak_lock_activate_profit_pct ?? 0.6}%</span>
                    <span>Distance: {trade.indicators_snapshot?.peak_lock_distance_pct ?? 0.35}%</span>
                    <span>Min floor: {trade.indicators_snapshot?.peak_lock_min_profit_floor_pct ?? 0.15}%</span>
                    <span>Ratchet: {trade.indicators_snapshot?.peak_lock_ratchet_only ? 'Ja' : 'Nej'}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Peak Price - use position data for live */}
            {(trade.peak_price || trade.indicators_snapshot?.peak_price) && (
              <div className="border rounded-lg p-3">
                <div className="text-xs text-muted-foreground mb-1">
                  📈 Peak Price {trade.side === 'SHORT' ? '(Lowest)' : '(Highest)'}
                </div>
                <div className="font-mono font-semibold">
                  ${Number(trade.peak_price || trade.indicators_snapshot?.peak_price).toFixed(2)}
                </div>
              </div>
            )}
          </div>

          {/* Open & Close Reasons */}
          {(trade.open_reason || trade.close_reason) && (
            <div className="space-y-3">
              {trade.open_reason && (
                <div className="border rounded-lg p-3 bg-primary/5">
                  <div className="text-xs font-semibold text-primary mb-1 flex items-center gap-1">
                    <TrendingUp className="h-3 w-3" />
                    Hvorfor åbnet
                  </div>
                  <div className="text-sm">{trade.open_reason}</div>
                </div>
              )}
              
              {trade.close_reason && (
                <div className="border rounded-lg p-3 bg-muted/50">
                  <div className="text-xs font-semibold mb-1 flex items-center gap-1">
                    <Target className="h-3 w-3" />
                    Hvorfor lukket
                  </div>
                  <div className="text-sm">
                    {trade.close_reason === 'STOP_LOSS_HIT' && 'Stop Loss ramt'}
                    {trade.close_reason === 'TAKE_PROFIT_HIT' && 'Take Profit ramt'}
                    {trade.close_reason === 'TRAILING_STOP_HIT' && 'Trailing Stop ramt'}
                    {trade.close_reason === 'TIMEOUT' && 'Timeout - max varighed nået'}
                    {trade.close_reason === 'MANUAL' && 'Manuel lukning'}
                    {trade.close_reason === 'SYSTEM_CLOSE' && 'Automatisk lukket af systemet'}
                    {trade.close_reason === 'EXTERNAL_CLOSE' && 'Automatisk lukket (system eller eksternt)'}
                    {trade.close_reason === 'DUPLICATE' && 'Duplikat position fjernet'}
                    {!['STOP_LOSS_HIT', 'TAKE_PROFIT_HIT', 'TRAILING_STOP_HIT', 'TIMEOUT', 'MANUAL', 'SYSTEM_CLOSE', 'EXTERNAL_CLOSE', 'DUPLICATE'].includes(trade.close_reason) && trade.close_reason}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Timestamps */}
          <div className="grid grid-cols-2 gap-3">
            <div className="border rounded-lg p-3">
              <div className="text-xs text-muted-foreground mb-1">Åbnet</div>
              <div className="text-sm font-medium">
                {formatBinanceDate(trade.opened_at, { includeTime: true })}
              </div>
            </div>

            {trade.status === 'CLOSED' && trade.closed_at && (
              <div className="border rounded-lg p-3">
                <div className="text-xs text-muted-foreground mb-1">Lukket</div>
                <div className="text-sm font-medium">
                  {formatBinanceDate(trade.closed_at, { includeTime: true })}
                </div>
              </div>
            )}
          </div>

          {/* Chart */}
          <div className="border rounded-lg p-4">
            <h3 className="text-sm font-semibold mb-3">Price Chart med Entry/Exit</h3>
            <TradeChart trade={trade} />
          </div>

          {/* Indicators Snapshot */}
          {trade.indicators_snapshot && (
            <div className="border rounded-lg p-4">
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-1">
                <AlertTriangle className="h-4 w-4" />
                Alle Indikator Værdier
              </h3>
              <div className="space-y-4">
                {/* EMA Section */}
                {(trade.indicators_snapshot.ema_fast || trade.indicators_snapshot.ema_medium || trade.indicators_snapshot.ema_slow) && (
                  <div>
                    <div className="text-xs font-semibold mb-2 text-primary">EMA (Exponential Moving Average)</div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                      {trade.indicators_snapshot.ema_fast && (
                        <div className="flex justify-between border rounded p-2">
                          <span className="text-muted-foreground">Fast (9):</span>
                          <span className="font-mono">{Number(trade.indicators_snapshot.ema_fast).toFixed(2)}</span>
                        </div>
                      )}
                      {trade.indicators_snapshot.ema_medium && (
                        <div className="flex justify-between border rounded p-2">
                          <span className="text-muted-foreground">Medium (21):</span>
                          <span className="font-mono">{Number(trade.indicators_snapshot.ema_medium).toFixed(2)}</span>
                        </div>
                      )}
                      {trade.indicators_snapshot.ema_slow && (
                        <div className="flex justify-between border rounded p-2">
                          <span className="text-muted-foreground">Slow (50):</span>
                          <span className="font-mono">{Number(trade.indicators_snapshot.ema_slow).toFixed(2)}</span>
                        </div>
                      )}
                      {trade.indicators_snapshot.ema_medium_trend && (
                        <div className="flex justify-between border rounded p-2">
                          <span className="text-muted-foreground">Trend (50):</span>
                          <span className="font-mono">{Number(trade.indicators_snapshot.ema_medium_trend).toFixed(2)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* RSI Section */}
                {trade.indicators_snapshot.rsi !== undefined && (
                  <div>
                    <div className="text-xs font-semibold mb-2 text-primary">RSI (Relative Strength Index)</div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                      <div className="flex justify-between border rounded p-2">
                        <span className="text-muted-foreground">Period:</span>
                        <span className="font-mono">14</span>
                      </div>
                      <div className="flex justify-between border rounded p-2">
                        <span className="text-muted-foreground">Værdi:</span>
                        <span className="font-mono font-semibold">{Number(trade.indicators_snapshot.rsi).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between border rounded p-2">
                        <span className="text-muted-foreground">Min LONG:</span>
                        <span className="font-mono">20</span>
                      </div>
                      <div className="flex justify-between border rounded p-2">
                        <span className="text-muted-foreground">Max SHORT:</span>
                        <span className="font-mono">80</span>
                      </div>
                      <div className="flex justify-between border rounded p-2">
                        <span className="text-muted-foreground">Overbought:</span>
                        <span className="font-mono">80</span>
                      </div>
                      <div className="flex justify-between border rounded p-2">
                        <span className="text-muted-foreground">Oversold:</span>
                        <span className="font-mono">30</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* MACD Section */}
                {(trade.indicators_snapshot.macd !== undefined || trade.indicators_snapshot.macdLine !== undefined) && (
                  <div>
                    <div className="text-xs font-semibold mb-2 text-primary">MACD (Moving Average Convergence Divergence)</div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                      <div className="flex justify-between border rounded p-2">
                        <span className="text-muted-foreground">Fast:</span>
                        <span className="font-mono">12</span>
                      </div>
                      <div className="flex justify-between border rounded p-2">
                        <span className="text-muted-foreground">Slow:</span>
                        <span className="font-mono">26</span>
                      </div>
                      <div className="flex justify-between border rounded p-2">
                        <span className="text-muted-foreground">Signal:</span>
                        <span className="font-mono">9</span>
                      </div>
                      {trade.indicators_snapshot.macdLine !== undefined && (
                        <div className="flex justify-between border rounded p-2 bg-primary/10">
                          <span className="text-muted-foreground">🔴 MACD Line:</span>
                          <span className={`font-mono font-semibold ${trade.indicators_snapshot.macdLine > 0 ? 'text-success' : 'text-destructive'}`}>
                            {Number(trade.indicators_snapshot.macdLine).toFixed(6)}
                          </span>
                        </div>
                      )}
                      {trade.indicators_snapshot.macd !== undefined && (
                        <div className="flex justify-between border rounded p-2">
                          <span className="text-muted-foreground">Histogram:</span>
                          <span className="font-mono">{Number(trade.indicators_snapshot.macd).toFixed(6)}</span>
                        </div>
                      )}
                      <div className="flex justify-between border rounded p-2">
                        <span className="text-muted-foreground">Threshold:</span>
                        <span className="font-mono">0.0</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* ATR Section */}
                {trade.indicators_snapshot.atr !== undefined && (
                  <div>
                    <div className="text-xs font-semibold mb-2 text-primary">ATR (Average True Range)</div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                      <div className="flex justify-between border rounded p-2">
                        <span className="text-muted-foreground">Period:</span>
                        <span className="font-mono">{trade.indicators_snapshot.atr_period ?? 14}</span>
                      </div>
                      <div className="flex justify-between border rounded p-2">
                        <span className="text-muted-foreground">ATR%:</span>
                        <span className="font-mono font-semibold text-primary">
                          {trade.indicators_snapshot.atr_percent != null 
                            ? `${Number(trade.indicators_snapshot.atr_percent).toFixed(4)}%`
                            : trade.indicators_snapshot.price 
                              ? `${((Number(trade.indicators_snapshot.atr) / Number(trade.indicators_snapshot.price)) * 100).toFixed(4)}%`
                              : 'N/A'}
                        </span>
                      </div>
                      <div className="flex justify-between border rounded p-2">
                        <span className="text-muted-foreground">Raw ATR:</span>
                        <span className="font-mono text-muted-foreground">{Number(trade.indicators_snapshot.atr).toFixed(8)}</span>
                      </div>
                      <div className="flex justify-between border rounded p-2">
                        <span className="text-muted-foreground">Floor:</span>
                        <span className="font-mono">
                          {trade.indicators_snapshot.atr_audit?.atr_floor_used != null 
                            ? `${Number(trade.indicators_snapshot.atr_audit.atr_floor_used).toFixed(2)}%`
                            : trade.indicators_snapshot.min_atr_percent != null 
                              ? `${Number(trade.indicators_snapshot.min_atr_percent).toFixed(2)}%`
                              : 'N/A'}
                        </span>
                      </div>
                      <div className="flex justify-between border rounded p-2">
                        <span className="text-muted-foreground">SL Mult:</span>
                        <span className="font-mono">{trade.indicators_snapshot.atr_stop_loss_multiplier ?? 2.0}x</span>
                      </div>
                      <div className="flex justify-between border rounded p-2">
                        <span className="text-muted-foreground">TS Mult:</span>
                        <span className="font-mono">{trade.indicators_snapshot.atr_trailing_stop_multiplier ?? 1.5}x</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* ADX Section */}
                {trade.indicators_snapshot.adx !== undefined && (
                  <div>
                    <div className="text-xs font-semibold mb-2 text-primary">ADX (Average Directional Index)</div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                      <div className="flex justify-between border rounded p-2">
                        <span className="text-muted-foreground">Period:</span>
                        <span className="font-mono">14</span>
                      </div>
                      <div className="flex justify-between border rounded p-2">
                        <span className="text-muted-foreground">Værdi:</span>
                        <span className="font-mono font-semibold">{Number(trade.indicators_snapshot.adx).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between border rounded p-2">
                        <span className="text-muted-foreground">Threshold:</span>
                        <span className="font-mono">40</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Volume Section */}
                {trade.indicators_snapshot.volume !== undefined && (
                  <div>
                    <div className="text-xs font-semibold mb-2 text-primary">Volume</div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                      <div className="flex justify-between border rounded p-2">
                        <span className="text-muted-foreground">Avg Period:</span>
                        <span className="font-mono">20</span>
                      </div>
                      <div className="flex justify-between border rounded p-2">
                        <span className="text-muted-foreground">Værdi:</span>
                        <span className="font-mono font-semibold">{Number(trade.indicators_snapshot.volume).toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Timeframes & Risk Section */}
                <div>
                  <div className="text-xs font-semibold mb-2 text-primary">Timeframes & Risk Management</div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                    <div className="flex justify-between border rounded p-2">
                      <span className="text-muted-foreground">Scan Interval:</span>
                      <span className="font-mono">1m</span>
                    </div>
                    <div className="flex justify-between border rounded p-2">
                      <span className="text-muted-foreground">Trend TF:</span>
                      <span className="font-mono">5m</span>
                    </div>
                    <div className="flex justify-between border rounded p-2">
                      <span className="text-muted-foreground">Higher TF:</span>
                      <span className="font-mono">15m</span>
                    </div>
                    <div className="flex justify-between border rounded p-2">
                      <span className="text-muted-foreground">Klines:</span>
                      <span className="font-mono">100</span>
                    </div>
                    <div className="flex justify-between border rounded p-2">
                      <span className="text-muted-foreground">Leverage:</span>
                      <span className="font-mono">{leverage != null ? `${Number(leverage)}x` : "-"}</span>
                    </div>
                    <div className="flex justify-between border rounded p-2">
                      <span className="text-muted-foreground">Position Size:</span>
                      <span className="font-mono">20%</span>
                    </div>
                    <div className="flex justify-between border rounded p-2">
                      <span className="text-muted-foreground">Risk/Trade:</span>
                      <span className="font-mono">5%</span>
                    </div>
                    <div className="flex justify-between border rounded p-2">
                      <span className="text-muted-foreground">Max Positions:</span>
                      <span className="font-mono">5</span>
                    </div>
                    <div className="flex justify-between border rounded p-2">
                      <span className="text-muted-foreground">Max Duration:</span>
                      <span className="font-mono">240m</span>
                    </div>
                    <div className="flex justify-between border rounded p-2">
                      <span className="text-muted-foreground">Signal Conditions:</span>
                      <span className="font-mono">3</span>
                    </div>
                  </div>
                </div>

                {/* Other indicators if any */}
                {Object.entries(trade.indicators_snapshot)
                  .filter(([key]) => !['ema_fast', 'ema_medium', 'ema_slow', 'ema_medium_trend', 'rsi', 'macd', 'atr', 'adx', 'volume', 'stochRSI_k'].includes(key))
                  .map(([key, value]) => (
                    <div key={key} className="flex justify-between text-xs border rounded p-2">
                      <span className="text-muted-foreground">{key}:</span>
                      <span className="font-mono">{typeof value === 'number' ? value.toFixed(2) : String(value)}</span>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
