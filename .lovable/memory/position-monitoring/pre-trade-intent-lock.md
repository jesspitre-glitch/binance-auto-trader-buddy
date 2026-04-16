---
name: Pre-trade intent lock with DB unique constraint
description: PENDING intent row inserted before Binance order + unique partial index prevents duplicate/oversized positions permanently
type: feature
---
Two-layer protection against duplicate and oversized positions:

1. **Database Unique Partial Index**: `idx_unique_open_position_per_slot_symbol` on `(user_id, slot_id, symbol)` WHERE `status IN ('OPEN', 'PENDING')`. This makes it physically impossible at the DB level for two concurrent scans to open the same symbol in the same slot.

2. **Pre-Trade PENDING Intent**: Before placing a Binance order, a PENDING row is inserted into `positions`. If the unique constraint rejects it, the trade is skipped. After the Binance order succeeds, the PENDING row is promoted to OPEN. If the order fails, the PENDING row is deleted.

3. **Stale Cleanup**: At the start of each scan, PENDING positions older than 60s are deleted (crashed runs).

4. **Position Count**: The position count query uses `IN ('OPEN', 'PENDING')` to count both states toward `max_open_positions`.
