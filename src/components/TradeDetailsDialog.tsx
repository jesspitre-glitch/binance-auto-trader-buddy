import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Clock, DollarSign, Target, AlertTriangle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { da } from "date-fns/locale";
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
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* P&L Overview */}
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
                {formatDistanceToNow(new Date(trade.closed_at), { 
                  addSuffix: true,
                  locale: da 
                })}
              </div>
            </div>
          </div>

          {/* Trade Details */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="border rounded-lg p-3">
              <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                <DollarSign className="h-3 w-3" />
                Entry Price
              </div>
              <div className="font-mono font-semibold">${trade.entry_price}</div>
            </div>

            <div className="border rounded-lg p-3">
              <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                <Target className="h-3 w-3" />
                Exit Price
              </div>
              <div className="font-mono font-semibold">${trade.exit_price}</div>
            </div>

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
          </div>

          {/* Timestamps */}
          <div className="grid grid-cols-2 gap-3">
            <div className="border rounded-lg p-3">
              <div className="text-xs text-muted-foreground mb-1">Åbnet</div>
              <div className="text-sm font-medium">
                {new Date(trade.opened_at).toLocaleString("da-DK")}
              </div>
            </div>

            <div className="border rounded-lg p-3">
              <div className="text-xs text-muted-foreground mb-1">Lukket</div>
              <div className="text-sm font-medium">
                {new Date(trade.closed_at).toLocaleString("da-DK")}
              </div>
            </div>
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
                Indikator Snapshot
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                {Object.entries(trade.indicators_snapshot).map(([key, value]) => (
                  <div key={key} className="flex justify-between">
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
