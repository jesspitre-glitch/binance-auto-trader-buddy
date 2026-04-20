---
name: Slot-cap downscale guard in sync
description: sync-binance-futures-positions capper hver row mod calculateMaxExpectedSlotQuantity × 1.10 og tillader ikke længere "single-row får alt" bypass — orphan-qty på Binance ignoreres bevidst
type: feature
---
`distributeBinanceQuantityAcrossRows` accepterer nu et 3. parameter `slotCaps[]` og nedskalerer enhver row hvis dens proportionale andel overskrider slot-cap × `SLOT_QUANTITY_TOLERANCE_MULTIPLIER` (1.10).

Sync henter alle aktive `strategy_slots` + deres `indicator_config` (position_size_percent, leverage) ved sync-start og bygger en cap pr. row baseret på `entryPrice` fra Binance.

Den gamle `if (existingRows.length === 1) return [totalBinanceQty]` linje er fjernet — også enlige rows valideres nu mod slot-cap. Fix afslørede problemet hvor S5 fik 4.806 LTC tildelt fordi den var eneste DB-row på det tidspunkt sync mødte symbolet, mens den lovlige slot-andel kun var 0.384.

**Konsekvens:** Hvis Binance har mere qty på et symbol end summen af alle slot-caps, ignoreres "orphan"-mængden bevidst. DB skal aldrig vise mere end slot lovligt må eje.
