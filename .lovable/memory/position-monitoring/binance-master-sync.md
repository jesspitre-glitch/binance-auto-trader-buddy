---
name: Binance Master Sync
description: Binance er eneste sandhed for quantity, entry_price og PnL - ingen manuelle handler
type: preference
---
Alt styres af appen, ingen manuelle handler på Binance. Derfor:
- `sync-binance-futures-positions` overskriver `quantity`, `entry_price` og `unrealized_pnl` direkte fra Binance
- Ved flere slots med samme symbol fordeles proportionelt baseret på eksisterende DB-quantity
- `monitor-positions` har IKKE notional-size guard (SLOT_UI_MISMATCH for notional fjernet)
- UI PnL bruger DB-synced PnL som base, justeret med live WS pris-delta
