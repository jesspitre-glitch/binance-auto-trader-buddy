# 📋 KOMPLET HANDELSSYSTEM - ALLE REGLER

## 🎯 OVERSIGT

Systemet består af tre hovedkomponenter:
1. **`auto-trade-quant`** - Scanner markedet og åbner nye positioner
2. **`monitor-positions`** - Overvåger åbne positioner og håndterer exits
3. **`continuous-scan-quant`** - Orkestrerer kontinuerlig scanning

Trades åbnes KUN hvis **ALLE tre faser** består.

---

## ⚙️ FASE 1 – HÅRDE FILTRE (Entry)

**VIGTIGT:** Alle hårde filtre evalueres KUN hvis de er enabled i konfiguration.  
Hvis ÉN hård filter fejler → ingen trade.

### 1️⃣ EMA SPREAD (Hard Filter)
- **Enabled hvis:** `ema_enabled = true`
- **Periode:** Fast=9, Medium=21, Slow=50 (konfigurerbar)
- **Minimum Spread:** `min_ema_spread_percent` (default 0.05%)
- **Maximum Spread:** `max_ema_spread_percent` (optional)
- **Beregning:** `|EMA_Fast - EMA_Slow| / Pris × 100`
- **Regel:** Hvis spread < minimum ELLER spread > maximum → **BLOKÉR TRADE**
- **Logging:** `ema_spread_value`, `ema_spread_min`, `ema_spread_max`

### 2️⃣ ATR FLOOR (Hard Filter)
- **Enabled hvis:** `atr_enabled = true`
- **Periode:** `atr_period` (default 14)
- **Minimum ATR%:** `min_atr_percent` (default 0.04%)
- **Adaptive Mode:** Hvis `adaptive_atr_enabled = true`:
  - `floor = atr_floor` (minimum)
  - `ceiling = atr_ceiling` (maximum)
  - `threshold = base × (current_volume / avg_volume)` clamped til [floor, ceiling]
- **Beregning:** `ATR / Pris × 100`
- **Regel:** Hvis ATR% < effective_threshold → **BLOKÉR TRADE**
- **Logging:** `atr_percent_raw`, `atr_floor_used`, `atr_floor_source`, `effective_min_atr_percent_used`, `atr_floor_passed_boolean`

### 3️⃣ ADX RANGE (Hard Filter) ⚠️ RETTET + VERIFICERET
- **Enabled hvis:** `adx_enabled = true`
- **Periode:** `adx_period` (default 14)
- **Range:** `adx_floor` (minimum) ≤ ADX ≤ `adx_ceiling` (maximum)
  - Default: 20 ≤ ADX ≤ 40

**🔴 KRAV 1: Adaptive ADX = OFF → dynamicMinADX = adx_floor PRÆCIST**
- Når `adaptive_adx_enabled = false`: `dynamicMinADX = adx_floor` (ingen beregning)
- Når `adaptive_adx_enabled = true`:
  - `dynamic_min = adx_base_min × (current_ATR% / avg_ATR%)`
  - Clamped til [adx_floor, adx_ceiling]

**Regler:**
- Hvis ADX < `dynamicMinADX` → **BLOKÉR TRADE** (for lav trend)
- Hvis ADX > `adx_ceiling` → **BLOKÉR TRADE** (for høj volatilitet)

**Logging (KRAV 1 OPFYLDT):**
```javascript
{
  adx_value: number,           // Beregnet ADX værdi
  adx_min: number,             // adx_floor fra UI
  adx_max: number,             // adx_ceiling fra UI  
  adx_min_source: 'UI' | 'ADAPTIVE',  // 🔴 NY: Kilde til dynamicMinADX
  dynamic_min_adx: number,     // Faktisk brugt minimum
  adaptive_adx_computed: number | null  // Kun sat hvis adaptive
}
```

### 4️⃣ VOLUME (Retnings-specifikt Hard/Soft Filter)

**LONG Volume:**
- **Enabled hvis:** `volume_enabled = true`
- **Threshold:** `volume_multiplier` (default 1.05x)
- **Mode:** Altid HARD for LONG
- **Beregning:** `current_volume / avg_volume(20)`
- **Regel:** Hvis ratio < threshold → **BLOKÉR LONG**

**SHORT Volume:**
- **Mode:** `volume_mode_short` (HARD/SOFT/OFF)
- **Threshold:** `volume_multiplier_short` (default 0.9x)
- **Regler:**
  - HARD: Hvis ratio < threshold → **BLOKÉR SHORT**
  - SOFT: Giver 1 soft point hvis ratio ≥ threshold
  - OFF: Ingen volume krav for SHORT
- **Logging:** `volume_current`, `volume_avg`, `volume_ratio`, `volume_long_passed`, `volume_short_passed`, `volume_short_mode`

### 5️⃣ MACD RETNING (Hard Filter - Retnings-specifik)
- **Enabled hvis:** `macd_direction_enabled = true`
- **Parametre:** Fast=12, Slow=26, Signal=9 (konfigurerbar)
- **Regler:**
  - **LONG:** KUN hvis `macd_line > signal_line` (bullish crossover)
  - **SHORT:** KUN hvis `macd_line < signal_line` (bearish crossover)
- **Logging:** `macd_line`, `macd_signal_line`, `macd_direction_long_ok`, `macd_direction_short_ok`

### 6️⃣ MACD FARVESKIFT (Hard Filter - Retnings-specifik)
- **Enabled hvis:** `macd_color_change_hard_filter = true`
- **Regler:**
  - **LONG:** Histogram skifter fra negativ → positiv
  - **SHORT:** Histogram skifter fra positiv → negativ
- **Logging:** `macd_histogram_prev`, `macd_histogram_cur`, `macd_color_change_long_ok`, `macd_color_change_short_ok`

### 7️⃣ RSI MOMENTUM ZONES (Hard Filter - Retnings-specifik)
- **Enabled hvis:** `rsi_enabled = true`
- **Periode:** `rsi_period` (default 14)
- **LONG Zone:** `rsi_min_long` til `rsi_min_long + rsi_zone_width` (default 25-35)
- **SHORT Zone:** `rsi_max_short - rsi_zone_width` til `rsi_max_short` (default 65-75)
- **Momentum:** `rsi_momentum_periods` (default 2)
- **Regler:**
  - **LONG:** RSI i zone (25-35) ELLER (krydser 30 opad OG har opad momentum)
  - **SHORT:** RSI i zone (65-75) ELLER (krydser 70 nedad OG har nedad momentum)
- **Logging:** `rsi_value`, `rsi_in_long_zone`, `rsi_in_short_zone`, `rsi_momentum_direction`

### 8️⃣ STOCHRSI (Hard/Soft Filter - Retnings-specifik)
- **Enabled hvis:** `stochrsi_enabled = true`
- **Hard filter hvis:** `stochrsi_hard_filter = true`
- **Periode:** RSI=14, K=3, D=3 (konfigurerbar)
- **LONG Betingelse:** K ≤ `stochrsi_oversold_k` AND D ≤ `stochrsi_oversold_d` (default K≤10, D≤10)
- **SHORT Modes:** (`stochrsi_short_mode`)
  - **REVERSAL_OVERBOUGHT (default):**
    - DIRECT: K ≥ `overbought_k` AND D ≥ `overbought_d` (default 70/60)
    - ROLLOVER: K var ≥ overbought inden for 5 candles + K falder + D ≥ `rollover_d_min_short` (default 50)
  - **CONTINUATION_OVERSOLD:**
    - K ≤ oversold_k AND D ≤ oversold_d (symmetrisk med LONG)
- **Logging:** `stochrsi_k`, `stochrsi_d`, `stochrsi_long_passed`, `stochrsi_short_passed`, `stochrsi_short_mode`, `stochrsi_short_condition_type`

---

## 📊 FASE 2 – SOFT CONDITIONS (Point System)

Bygges **dynamisk** baseret på enabled indicators.  
Kræver minimum antal points: `signal_conditions_required` (default 1-3)

| Condition | Point | LONG Betingelse | SHORT Betingelse |
|-----------|-------|-----------------|------------------|
| **EMA Alignment** | 1 | Fast > Medium > Slow + pris stiger | Fast < Medium < Slow + pris falder |
| **StochRSI Zone** | 1 | K < 20 | K > 80 |
| **MACD Histogram** | 1 | Histogram > `macd_histogram_threshold` | Histogram < -threshold |
| **MACD Momentum** | 1 | Histogram accelererer opad (X perioder) | Histogram accelererer nedad |
| **Bollinger Touch** | 1 | Pris nær lower band (inden for 1%) | Pris nær upper band (inden for 1%) |
| **Volume Surge** | 1 | ratio ≥ 1.0 (hvis SOFT mode) | ratio ≥ threshold (hvis SOFT mode) |
| **Pivot Zone** | 1 | IKKE tæt på resistance (R1/R2) | IKKE tæt på support (S1/S2) |
| **VWAP** | 1 | Price > VWAP | Price < VWAP |

**Signal Evaluering:**
```javascript
LONG  = (LONG_points ≥ signal_conditions_required) AND (alle LONG hårde filtre OK)
SHORT = (SHORT_points ≥ signal_conditions_required) AND (alle SHORT hårde filtre OK)
```

---

## 🎯 FASE 3 – TREND FILTER (Højere Timeframe)

### Medium Trend Filter (30m)
- **Timeframe:** `trend_timeframe` (default "30m")
- **Beregning:** EMA(`ema_medium_trend`) direction + price position
- **States:**
  - **BULLISH:** Price > EMA OG EMA er stigende (current > previous)
  - **BEARISH:** Price < EMA OG EMA er faldende (current < previous)
  - **NEUTRAL:** ⚠️ Alle andre tilfælde:
    - Price > EMA men EMA er faldende
    - Price < EMA men EMA er stigende
    - EMA er flad (current = previous)
- **Logging:** `medium_trend_state`, `medium_trend_ema_value`, `medium_trend_ema_rising`, `medium_trend_price_above_ema`

### Higher Trend Filter (1H)
- **Enabled hvis:** `higher_trend_enabled = true`
- **Timeframe:** `higher_trend_timeframe` (default "1h")
- **Beregning:** EMA alignment (Fast/Medium/Slow)
- **States:**
  - **BULLISH:** Fast > Medium > Slow
  - **BEARISH:** Fast < Medium < Slow
  - **NEUTRAL:** ⚠️ Alle andre EMA konfigurationer:
    - Fast > Slow men Medium bryder rækkefølgen
    - EMAs krydser hinanden
    - Ingen klar alignment
- **Logging:** `higher_trend_state`, `higher_trend_ema_fast`, `higher_trend_ema_medium`, `higher_trend_ema_slow`, `higher_trend_reason`

**Blokering:**
- LONG blokeres hvis trend er BEARISH eller NEUTRAL
- SHORT blokeres hvis trend er BULLISH eller NEUTRAL

---

## 🔄 REGIME ROUTER (Dynamisk Exit-Profil Valg)

### Regime Klassifikation ved Entry
- **Enabled hvis:** `regime_router_enabled = true`
- **Method:** `regime_method` (default "ADX_AND_ATR")
- **Operator:** `regime_operator` (AND/OR)
- **Thresholds:**
  - `regime_adx_threshold` (default 22)
  - `regime_atr_pct_threshold` (default 0.15%)

**Logik:**
```javascript
if (regime_operator === 'AND') {
  condition_met = (adx >= regime_adx_threshold) AND (atr_pct >= regime_atr_pct_threshold)
} else {
  condition_met = (adx >= regime_adx_threshold) OR (atr_pct >= regime_atr_pct_threshold)
}

regime_label = condition_met ? regime_if_true : regime_if_false  // "TREND" / "RANGE"
```

### Regime Persistence
- **Lock Regime At Entry:** `regime_lock_at_entry` (default true)
- Når aktiveret: Regime ændres IKKE efter entry, selvom ADX/ATR ændrer sig

### Exit Profile Mapping
- `regime_trend_exit_profile_id` → Exit profil for TREND regime
- `regime_range_exit_profile_id` → Exit profil for RANGE regime

**Logging ved Entry:**
```javascript
regime_router_enabled, regime_method, regime_operator,
regime_adx_threshold, regime_atr_pct_threshold,
adx_value_at_entry, atr_pct_at_entry,
regime_label, regime_reason,
exit_profile_id, exit_profile_name, exit_profile_version,
exit_profile_snapshot: { /* alle profil parametre */ }
```

---

## 💰 TRADE ÅBNING

Når alle tre faser består:

| Parameter | Kilde | Beskrivelse |
|-----------|-------|-------------|
| **Leverage** | `leverage` | Default: 3x |
| **Position Size** | `position_size_percent` | % af balance |
| **Stop-Loss** | ATR-beregnet | `entry ± (atr_stop_loss_multiplier × ATR)` |
| **Take-Profit** | ATR-beregnet | `entry ± (atr_take_profit_multiplier × ATR)` |

**Execution Flow:**
1. Set leverage for symbol via Binance API
2. Place MARKET order
3. Set server-side STOP_MARKET order
4. Gem position i database med komplet `indicators_snapshot`

---

## 📈 POSITION MONITORING (Exit Logik)

### Exit Hierarki (Prioritet Højest → Lavest)

```
1) HARD STOP LOSS % (absolut max loss - prioritet 1)
2) MAX SL AFTER MFE (stramning når MFE nået, før BE)
3) BREAK-EVEN (flytte SL til entry+)
4) PEAK-LOCK (dynamisk beskyttelse fra peak)
5) TRAILING STOP (ATR-baseret trailing)
6) MAX DURATION (timeout)
```

### "Mest Beskyttende" Definition ⚠️ PRÆCIS MATEMATISK

**🔴 KRAV 2: EXIT MODEL B - effective_stop = mest beskyttende stop**

Når flere stop-levels er aktive samtidig, vælges det **mest beskyttende**:

```javascript
// LONG: Højeste stop level vinder (tættest på current price fra nedsiden)
effective_stop = Math.max(hard_sl, max_sl_cap, break_even, peak_lock, trailing)

// SHORT: Laveste stop level vinder (tættest på current price fra opsiden)
effective_stop = Math.min(hard_sl, max_sl_cap, break_even, peak_lock, trailing)
```

**KRAV 2 OPFYLDT - Logging ved hver monitor cycle:**
```javascript
{
  candidate_stops: [
    { type: 'HARD_STOP_LOSS_HIT', level: number, active: boolean, triggered: boolean },
    { type: 'MAX_SL_AFTER_MFE_HIT', level: number, active: boolean, triggered: boolean },
    { type: 'BREAK_EVEN_HIT', level: number, active: boolean, triggered: boolean },
    { type: 'PEAK_LOCK_HIT', level: number, active: boolean, triggered: boolean },
    { type: 'TRAILING_STOP_HIT', level: number, active: boolean, triggered: boolean }
  ],
  effective_stop: number,           // 🔴 Mest beskyttende af alle AKTIVE stops
  effective_stop_type: string,      // Type af effective_stop
  stop_type_hit: string | null,     // 🔴 Hvilken stop der faktisk triggerede
  stop_level_hit: number | null,    // 🔴 Præcis level der triggerede
  selection_method: 'MAX' | 'MIN'   // LONG=MAX, SHORT=MIN
}
```
```

---

### 1️⃣ HARD STOP LOSS % (Prioritet 1)

**Absolut yderste grænse - kan ALDRIG overskrides:**

| Side | Formel | Exit Trigger |
|------|--------|--------------|
| LONG | `hard_sl = entry × (1 - hard_sl_pct/100)` | price ≤ hard_sl |
| SHORT | `hard_sl = entry × (1 + hard_sl_pct/100)` | price ≥ hard_sl |

- **Enabled hvis:** `hard_sl_pct_enabled = true`
- **Parameter:** `hard_sl_pct` (default 3%)
- **Exit Reason:** `HARD_STOP_LOSS_HIT`
- **Logging:** `hard_sl_pct`, `hard_sl_level`, `hard_sl_enabled`

---

### 2️⃣ MAX SL AFTER MFE (Prioritet 2)

**Stram SL når position har været i profit, men KUN før break-even:**

| Parameter | Beskrivelse |
|-----------|-------------|
| `max_sl_after_mfe_enabled` | Enable/disable |
| `max_sl_after_mfe_activate_pct` | MFE% threshold for aktivering (default 0.6%) |
| `max_sl_after_mfe_max_dist_pct` | Max SL distance fra entry (default 1%) |

**Logik:**
```javascript
mfe_pct = (peak_price - entry_price) / entry_price × 100  // LONG
mfe_pct = (entry_price - peak_price) / entry_price × 100  // SHORT

if (mfe_pct >= activate_pct && !break_even_activated) {
  // LONG: SL må ikke være under entry × (1 - max_dist_pct/100)
  max_sl_cap = entry × (1 - max_dist_pct/100)
  if (current_sl < max_sl_cap) new_sl = max_sl_cap
  
  // SHORT: SL må ikke være over entry × (1 + max_dist_pct/100)
  max_sl_cap = entry × (1 + max_dist_pct/100)
  if (current_sl > max_sl_cap) new_sl = max_sl_cap
}
```

- **Exit Reason:** `MAX_SL_AFTER_MFE_HIT`
- **Logging:** `max_sl_after_mfe_applied`, `max_sl_after_mfe_cap`, `max_sl_after_mfe_mfe_pct`

---

### 3️⃣ BREAK-EVEN (Prioritet 3)

**To modes - vælger mest beskyttende:**

#### Mode A: ATR-baseret
| Parameter | Beskrivelse |
|-----------|-------------|
| `break_even_atr_enabled` | Enable ATR mode |
| `break_even_atr` | ATR multiplier for trigger |
| `break_even_atr_stop_offset` | ATR multiplier for stop offset |

```javascript
// LONG:
trigger_price = entry + (break_even_atr × ATR)
if (current_price >= trigger_price) {
  be_stop = entry + (break_even_atr_stop_offset × ATR)
}

// SHORT:
trigger_price = entry - (break_even_atr × ATR)
if (current_price <= trigger_price) {
  be_stop = entry - (break_even_atr_stop_offset × ATR)
}
```

#### Mode B: Profit %-baseret
| Parameter | Beskrivelse |
|-----------|-------------|
| `break_even_profit_pct_enabled` | Enable % mode |
| `break_even_profit_pct_trigger` | Profit % for trigger |
| `break_even_profit_pct_stop_over_entry` | Stop offset % over entry |

```javascript
// LONG:
if (profit_pct >= trigger_pct) {
  be_stop = entry × (1 + stop_over_entry_pct/100)
}

// SHORT:
if (profit_pct >= trigger_pct) {
  be_stop = entry × (1 - stop_over_entry_pct/100)
}
```

**Ratchet:** Hvis `break_even_ratchet_only = true`, BE stop kan kun flyttes i gunstig retning.

**KRAV:** BE stop må ALDRIG ligge på tabssiden:
- LONG: be_stop = max(calculated_stop, entry)
- SHORT: be_stop = min(calculated_stop, entry)

- **Exit Reason:** `BREAK_EVEN_HIT`
- **Logging:** `break_even_at_price`, `break_even_trigger_price`, `break_even_mode`, `break_even_triggered_at`

---

### 4️⃣ PEAK-LOCK (Prioritet 4) ⚠️ RETTET

**Dynamisk beskyttelse baseret på PEAK PRICE (ikke entry):**

| Parameter | Beskrivelse |
|-----------|-------------|
| `peak_lock_enabled` | Enable/disable |
| `peak_lock_activate_profit_pct` | Profit % for aktivering (default 0.6%) |
| `peak_lock_distance_pct` | Max distance fra PEAK (default 0.35%) |
| `peak_lock_min_profit_floor_pct` | Minimum profit floor (default 0.15%) |
| `peak_lock_ratchet_only` | Stop kan kun strammes |

**Beregning (RETTET - baseret på peak_price):**
```javascript
// LONG:
peak_lock_stop_from_peak = peak_price × (1 - distance_pct/100)
profit_floor_stop = entry × (1 + min_profit_floor_pct/100)
peak_lock_stop = max(peak_lock_stop_from_peak, profit_floor_stop)

// SHORT:
peak_lock_stop_from_peak = peak_price × (1 + distance_pct/100)
profit_floor_stop = entry × (1 - min_profit_floor_pct/100)
peak_lock_stop = min(peak_lock_stop_from_peak, profit_floor_stop)
```

- **Exit Reason:** `PEAK_LOCK_HIT`
- **Logging:** `peak_price`, `peak_lock_stop_from_peak`, `peak_lock_stop`, `profit_floor_stop`, `peak_lock_active`

---

### 5️⃣ TRAILING STOP (Prioritet 5)

**ATR-baseret trailing:**

| Parameter | Beskrivelse |
|-----------|-------------|
| `trailing_stop_activation_enabled` | Enable/disable |
| `trailing_stop_activation_atr` | ATR profit for aktivering |
| `atr_trailing_stop_multiplier` | ATR distance fra peak |

**Beregning:**
```javascript
// Aktivering:
if (profit_in_ATR >= activation_threshold) {
  trailing_active = true
}

// LONG:
trailing_stop = peak_price - (multiplier × ATR)

// SHORT:
trailing_stop = peak_price + (multiplier × ATR)
```

**KRAV:**
- Trailing stop kan ALDRIG være værre end break-even stop
- Trailing stop kan ALDRIG være på tabssiden af entry
- Trailing stop kan ALDRIG være værre end hard SL

- **Exit Reason:** `TRAILING_STOP_HIT`
- **Logging:** `trailing_stop`, `trailing_activation_reason`, `trailing_threshold_passed`

---

### 6️⃣ MAX DURATION / TIMEOUT (Prioritet 6)

| Parameter | Beskrivelse |
|-----------|-------------|
| `max_position_duration_minutes` | Max varighed i minutter |
| `conditional_time_exit_enabled` | Anti-Sour Exit |

**Anti-Sour Exit Logik:**
- Timeout lukker KUN hvis position IKKE er i profit OG break-even IKKE er aktiveret
- Hvis i profit + BE aktiveret → timeout skipped, trailing stop styrer

- **Exit Reason:** `TIMEOUT`
- **Logging:** `minutes_since_open`, `max_duration_minutes`, `timeout_skipped_reason`

---

## 🏷️ EXIT REASONS (Entydige) ⚠️ VERIFICERET

| Exit Reason | Beskrivelse | Stop Type |
|-------------|-------------|-----------|
| `HARD_STOP_LOSS_HIT` | Hard SL % ramt | HARD_SL_PCT |
| `MAX_SL_AFTER_MFE_HIT` | Max SL cap efter MFE ramt | MAX_SL_AFTER_MFE |
| `STOP_LOSS_HIT` | Original SL ramt (legacy) | ORIGINAL_SL |
| `BREAK_EVEN_HIT` | Break-even stop ramt (positiv PnL) | BREAK_EVEN |
| `PEAK_LOCK_HIT` | Peak-lock stop ramt | PEAK_LOCK |
| `TRAILING_STOP_HIT` | ATR trailing stop ramt | TRAILING |
| `LEGACY_TRAILING_STOP_HIT` | Legacy % trailing ramt | LEGACY_TRAILING |
| `TIMEOUT` | Max duration overskredet | TIMEOUT |
| `TAKE_PROFIT_HIT` | Take-profit ramt | TAKE_PROFIT |
| `MANUAL_CLOSE` | Manuelt lukket via UI | MANUAL |

**Reklassificering:**
- Hvis `BREAK_EVEN_HIT` men PnL er negativ → reklassificeres til `STOP_LOSS_HIT`
- Hvis `TRAILING_STOP_HIT` men PnL er negativ → reklassificeres til `STOP_LOSS_HIT`

**Logging ved Exit:**
```javascript
{
  exit_reason: string,
  stop_level_hit: number,
  stop_type_hit: string,
  all_triggered_levels: Array<{type, level}>,
  selected_exit: string
}
```

---

## 📦 EXIT PROFILES (Template System)

Hver Exit Profile indeholder alle exit-parametre:

```typescript
interface ExitProfile {
  id: string;
  name: string;
  version: number;
  
  // Break-even
  be_enabled: boolean;
  be_trigger_profit_pct: number;
  be_stop_over_entry_pct: number;
  be_ratchet_only: boolean;
  
  // Peak-lock
  peaklock_enabled: boolean;
  peaklock_activate_profit_pct: number;
  peaklock_distance_from_peak_pct: number;
  peaklock_min_profit_floor_pct: number;
  peaklock_ratchet_only: boolean;
  
  // Trailing
  trailing_enabled: boolean;
  trailing_stop_atr_mult: number;
  trailing_activation_enabled: boolean;
  trailing_activation_atr_mult: number;
  
  // Duration
  max_duration_enabled: boolean;
  max_duration_minutes: number;
  
  // Hard SL override
  hard_sl_override_enabled: boolean;
  hard_sl_pct: number;
}
```

---

## 📊 KOMPLET EKSPORT PR TRADE

Hver trade eksporterer følgende felter:

### Regime Router Settings
```javascript
regime_router_enabled, regime_method, regime_operator,
regime_adx_threshold, regime_atr_pct_threshold,
adx_value_at_entry, atr_pct_at_entry,
regime_label, regime_reason
```

### Exit Profile Snapshot
```javascript
exit_profile_id, exit_profile_name, exit_profile_version,
exit_profile_snapshot: {
  be_enabled, be_trigger_profit_pct, be_stop_over_entry_pct, be_ratchet_only,
  peaklock_enabled, peaklock_activate_profit_pct, peaklock_distance_from_peak_pct,
  peaklock_min_profit_floor_pct, peaklock_ratchet_only,
  trailing_enabled, trailing_stop_atr_mult, trailing_activation_enabled,
  trailing_activation_atr_mult,
  max_duration_enabled, max_duration_minutes,
  hard_sl_override_enabled, hard_sl_pct
}
```

### Indicator Snapshot ved Entry
```javascript
ema_fast, ema_medium, ema_slow, ema_spread_pct,
rsi_value, rsi_momentum_direction,
stochrsi_k, stochrsi_d, stochrsi_short_mode,
macd_line, macd_signal, macd_histogram,
atr, atr_percent,
adx, adx_plus_di, adx_minus_di,
volume_current, volume_avg, volume_ratio,
higher_trend_state, higher_trend_reason
```

### Exit Audit
```javascript
exit_reason, stop_level_hit, stop_type_hit,
stop_level_hard_sl_pct, stop_level_max_sl_after_mfe,
stop_level_break_even, stop_level_peak_lock, stop_level_trailing,
stop_level_effective, stop_level_winner,
peak_price, low_price (MAE),
mfe_percent, mae_percent
```

---

## 🔢 SIGNAL PRIORITERING

Når flere signals genereres samtidigt:

```javascript
score = 
  (emaAlignment ? 20 : 0) +
  (stochRSI_strength × 15) +
  (macd_histogram_strength × 25) +
  (adx × 0.8) +
  (volume_ratio × 10)
```

Signals sorteres efter score, trades åbnes indtil `max_open_positions` nået.

---

## 🛡️ RISIKOSTYRING

| Parameter | Default | Beskrivelse |
|-----------|---------|-------------|
| `max_open_positions` | 5 | Max samtidige positioner |
| `max_exposure_percent` | 100% | Max total eksponering |
| `daily_loss_limit_percent` | 10% | Daglig max tab |

---

## ✅ BEKRÆFTELSER (OPDATERET)

1. ✅ **KRAV 1 - ADX Adaptive OFF:** `dynamicMinADX = adx_floor` PRÆCIST (ingen beregning)
   - Logging inkluderer: `adx_min`, `adx_max`, `adx_value`, `adx_min_source` ('UI' eller 'ADAPTIVE')
2. ✅ **KRAV 2 - Exit Model B:** `effective_stop = MAX(LONG) / MIN(SHORT)` af alle aktive stops
   - Logging inkluderer: `candidate_stops[]`, `effective_stop`, `stop_type_hit`, `stop_level_hit`
3. ✅ **ADX hard filter:** Er `adx_floor` ≤ ADX ≤ `adx_ceiling` (range, ikke bare threshold)
4. ✅ **Higher TF NEUTRAL:** Defineret som alle tilfælde hvor EMA ikke har klar alignment
5. ✅ **Peak-lock:** Beregnes ud fra `peak_price`, ikke entry
6. ✅ **Mest beskyttende:** LONG=max(), SHORT=min() af alle aktive stops
7. ✅ **Exit reasons:** Entydige med logging af `stop_level_hit` og `stop_type_hit`
8. ✅ **UI-styret:** Alle thresholds/parametre kommer fra UI config
9. ✅ **Eksport:** Komplet `exit_profile_snapshot` + `regime_router_settings` pr trade

---

## 🔗 RELATEREDE FILER

- **Entry Logic:** `supabase/functions/auto-trade-quant/index.ts`
- **Exit Logic:** `supabase/functions/monitor-positions/index.ts`
- **Scanner:** `supabase/functions/continuous-scan-quant/index.ts`
- **Config:** `indicator_config` tabel
- **Profiles:** `exit_profiles` tabel
- **Positions:** `positions` tabel
- **History:** `trade_history` tabel
