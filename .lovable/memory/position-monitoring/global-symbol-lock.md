---
name: Cross-slot symbol parallelism (NO global lock)
description: Multiple slots ARE allowed to open the same symbol in parallel — this is intentional for strategy comparison. Only per-slot duplicate prevention is enforced.
type: constraint
---
**DO NOT re-introduce a global cross-slot symbol lock.** The user explicitly wants multiple slots to be able to take the same signal in parallel so different strategies can be compared on identical market conditions.

What IS enforced (per-slot only):
- Unique partial DB index `(user_id, slot_id, symbol) WHERE status IN ('OPEN','PENDING')` — physically prevents the SAME slot from opening duplicate positions on the same symbol.
- Pre-trade check in `auto-trade-quant` filters by `slot_id` (not just symbol).

What is NOT enforced (by design):
- Slot 1 and Slot 2 can both hold an OPEN BTCUSDT position simultaneously.
- Binance aggregates these into one combined position on their side (one-way mode), but the DB tracks them as separate rows per slot for performance attribution.

Sync handling: `sync-binance-futures-positions` correctly handles N DB rows per symbol via `matchingPositions` array and uses `totalDbQty` (sum of all slot rows) vs Binance `absQuantity` for drift detection — so parallel slots on the same symbol do NOT trigger false drift alerts.

**Why:** The whole point of multi-slot is A/B testing different strategies on the same market. Blocking parallel entries defeats this goal.
