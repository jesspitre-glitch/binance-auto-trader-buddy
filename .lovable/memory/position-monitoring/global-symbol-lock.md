---
name: Global cross-slot symbol lock
description: Prevents multiple slots from opening the same Binance symbol simultaneously — only one slot can hold a given symbol at a time
type: feature
---
Before the PENDING intent lock in `auto-trade-quant`, a cross-slot check queries ALL positions (OPEN + PENDING) for the symbol across ALL slots. If any other slot already holds the symbol, the trade is rejected.

This prevents the scenario where two slots both detect the same signal and both place BUY orders, creating an oversized aggregate position on Binance.

Additionally, `sync-binance-futures-positions` includes drift detection: if Binance qty > sum of all DB rows for a symbol, the excess is imported as a new position row in the original slot with a 3% fallback SL.
