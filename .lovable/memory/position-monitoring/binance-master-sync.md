---
name: Binance Master Sync
description: Binance er eneste sandhed for quantity, entry_price og PnL - ingen manuelle handler
type: preference
---
Alt styres af appen, ingen manuelle handler på Binance.
Binance er master for **pris**, men **slot ejer sin egen quantity og entry_price**.
- `sync-binance-futures-positions` syncer KUN `current_price` og beregner `unrealized_pnl` fra slottets egne qty/entry
- quantity og entry_price RØRES ALDRIG ved sync af eksisterende positioner (Binance positionAmt er aggregeret på tværs af alle slots)
- Ved nye positioner (ikke i DB) bruges slot-cap guard til at begrænse quantity
- `monitor-positions` har IKKE notional-size guard (SLOT_UI_MISMATCH for notional fjernet)
- UI PnL bruger DB-synced PnL som base, justeret med live WS pris-delta
