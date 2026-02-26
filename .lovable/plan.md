# Implementeringsplan: Strategy Slots (Multi-Strategi Trading)

## Version 1.0

---

## Koncept

Kør flere strategier (slots) samtidigt med én fælles scanner. Hver slot har sin egen indicator_config, kapital-andel, handler, positioner og stats. Scanneren kører ÉN gang og evaluerer alle aktive slots' configs mod scan-resultatet.

---

## Arkitektur

```
┌─────────────────────────────────────┐
│           Scanner (1 instans)        │
│  Henter klines for alle symbols      │
│  Returnerer rå markedsdata           │
└──────────────┬──────────────────────┘
               │
     ┌─────────┼─────────┐
     ▼         ▼         ▼
  Slot 1    Slot 2    Slot 3
  Config A  Config B  Config C
  25% cap   10% cap   15% cap
  Egne pos  Egne pos  Egne pos
  Egne stats Egne stats Egne stats
```

**Nøgleprincip:** Scanneren henter markedsdata én gang. `auto-trade-quant` evaluerer signaler for HVER aktiv slot's config mod samme data. Hver slot har sin egen kapital-pool og positionsgrænse.

---

## Database-ændringer

### Ny tabel: `strategy_slots`

```sql
CREATE TABLE public.strategy_slots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  slot_number INTEGER NOT NULL,
  name TEXT NOT NULL DEFAULT 'Slot 1',
  config_id UUID REFERENCES public.indicator_config(id),
  capital_percent NUMERIC NOT NULL DEFAULT 25,
  is_active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, slot_number)
);
```

**Felter:**
- `slot_number`: 1, 2, 3... (unik per bruger)
- `config_id`: Hvilken indicator_config denne slot bruger
- `capital_percent`: % af total Binance-balance allokeret til denne slot
- `is_active`: Om slotten kører (uafhængigt af trading_session)

### Ændring: `positions` tabel

```sql
ALTER TABLE public.positions ADD COLUMN slot_id UUID REFERENCES public.strategy_slots(id);
```

### Ændring: `trade_history` tabel

```sql
ALTER TABLE public.trade_history ADD COLUMN slot_id UUID REFERENCES public.strategy_slots(id);
```

### Ændring: `scan_results` tabel

```sql
ALTER TABLE public.scan_results ADD COLUMN slot_id UUID REFERENCES public.strategy_slots(id);
```

---

## Backend-ændringer

### `auto-trade-quant` (signal-evaluering)

**Nuværende flow:**
1. Modtag symbol + klines
2. Hent aktiv config fra trading_session.active_config_id
3. Evaluér signal → åbn position hvis signal

**Nyt flow:**
1. Modtag symbol + klines (uændret)
2. Hent ALLE aktive slots: `strategy_slots WHERE is_active = true`
3. For HVER slot:
   a. Hent slottens config via `slot.config_id`
   b. Evaluér signal med denne config
   c. Hvis signal → beregn position size ud fra `(total_balance × slot.capital_percent / 100)`
   d. Tjek slot-specifik max_open_positions (kun positioner med denne slot_id)
   e. Åbn position med `slot_id` tagget

**Serialisering:** Slots evalueres sekventielt i samme scan-cycle for at undgå race conditions.

### `continuous-scan-quant` (scanner)

**Ingen ændring i scan-logik.** Scanneren henter stadig klines for alle symbols. Den kalder `auto-trade-quant` som normalt. Det er `auto-trade-quant` der itererer over slots.

### `monitor-positions` / `auto-monitor-quant` (exit-logik)

**Ændring:** Når positioner monitoreres, hentes den tilhørende slots config via `position.slot_id → strategy_slots.config_id → indicator_config`. Exit-regler bruger slottens config, ikke trading_session.active_config_id.

### Kapital-validering

```typescript
// I auto-trade-quant, før position åbnes:
const totalAllocated = activeSlots.reduce((sum, s) => sum + s.capital_percent, 0);
if (totalAllocated > 100) {
  console.error(`Over-allokering: ${totalAllocated}% > 100%`);
  return; // Bloker nye trades
}

const slotBalance = totalBalance * (slot.capital_percent / 100);
const margin = slotBalance * (config.position_size_percent / 100);
const notional = margin * config.leverage;
const quantity = notional / currentPrice;
```

---

## UI-ændringer

### 1. Slot-selector (top-bar)

Placering: Under "Trading Dashboard" header, over strategi-indstillinger.

```
┌──────────────────────────────────────────────┐
│  [Slot 1 ●]  [Slot 2]  [Slot 3]  [+ Ny Slot] │
│  "Trend Follow" 25%   "Reversal" 10%          │
└──────────────────────────────────────────────┘
```

- Aktiv slot fremhævet
- Viser navn + kapital%
- Grøn prik hvis slotten kører
- "+ Ny Slot" knap for at tilføje

### 2. Slot-indstillinger

Når en slot er valgt:
- Vælg config (dropdown af indicator_configs)
- Indstil kapital% (med validering: sum ≤ 100%)
- Aktivér/deaktivér slot
- Slet slot

### 3. Filtrering af alle tabs

Når en slot er valgt, filtrerer ALLE tabs på `slot_id`:
- **P&L:** Kun handler fra denne slot
- **Historik:** Kun handler fra denne slot
- **Scan:** Kun scan-resultater fra denne slot
- **Config:** Viser slottens config
- **Positioner:** Kun positioner fra denne slot

### 4. "Alle Slots" aggregeret view

En ekstra "tab" der viser samlet overblik:
- Total P&L på tværs af slots
- Kapital-fordeling pie chart
- Performance-sammenligning

---

## Migrationsplan (rækkefølge)

### Fase 1: Database
1. Opret `strategy_slots` tabel med RLS
2. Tilføj `slot_id` kolonne til `positions`, `trade_history`, `scan_results`
3. Opret default Slot 1 for eksisterende bruger med nuværende active_config_id

### Fase 2: Backend
4. Opdater `auto-trade-quant` til at iterere over aktive slots
5. Opdater `monitor-positions` til at bruge slot-specifik config
6. Tilføj kapital-validering

### Fase 3: UI
7. Tilføj SlotSelector komponent
8. Tilføj slot-filtrering i alle tabs
9. Opdater PositionManager til at vise slot-info
10. Opdater TradingDashboard til at bruge slot-context

### Fase 4: Bagudkompatibilitet
11. Eksisterende positioner/handler uden slot_id vises under "Legacy" eller Slot 1
12. trading_session.active_config_id bruges som fallback hvis ingen slots findes

---

## Sikkerhed & Invarianter

1. **Sum ≤ 100%:** Backend BLOKERER trades hvis summen af aktive slots' capital_percent > 100%
2. **Slot-isolering:** En slots SL/TP/trailing påvirker IKKE andre slots
3. **Race condition:** Slots evalueres sekventielt i scan-cycle
4. **RLS:** strategy_slots har user_id-baseret RLS (som alle andre tabeller)
5. **Config-uafhængighed:** Hver slot kan bruge samme eller forskellige configs
6. **Sletning:** Slot kan kun slettes hvis den ikke har åbne positioner
