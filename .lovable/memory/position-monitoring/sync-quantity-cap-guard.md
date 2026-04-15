---
name: Sync quantity cap guard
description: sync-binance-futures-positions capper nye positioners quantity til slot-maximum i stedet for at bruge Binances aggregerede positionAmt
type: feature
---
Binances positionAmt er aggregeret på tværs af ALLE slots for et symbol. Sync-funktionen bruger nu `calculateMaxExpectedSlotQuantity()` med `SLOT_QUANTITY_TOLERANCE_MULTIPLIER` (1.25x) til at cappe quantity ved oprettelse af nye positioner. Dette forhindrer at en slot-position registreres med hele kontoens position-størrelse. Fejlen opstod fordi linje 516 brugte `absQuantity` direkte uden validering mod slot-konfigurationen.
