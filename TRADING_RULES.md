# 📋 KOMPLET HANDELSSYSTEM - ALLE REGLER

## 🎯 OVERSIGT

Systemet evaluerer i **tre faser** hvor trades kun åbnes hvis ALLE tre faser består.

---

## ⚙️ FASE 1 – HÅRDE FILTRE

**VIGTIGT:** Alle hårde filtre evalueres KUN hvis de er enabled i konfiguration.  
Hvis ÉN hård filter fejler → ingen trade.

### 1️⃣ EMA SPREAD (Hard Filter)
- **Enabled hvis:** `ema_enabled = true`
- **Periode:** Fast=9, Medium=21, Slow=50
- **Minimum Spread:** 0.05% (konfigurerbar: `min_ema_spread_percent`)
- **Beregning:** `|Fast EMA - Slow EMA| / Pris × 100`
- **Regel:** Hvis spread < minimum → **BLOKÉR TRADE**
- **Formål:** Undgå sidelæns markeder uden klar trend

### 2️⃣ ATR (Hard Filter)
- **Enabled hvis:** `atr_enabled = true`
- **Periode:** 14 (konfigurerbar: `atr_period`)
- **Minimum ATR:** 0.007 (konfigurerbar: `min_atr`)
- **Minimum ATR%:** 0.4% (konfigurerbar: `min_atr_percent`)
- **Adaptive Threshold:**
  - Base: 0.4%
  - Floor: 0.2%
  - Ceiling: 1.0%
  - Beregnes dynamisk baseret på volume ratio
- **Regel:** Hvis ATR < minimum ELLER ATR% < dynamisk threshold → **BLOKÉR TRADE**
- **Formål:** Sikr nok volatilitet til stop-loss beregning

### 3️⃣ ADX (Hard Filter)
- **Enabled hvis:** `adx_enabled = true`
- **Periode:** 14 (konfigurerbar: `adx_period`)
- **Threshold:** 30 (konfigurerbar: `adx_threshold`)
- **Adaptive Threshold:**
  - Base: 30
  - Floor: 20
  - Ceiling: 50
  - Beregnes dynamisk baseret på ATR ratio
- **Regel:** Hvis ADX < dynamisk threshold → **BLOKÉR TRADE**
- **Formål:** Sikr tilstrækkelig trendstyrke

### 4️⃣ VOLUME (Hard Filter)
- **Enabled hvis:** `volume_enabled = true`
- **Gennemsnit Periode:** 20 (konfigurerbar: `volume_avg_period`)
- **Multiplier:** 1.0 (konfigurerbar: `volume_multiplier`)
- **Regel:** Hvis Volume < (Average × Multiplier) → **BLOKÉR TRADE**
- **Formål:** Sikr nok markedsaktivitet

### 5️⃣ MACD RETNING (Hard Filter - ALTID AKTIVT)
- **Enabled hvis:** `macd_enabled = true`
- **Parametre:** Fast=12, Slow=26, Signal=9
- **Histogram Threshold:** 0.001
- **Regler:**
  - **LONG:** KUN hvis MACD Line > 0
  - **SHORT:** KUN hvis MACD Line < 0
- **Regel:** Hvis forkert retning → **BLOKÉR TRADE**
- **Formål:** Sikr handel i retning af overordnet momentum

### 6️⃣ RSI MOMENTUM ZONES (Hard Filter)
- **Enabled hvis:** `rsi_enabled = true`
- **Periode:** 14 (konfigurerbar: `rsi_period`)
- **LONG Zone:** 25-35 (konfigurerbar: `rsi_min_long` + `rsi_zone_width`)
- **SHORT Zone:** 65-75 (konfigurerbar: `rsi_max_short` - `rsi_zone_width`)
- **Momentum Perioder:** 2 (konfigurerbar: `rsi_momentum_periods`)
- **Regler:**
  - **LONG:** RSI i zone (25-35) ELLER (krydser 30 opad OG har opad momentum)
  - **SHORT:** RSI i zone (65-75) ELLER (krydser 70 nedad OG har nedad momentum)
- **Regel:** Hvis RSI ikke i korrekt zone og uden momentum → **BLOKÉR TRADE**
- **Formål:** Undgå ekstremer og sikr momentum

### 7️⃣ STOCHRSI (Soft Filter)
- **Enabled hvis:** `stochrsi_enabled = true`
- **Periode:** RSI=14, %K=3, %D=3
- **Overkøbt:** 80
- **Oversolgt:** 20
- **Regler (soft):**
  - **LONG:** %K < 20 (oversolgt)
  - **SHORT:** %K > 80 (overkøbt)
- **Formål:** Identificer potentielle vendepunkter

### 8️⃣ PIVOT POINTS (Soft Filter)
- **Enabled hvis:** `pivot_points_enabled = true`
- **Timeframe:** Daily
- **Lookback:** 24 bars
- **Near Threshold:** 0.2%
- **Regler (soft):**
  - **LONG:** IKKE tæt på resistance (R1/R2)
  - **SHORT:** IKKE tæt på support (S1/S2)
- **Formål:** Undgå trades nær key levels

### 9️⃣ BOLLINGER BANDS (Soft Filter)
- **Enabled hvis:** `bb_enabled = true`
- **Periode:** 20
- **Std Deviation:** 2.0
- **Regler (soft):**
  - **LONG:** Pris ≤ Lower Band × 1.01 (inden for 1%)
  - **SHORT:** Pris ≥ Upper Band × 0.99 (inden for 1%)
- **Formål:** Identificer oversolgt/overkøbt baseret på standard deviation

---

## 📊 FASE 2 – SOFT CONDITIONS (Point-system)

**VIGTIGT:** Soft conditions bygges DYNAMISK baseret på enabled indicators.  
Kræver minimum antal points som specificeret i UI: `signal_conditions_required`

### Soft Conditions (hver giver 1 point):

1. **EMA Trend Alignment** (hvis `ema_enabled`)
   - **LONG:** Fast > Medium > Slow OG pris stiger
   - **SHORT:** Fast < Medium < Slow OG pris falder

2. **StochRSI Zone** (hvis `stochrsi_enabled`)
   - **LONG:** %K < 20 (oversolgt)
   - **SHORT:** %K > 80 (overkøbt)

3. **MACD Color Change** (hvis `macd_enabled`)
   - **LONG:** Histogram skifter fra negativ → positiv
   - **SHORT:** Histogram skifter fra positiv → negativ

4. **MACD Histogram Momentum** (hvis `histogram_momentum_enabled`)
   - **Momentum Perioder:** 3
   - **LONG:** Histogram momentum accelererer opad
   - **SHORT:** Histogram momentum accelererer nedad

5. **Bollinger Bands Touch** (hvis `bb_enabled`)
   - **LONG:** Pris nær lower band
   - **SHORT:** Pris nær upper band

6. **Volume Surge** (hvis `volume_enabled`)
   - **LONG/SHORT:** Current Volume > Average Volume

7. **Pivot Zone Touch** (hvis `pivot_points_enabled`)
   - **LONG:** IKKE tæt på resistance
   - **SHORT:** IKKE tæt på support

### Point Evaluering:
```
LONG Signal  = (antal LONG points ≥ signal_conditions_required) OG (MACD Direction LONG OK)
SHORT Signal = (antal SHORT points ≥ signal_conditions_required) OG (MACD Direction SHORT OK)
```

**Eksempel:**
- Hvis `signal_conditions_required = 3`
- Og LONG får 4 points
- Og MACD Line > 0
- → LONG signal kan genereres (hvis fase 1 + 3 også består)

---

## 🎯 FASE 3 – 1H TREND FILTER (Hard Rule)

**VIGTIGT:** Evalueres EFTER fase 1 og 2 er bestået.

### Trend Analyse på 1H Timeframe:
- Beregner EMA alignment på højere timeframe (1H)
- **LONG Trade:** KUN hvis 1H Fast > Medium > Slow (bullish)
- **SHORT Trade:** KUN hvis 1H Fast < Medium < Slow (bearish)
- **NEUTRAL:** Blokerer begge retninger

**Regel:** Hvis trend mismatch → **BLOKÉR TRADE**

---

## 💰 TRADE ÅBNING (fra UI Config)

Hvis ALLE tre faser består:

- **Leverage:** 3x (konfigurerbar: `leverage`)
- **Position Size:** 20% af balance (konfigurerbar: `position_size_percent`)
- **Stop-loss:** Entry ± (2.5 × ATR) (konfigurerbar: `atr_stop_loss_multiplier`)
- **Take-profit:** Entry ± (5.0 × ATR) (konfigurerbar: `atr_take_profit_multiplier`)
- **Break-even:** Flytter SL til entry ved 0.8 × ATR profit (konfigurerbar: `break_even_atr`)
- **Trailing Stop:** Aktiveres ved 1.0 × ATR profit (konfigurerbar: `trailing_stop_activation_atr`)
- **Trailing Distance:** 50% af peak price movement
- **Max Duration:** 240 minutter (konfigurerbar: `max_position_duration_minutes`)
- **Max Open Positions:** 5 (konfigurerbar: `max_open_positions`)

---

## 📈 POSITION MONITORING

Håndteres af `monitor-positions` edge function:

### Break-Even Logic:
```
Hvis profit i ATR ≥ break_even_atr (0.8):
  → Flyt stop-loss til entry price
  → Sæt break_even_activated = true
```

### Trailing Stop Logic:
```
Hvis profit i ATR ≥ trailing_stop_activation_atr (1.0):
  → Aktivér trailing stop
  → Stop følger peak price med trailing_stop_percent (50%)
  → Opdatér kontinuerligt peak_price og trailing_stop
```

### Exit Conditions:
1. **Stop-Loss Hit:** Pris rammer stop_loss level
2. **Trailing Stop Hit:** Pris rammer trailing_stop level
3. **Max Duration:** Position åben > max_position_duration_minutes
4. **Manual Close:** Via UI

---

## 🏆 SIGNAL PRIORITERING

Når flere signals genereres samtidigt:

### Scoring System (max 100 points):
```javascript
score = 
  (emaAlignment ? 20 : 0) +
  (stochRSI_strength × 15) +
  (macd_histogram_strength × 25) +
  (adx × 0.8) +
  (volume_ratio × 10)
```

### Prioritering:
1. Sortér signals efter score (højest først)
2. Åbn kun trades indtil `max_open_positions` nået
3. Tjek løbende for race conditions
4. Verificér position på Binance efter åbning

---

## 🛡️ RISIKOSTYRING

### Position Limits:
- **Max Open Positions:** 5 (konfigurerbar)
- **Max Exposure:** 100% af balance (konfigurerbar: `max_exposure_percent`)
- **Daily Loss Limit:** 10% (konfigurerbar: `daily_loss_limit_percent`)

### Race Condition Protection:
- Verificér faktisk antal positioner før ny trade
- Double-check efter trade åbning
- Log alle race condition events

---

## 🔍 IMPLEMENTATION STATUS

### ✅ Fuldt Implementeret:
- Alle hårde filtre respekterer enabled status
- Soft conditions bygges dynamisk
- signal_conditions_required respekteres fra UI
- Adaptive thresholds for ATR og ADX
- 1H trend filter
- Position monitoring med break-even og trailing stop
- Signal prioritering

### 📝 Bemærk:
- Alle parametre er fuldt konfigurerbare via `indicator_config` tabel
- Filtre evalueres KUN hvis enabled
- System logger detaljeret information for hver evaluering
- Edge functions: `auto-trade-quant`, `monitor-positions`, `continuous-scan-quant`

---

## 📊 EKSEMPEL PÅ FULD EVALUERING

```
Symbol: BTCUSDC

FASE 1 - HÅRDE FILTRE:
✅ EMA Spread: 0.654% > 0.05%
✅ ATR: 0.523% > 0.4% (adaptive)
✅ ADX: 42.3 > 30.2 (adaptive)
✅ Volume: 1.8x > 1.0x
✅ MACD: 0.00234 > 0 (LONG OK)
✅ RSI: 32.5 i zone [30-35]

FASE 2 - SOFT CONDITIONS (kræver 3/6):
✅ EMA Trend: Fast > Medium > Slow + pris stiger
✅ StochRSI: %K = 18 < 20
✅ MACD Histogram: Shift fra -0.001 til +0.002
❌ Histogram Momentum: Ikke accelererende
❌ Bollinger: Pris ikke ved band
✅ Volume: 1.8x > 1.0x

Points: 4/6 ≥ 3 → ✅ BESTÅET

FASE 3 - 1H TREND:
✅ 1H Fast (42500) > Medium (42300) > Slow (42100)

RESULTAT: 🟢 LONG SIGNAL ÅBNES
```

---

## 🔗 RELATEREDE FILER

- **Edge Function:** `supabase/functions/auto-trade-quant/index.ts`
- **Monitor:** `supabase/functions/monitor-positions/index.ts`
- **Scanner:** `supabase/functions/continuous-scan-quant/index.ts`
- **Config:** `indicator_config` tabel i Supabase
- **Positions:** `positions` tabel i Supabase
- **History:** `trade_history` tabel i Supabase
