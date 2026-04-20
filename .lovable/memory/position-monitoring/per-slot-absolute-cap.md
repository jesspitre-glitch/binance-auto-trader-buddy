---
name: Per-slot absolute hard cap
description: auto-trade-quant absolut hard cap er per-slot baseret (portfolio × slot% × pos% × leverage × 1.5) i stedet for det gamle 50%×20x portefølje-loft
type: feature
---
Den absolutte hard cap i `auto-trade-quant` er strammet fra `portfolio × 50% × 20x` (~$1470 reelt loft) til:

```
configuredBalance × (capitalPercent / 100) × (position_size_percent / 100) × leverage × 1.5
```

Eksempel for slot med 16% capital, 30% position, 3x leverage på $147 portfolio:
- Slot max notional ≈ $21.17
- Absolut cap ≈ $31.76 (1.5× tolerance for rounding/step)

Den 1.5× tolerance lader proportional fordeling og step-rounding passere uden at blokere lovlige trades. Den gamle løse cap kunne lade en single-symbol position være op til $1470 stor, hvilket gjorde den ubrugelig som sikkerhedsnet.

`SAFETY GUARD BLOCKED` (notional vs slot-cap + epsilon) er det første lag; denne absolut-cap er ekstra forsvarslag mod beregningsfejl.
