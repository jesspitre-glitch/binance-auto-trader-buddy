---
name: Sync helper functions must be defined locally
description: sync-binance-futures-positions må aldrig referere helpers (calculateMaxExpectedSlotQuantity, SLOT_QUANTITY_TOLERANCE_MULTIPLIER) uden lokal definition — manglende definition crashede sync med 500 og blokerede ALLE nye trades via reconciliation guard
type: constraint
---
Edge functions deler ikke modul-scope. Hver funktion skal definere sine egne helpers og konstanter (eller importere dem eksplicit).

`sync-binance-futures-positions` brugte `calculateMaxExpectedSlotQuantity` og `SLOT_QUANTITY_TOLERANCE_MULTIPLIER` uden at definere dem. Resultat: 500-fejl hver gang sync mødte en ny Binance-position, så DB faldt ud af sync med Binance.

Konsekvens: `auto-trade-quant`s reconciliation guard så `Binance qty > DB qty 0` for hvert symbol og blokerede ALLE nye trades med `🚫 RECONCILIATION BLOCK` i 13+ timer.

**Why:** Reconciliation guard og sync-importer er afhængige af hinanden. Hvis sync crasher, blokerer guard al ny trading.
**How to apply:** Når der refereres til en helper i en edge function, sikr at den er defineret i samme `index.ts` (edge functions må ikke importere fra `src/`).
