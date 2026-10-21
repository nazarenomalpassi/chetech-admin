# Warranty return pickup fix

Root cause: `private.workshop_warranty_save` required the previously persisted return status to be ready/no-fault/unsolved. The form exposed pickup from any active status, so a submitted resolution and confirmed recipient were incorrectly rejected when the stored return remained in repair.

The existing atomic RPC now accepts pickup directly when a submitted or saved resolution has at least three trimmed characters. A prior terminal review status remains valid for backward compatibility. Recipient, administrative permission, version locking, receipt replay, already-closed protection and original-order isolation are unchanged. No intermediate ready status or additional financial operation is introduced.

The form marks the resolution required when needed and labels the final action Registrar retiro de garantia. Failed submissions preserve the draft.

Verification:
- Reproduced the exact database error before the migration and a failing form regression before UI edits.
- 1102 unit/component tests passed; 69 opt-in tests skipped.
- Production build (including TypeScript) and scoped ESLint passed.
- Real PostgreSQL rollback-only tests passed from all seven active statuses, with role/recipient/resolution/version/replay/closed guards and unchanged original order, payments, cash and settings.
- Authenticated mobile browser test passed: in-repair resolution + pickup in one submission, history, same original row, no-fault baseline, responsive widths and no runtime errors.
- Independent review found no P1/P2 defects.
- Migration 20261021154620 applied successfully. Before/after hashes of all 20 nonempty checked relations, including warranty returns, matched. No real return was closed or edited by the release.

The broader browser test refreshes its unrelated no-fault baseline between two distinct order actions; the reported warranty pickup flow does not require a reload or intermediate save. Physical iPhone/Safari was not tested.
