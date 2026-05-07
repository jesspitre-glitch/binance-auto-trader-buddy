---
name: Hybrid global candidate + per-slot filters
description: Scanner producerer pr. slot egne eligibleSignals. Første slot med eligible vælger ÉT globalt kandidat-symbol+side. Øvrige slots må kun handle samme symbol+side hvis det også er i deres egen eligible-pool (egne filtre respekteres).
type: feature
---
**Hybridmodel for fair exit-test:**

1. Scanner kører normalt pr. slot (hver slot evaluerer alle USDC-symboler mod egne filtre).
2. Slots itereres sekventielt. Første slot med ≥1 eligible signal vælger sit top-signal som `globalCandidate` (symbol+side).
3. Det vælgende slot `signalsToTrade` indsnævres til KUN det valgte symbol+side (kan ikke fall back til andet symbol).
4. Alle efterfølgende slots filtrerer deres egne `eligibleSignals` til kun det globale symbol+side. Hvis tomt → SLOT_REJECTED_GLOBAL_SIGNAL (egne filtre afviste).
5. Hvert slot bruger fortsat egne entry filters (hard/soft), egne exit settings, capital_percent, leverage, position_size_percent, slot_id.
6. Hvis ingen slot har eligible signaler → ingen position åbnes.

**Logs:**
- `GLOBAL_CANDIDATE_SELECTED | symbol=X | side=LONG/SHORT | chosen_by=SlotName | strength=N | total_active_slots=N`
- `SLOT_ACCEPTED_GLOBAL_SIGNAL | slot=SlotName | symbol=X | side=...`
- `SLOT_REJECTED_GLOBAL_SIGNAL | slot=SlotName | global=X/side | reason=...`

**Per-slot duplicate protection bevares:** unique partial index `(user_id, slot_id, symbol) WHERE status IN ('OPEN','PENDING')` forhindrer samme slot i at åbne samme symbol to gange.

**Cross-slot parallelism bevares:** to slots må stadig holde samme symbol parallelt (hvis begge accepterer det globale signal).
