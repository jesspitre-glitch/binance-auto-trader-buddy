import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Clock, DollarSign, Target, AlertTriangle } from "lucide-react";
import { getBinanceTimeAgo, formatBinanceDate } from "@/lib/timeUtils";
import { TradeChart } from "./TradeChart";

interface TradeDetailsDialogProps {
  trade: any;
  isOpen: boolean;
  onClose: () => void;
}

export const TradeDetailsDialog = ({ trade, isOpen, onClose }: TradeDetailsDialogProps) => {
  const isProfitable = trade.pnl >= 0;
  const durationMinutes = trade.duration_minutes || 0;
  const hours = Math.floor(durationMinutes / 60);
  const minutes = durationMinutes % 60;

  // Calculate live P&L if position is open
  const isPositionOpen = trade.status === 'OPEN';
  const currentPrice = Number(trade.current_price || trade.exit_price);
  const entryPrice = Number(trade.entry_price);
  const quantity = Number(trade.quantity);
  
  let livePnl = trade.pnl;
  let livePnlPercent = trade.pnl_percent;
  
  if (isPositionOpen && currentPrice) {
    if (trade.side === 'LONG') {
      livePnl = (currentPrice - entryPrice) * quantity;
    } else {
      livePnl = (entryPrice - currentPrice) * quantity;
    }
    livePnlPercent = (livePnl / (entryPrice * quantity)) * 100;
  }
  
  const isLiveProfitable = livePnl >= 0;

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
            {isPositionOpen && (
              <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">
                LIVE
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

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

          {/* P&L Overview - For closed positions */}
          {!isPositionOpen && (
            <div className="grid grid-cols-2 gap-4">
              <div className="border rounded-lg p-4">
                <div className="text-sm text-muted-foreground mb-1">P&L</div>
                <div className={`text-2xl font-bold ${isProfitable ? "text-profit" : "text-loss"}`}>
                  {isProfitable ? "+" : ""}{trade.pnl.toFixed(2)} USDT
                </div>
                <div className="text-sm text-muted-foreground">
                  {trade.pnl_percent >= 0 ? "+" : ""}{trade.pnl_percent.toFixed(2)}%
                </div>
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

            {/* Trailing Stop - use position data for live, snapshot for closed */}
            {(trade.trailing_stop || trade.indicators_snapshot?.trailing_stop) && (
              <div className="border rounded-lg p-3 border-warning/50 bg-warning/5">
                <div className="text-xs text-muted-foreground mb-1">🎯 Trailing Stop</div>
                <div className="font-mono font-semibold text-warning">
                  ${Number(trade.trailing_stop || trade.indicators_snapshot?.trailing_stop).toFixed(2)}
                </div>
                {trade.trailing_stop_percent && (
                  <div className="text-xs text-muted-foreground">
                    {trade.trailing_stop_percent}% fra peak
                  </div>
                )}
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
                        <span className="font-mono">14</span>
                      </div>
                      <div className="flex justify-between border rounded p-2">
                        <span className="text-muted-foreground">Værdi:</span>
                        <span className="font-mono font-semibold">{Number(trade.indicators_snapshot.atr).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between border rounded p-2">
                        <span className="text-muted-foreground">Stop Loss:</span>
                        <span className="font-mono">2.80x ATR</span>
                      </div>
                      <div className="flex justify-between border rounded p-2">
                        <span className="text-muted-foreground">Trailing:</span>
                        <span className="font-mono">2.00x ATR</span>
                      </div>
                      <div className="flex justify-between border rounded p-2">
                        <span className="text-muted-foreground">Break-even:</span>
                        <span className="font-mono">0.8x ATR</span>
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
                      <span className="font-mono">3x</span>
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
