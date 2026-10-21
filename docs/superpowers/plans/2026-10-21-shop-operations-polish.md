# CHETECH: operational UX and board settlement

## Scope and invariants
- Keep authentication, immutable cash base, existing ledger, stock/SKU and historic sales unchanged.
- Keep top dashboard KPIs visible; collapse secondary dashboard content accessibly.
- Simplify repairs: explicit warranty in quick/full editors, one budget approval checkbox, preserve authorization and warranty reentry history.
- Simplify visits, compact product list, practical next actions in Pedidos. No automatic purchasing or fiscal issuance.
- Keep salary allocation visible. Make reports useful with real range-consistent data and secondary quality disclosures.
- Future board release asks NX Santi/NX Local and atomically creates one numbered sale, one payment and one cash receipt from the ML net. No historical backfill, inventory consumption or assumed profit for unknown costs.
- Prepare six offline PDF design proposals using real branding. No automatic WhatsApp or production document replacement.

## Implementation checkpoints
1. Read source/schema, current skills and official sources; assign disjoint module scopes.
2. Write failing regression tests before each implementation.
3. Implement module UX with bounded data, accessible controls, pending/error handling and mobile layouts.
4. Add additive settlement migration and real SQL tests for idempotency, races, rollback, permissions, immutable projections and unchanged history.
5. Verify full unit tests, lint, types, production build, synthetic authenticated flows and responsive browser checks; independent code review and repairs.
6. Capture production preservation fingerprints, apply verified additive migration, compare fingerprints without business writes.
7. Commit scoped changes, PR, preview checks, merge exact SHA and verify canonical Vercel production readiness.
8. Deliver production summary plus rendered/verified offline PDF alternatives, explicitly noting untested physical iPhone behavior.

## Document details
CHETECH; Independencia 784; Rio Tercero; phone 3571544683; Atendido por: Nazareno Malpassi.
Two alternatives each: invoice model, repair warranty and device intake receipt. Blank customer/fiscal fields and explicit proposal/invalid-for-fiscal-use markings.
