

# Implementeringsplan: Higher Timeframe Side-Gate (Regime Control)

## Version 2.2.5 - Final med Signal-Audit og Tie-Breaker

---

## Oversigt

Denne plan implementerer et **Side-Gate** system i `supabase/functions/auto-trade-quant/index.ts` hvor Higher Timeframe (HTF) trend bestemmer hvilke retninger (LONG/SHORT) der må evalueres **før** signal-analyse starter.

---

## Hovedkrav

| # | Krav | Beskrivelse |
|---|------|-------------|
| 1 | Side-gate FØR analyse | HTF beregnes først, bestemmer `allowedSides` |
| 2 | Gated sider = null | Ingen evaluering, ingen logs, ingen push til arrays |
| 3 | Side-specifik hard filters | LONG og SHORT har separate filter-resultater |
| 4 | Side-specifik signal beslutning | Hver side bruger egne counts og hardPass |
| 5 | EMA er quality-only | Ikke retningsvalg, kun kvalitetstjek |
| 6 | Post-HTF kun audit | Ingen blocking efter analyzeSignal |
| 7 | Komplet audit logging | side_gate sektion i indicators_snapshot |

---

## Nye Punkter i denne Version

### 1. Signal-Booleans Gemmes i Snapshot (Audit)

`longSignal` og `shortSignal` gemmes eksplicit i `indicators_snapshot.signal_decision`:

```text
signal_decision: {
  longSignal: boolean,           // true/false (aldrig null)
  shortSignal: boolean,          // true/false (aldrig null)
  longConditionsMet: number,
  shortConditionsMet: number,
  requiredConditions: number,
  finalSignal: 'LONG' | 'SHORT' | 'NONE',
  tieBreaker: string | null,     // LONG_MORE_CONDITIONS | SHORT_MORE_CONDITIONS | TIE_NO_SIGNAL | null
}
```

**Formål:** Verificere i data at gated side altid ender som `false` og aldrig `true` ved fejl.

---

### 2. Deterministisk Tie-Breaker

Når begge signaler er `true`:

```typescript
let signal: 'LONG' | 'SHORT' | 'NONE' = 'NONE';
let tieBreakerUsed: string | null = null;

if (longSignal && shortSignal) {
  if (longConditionsMet > shortConditionsMet) {
    signal = 'LONG';
    tieBreakerUsed = 'LONG_MORE_CONDITIONS';
  } else if (shortConditionsMet > longConditionsMet) {
    signal = 'SHORT';
    tieBreakerUsed = 'SHORT_MORE_CONDITIONS';
  } else {
    signal = 'NONE';
    tieBreakerUsed = 'TIE_NO_SIGNAL';
  }
} else if (longSignal) {
  signal = 'LONG';
} else if (shortSignal) {
  signal = 'SHORT';
}
```

**Regel:** Vælg den side med flest soft conditions met. Ved tie, ingen trade.

---

### 3. Tie-Breaker Logges og Gemmes

`tieBreakerUsed` gemmes i snapshot:
- `LONG_MORE_CONDITIONS` - LONG valgt pga. flere conditions
- `SHORT_MORE_CONDITIONS` - SHORT valgt pga. flere conditions
- `TIE_NO_SIGNAL` - Tie → ingen trade
- `null` - Kun én side var true (normal case)

---

### 4. Gated Side Signal = `false` (Ikke `null`)

```typescript
const longSignal = longAllowed && 
                   longConditionsMet >= requiredConditions && 
                   filterStatus.long.allPassed === true;
// Hvis longAllowed=false → longSignal=false (short-circuit)

const shortSignal = shortAllowed && 
                    shortConditionsMet >= requiredConditions && 
                    filterStatus.short.allPassed === true;
// Hvis shortAllowed=false → shortSignal=false (short-circuit)
```

**Begrundelse:** `null` bruges til indikator-/audit-felter ("ikke evalueret"), men trade-beslutning skal være entydigt nej.

---

## Komplet Teknisk Specifikation

### Fil der Ændres

| Fil | Estimeret Ændring |
|-----|-------------------|
| `supabase/functions/auto-trade-quant/index.ts` | ~550 linjer |

### Ny Signatur for analyzeSignal()

```typescript
function analyzeSignal(
  klines: any[], 
  trendKlines: any[], 
  config: IndicatorConfig,
  allowedSides: ('LONG' | 'SHORT')[] = ['LONG', 'SHORT']
)
```

### Side-Gate Flow (serve() funktion)

```typescript
// 1. Beregn HTF før analyzeSignal
let allowedSides: ('LONG' | 'SHORT')[] = ['LONG', 'SHORT'];
let higherTrend: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
let sideGateReason: string = 'HTF disabled';

if (config.higher_trend_enabled) {
  const minKlinesRequired = getMinimumKlinesForHTF(config);
  const htfKlines = await fetchKlines(symbol, config.higher_trend_timeframe, config.klines_limit);
  
  if (!htfKlines || htfKlines.length < minKlinesRequired) {
    console.warn(`HTF klines < required: got ${htfKlines?.length ?? 0}, need ${minKlinesRequired}`);
    higherTrend = 'NEUTRAL';
    sideGateReason = `HTF fallback NEUTRAL (insufficient data)`;
  } else {
    higherTrend = analyzeHigherTrend(htfKlines, config);
    if (higherTrend === 'BULLISH') {
      allowedSides = ['LONG'];
      sideGateReason = `HTF ${config.higher_trend_timeframe} = BULLISH`;
    } else if (higherTrend === 'BEARISH') {
      allowedSides = ['SHORT'];
      sideGateReason = `HTF ${config.higher_trend_timeframe} = BEARISH`;
    } else {
      sideGateReason = `HTF ${config.higher_trend_timeframe} = NEUTRAL`;
    }
  }
}

// 2. Kald analyzeSignal med allowedSides
const analysis = analyzeSignal(klines, trendKlines, config, allowedSides);
```

### HTF Minimum Klines Beregning

```typescript
function getMinimumKlinesForHTF(config: IndicatorConfig): number {
  const emaFast = config.ema_fast ?? 9;
  const emaMedium = config.ema_medium ?? 21;
  const emaSlow = config.ema_slow ?? 55;
  
  const minRequired = Math.max(emaFast, emaMedium, emaSlow);
  const buffer = Math.ceil(minRequired * 0.5);
  
  return minRequired + buffer;
}
```

### Ny filterStatus Struktur

```text
filterStatus:
+-- neutral (kun ATR + ADX)
|   +-- atr: { passed: null|false|true }
|   +-- adx: { passed: null|false|true }
+-- long (side-specifik)
|   +-- evaluated: boolean (= longAllowed)
|   +-- emaSpread, emaQuality, volume, macdDirection, etc.
|   +-- allPassed: null|false|true
+-- short (side-specifik)
    +-- evaluated: boolean (= shortAllowed)
    +-- emaSpread, emaQuality, volume, macdDirection, etc.
    +-- allPassed: null|false|true
```

### Condition Arrays (Strikt Conditional)

```typescript
const longConditions: boolean[] = [];
const shortConditions: boolean[] = [];

// Alle push() inde i respektive if-blokke
if (config.ema_enabled && emaDataValid) {
  if (longAllowed) {
    const emaLongTrend = /* beregning */;
    longConditions.push(emaLongTrend);
  }
  if (shortAllowed) {
    const emaShortTrend = /* beregning */;
    shortConditions.push(emaShortTrend);
  }
}

const longConditionsMet = longConditions.filter(Boolean).length;
const shortConditionsMet = shortConditions.filter(Boolean).length;
```

### Neutral Filter Logik

```typescript
// null = gated/disabled → behandles som pass
const neutralFiltersPassed = !neutralFilters.some(f => f === false);
```

### Signal Beslutning med Tie-Breaker

```typescript
const longSignal = longAllowed && 
                   longConditionsMet >= requiredConditions && 
                   filterStatus.long.allPassed === true;

const shortSignal = shortAllowed && 
                    shortConditionsMet >= requiredConditions && 
                    filterStatus.short.allPassed === true;

let signal: 'LONG' | 'SHORT' | 'NONE' = 'NONE';
let tieBreakerUsed: string | null = null;

if (longSignal && shortSignal) {
  if (longConditionsMet > shortConditionsMet) {
    signal = 'LONG';
    tieBreakerUsed = 'LONG_MORE_CONDITIONS';
  } else if (shortConditionsMet > longConditionsMet) {
    signal = 'SHORT';
    tieBreakerUsed = 'SHORT_MORE_CONDITIONS';
  } else {
    signal = 'NONE';
    tieBreakerUsed = 'TIE_NO_SIGNAL';
    console.warn(`TIE: Both signals true with equal conditions → NONE`);
  }
} else if (longSignal) {
  signal = 'LONG';
} else if (shortSignal) {
  signal = 'SHORT';
}
```

### Invariant Clamp (Sikkerhed)

```typescript
if (signal === 'LONG' && !longAllowed) {
  console.error(`INVARIANT VIOLATION: LONG signal but gated!`);
  signal = 'NONE';
}
if (signal === 'SHORT' && !shortAllowed) {
  console.error(`INVARIANT VIOLATION: SHORT signal but gated!`);
  signal = 'NONE';
}
```

### indicators_snapshot Udvidelse

```typescript
const indicators = {
  // ... eksisterende felter ...
  
  signal_decision: {
    longSignal: longSignal,
    shortSignal: shortSignal,
    longConditionsMet: longConditionsMet,
    shortConditionsMet: shortConditionsMet,
    requiredConditions: requiredConditions,
    finalSignal: signal,
    tieBreaker: tieBreakerUsed,
  },
  
  side_gate: {
    higher_trend_enabled: config.higher_trend_enabled,
    higher_trend_timeframe: config.higher_trend_timeframe,
    higher_trend_result: higherTrend,
    gate_reason: sideGateReason,
    allowed_sides: allowedSides,
    htf_min_klines_required: minKlinesRequired,
    htf_actual_klines: htfKlines?.length ?? 0,
    htf_klines_sufficient: (htfKlines?.length ?? 0) >= minKlinesRequired,
  },
};
```

---

## Forventet Adfærd

| HTF Trend | allowedSides | longSignal | shortSignal | Final Signal |
|-----------|--------------|------------|-------------|--------------|
| BULLISH | ['LONG'] | true/false | **false** | LONG eller NONE |
| BEARISH | ['SHORT'] | **false** | true/false | SHORT eller NONE |
| NEUTRAL (begge true, LONG flere) | ['LONG','SHORT'] | true | true | LONG (tie-breaker) |
| NEUTRAL (begge true, tie) | ['LONG','SHORT'] | true | true | NONE (TIE_NO_SIGNAL) |
| NEUTRAL (kun SHORT true) | ['LONG','SHORT'] | false | true | SHORT |
| HTF disabled | ['LONG','SHORT'] | true/false | true/false | Normal logik |
| Data insufficient | ['LONG','SHORT'] | true/false | true/false | Normal logik (fallback NEUTRAL) |

---

## Kritiske Invarianter (14 punkter)

1. Alle thresholds fra UI config - ingen hardcodede tal
2. EMA er side-specifik - ikke i neutral kategori
3. Neutral = kun ATR + ADX
4. `null` = gated/disabled (for indicator felter), `false` = fejlet
5. Gated sider: alle side-specifikke passed/reason/audit felter sættes til `null`
6. **Gated side signal = `false` (ikke `null`):** `longAllowed=false` → `longSignal=false`
7. Neutral filters passerer når ingen er `false` (true eller null er OK)
8. `filterStatus.long.evaluated` / `filterStatus.short.evaluated` = `longAllowed` / `shortAllowed`
9. Alle `push()` til condition-arrays inde i `if (longAllowed)` / `if (shortAllowed)` blokke
10. Final invariant clamp forhindrer gated signal
11. HTF min-klines beregnes fra UI-config parametre
12. HTF fallback = NEUTRAL ved fejl eller insufficient data
13. **Signal booleans i snapshot:** `longSignal`/`shortSignal` i `indicators_snapshot.signal_decision`
14. **Deterministisk tie-breaker:** Ved begge signaler true, vælg siden med flest conditions. Ved tie, NONE

