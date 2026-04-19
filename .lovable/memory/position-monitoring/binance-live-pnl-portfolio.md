---
name: Binance Live PnL i Portfolio
description: Portfolio Balance kort viser Binance's totalUnrealizedProfit direkte (1:1 match), synced hvert 5. sek via continuous-sync-binance
type: feature
---
`user_portfolio` har 3 live Binance-felter: `binance_unrealized_pnl`, `binance_total_margin_balance`, `binance_synced_at`.

`sync-binance-futures-positions` opdaterer dem hvert 5. sek (kaldt af `continuous-sync-binance`). `futures_capital` røres ALDRIG af sync — den er user-defined sizing baseline.

UI (`PortfolioBalance.tsx`) viser `binance_unrealized_pnl` som primær "Unrealized P&L (Binance LIVE)" metric med LIVE-badge. Realized P&L fra trade_history vises separat.

**Why:** Binance's `totalUnrealizedProfit` er aggregeret på tværs af alle slots — kan ikke deles pr. slot, men matcher Binance UI 1:1 på portfolio-niveau.
**How to apply:** Brug `binance_unrealized_pnl` som ground truth for total urealiseret PnL i UI. Per-slot PnL beregnes stadig lokalt fra slot-qty (se binance-master-sync).
