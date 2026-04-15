---
name: Absolute notional hard cap
description: Ufravigelig portfolio-baseret max notional guard i både sync og auto-trade — forhindrer oversized positioner uanset slot-data
type: feature
---
Begge entry-paths (sync-binance-futures-positions og auto-trade-quant) har en absolut hard cap:
- Max notional = portfolio × 50% × 20x leverage
- Kører ALTID, selv når slot config data mangler
- I sync: hvis portfolio capital er 0/missing, SKIPPES positionen helt
- Løser problemet hvor Binances aggregerede positionAmt (alle slots) blev brugt som slot-quantity
- Den slot-specifikke guard (calculateMaxExpectedSlotQuantity) kører først som præcis cap
- Den absolutte cap er sikkerhedsnettet der aldrig kan bypasses
