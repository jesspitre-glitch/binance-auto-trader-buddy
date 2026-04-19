---
name: Slot-uafhængig master scan (ingen gating)
description: Hver strategy slot evaluerer ALLE USDC-symboler uafhængigt mod sine egne filtre. Markedsdata deles via klinesCache, men ingen master slot gater hvilke symboler andre slots må se.
type: constraint
---
**DO NOT re-introduce master scan pool gating.**

Tidligere arkitektur lod én "master slot" producere top-N kvalificerede kandidater, og alle andre slots måtte kun evaluere disse symboler. Det betød at hvis master slot havde meget restriktive filtre (fx S2's StochRSI hard filter blokerede 97%), så fik ingen andre slots nogensinde lov til at handle.

**Nuværende arkitektur (auto-trade-quant):**
- Markedsdata (klines) hentes ÉN gang pr. cyklus via shared `klinesCache`
- HVER aktiv slot itererer over hele USDC-symbol-poolen og evaluerer mod sine egne filtre
- Ingen `master_scan_slot_id` gating, ingen `masterCandidateSymbols` filter
- `trading_session.master_scan_slot_id` ignoreres af scanner-koden (kolonnen findes stadig men bruges ikke)

**Hvorfor:** Brugeren vil have at alle slots får fuld eksponering for markedet, så strategier kan sammenlignes ærligt på deres EGNE filtre — ikke filtreret gennem en enkelt master slot.
