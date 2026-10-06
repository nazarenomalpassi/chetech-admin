# Release Checklist

No item below authorizes production writes or deployment. This worktree is shared with other blocks; do not commit unrelated edits or treat their in-progress checks as this block's completion evidence.

## Reproducibility and Recovery

- [ ] Record deployed application revision, lockfile digest, runtime/client/server versions and applied migration list; reconcile with GitHub and the intended release.
- [ ] Preserve current application artifact and rollback configuration; no secrets in the record.
- [ ] Run the private operational JSON export and verify both artifact/sidecar. Review all `not-deployed` tables after rollout.
- [ ] Complete the separate PostgreSQL archive + roles + Storage/config recovery rehearsal from backup-restore.md. A checksum, JSON export or archive listing alone does not pass this gate.
- [ ] Record isolated target identity and test a REP, parts, history, invoices/payments, stock, roles/RLS, sequences and sample Storage files.
- [ ] Parent reviews all additive schema contracts and portal/storefront compatibility; never infer historical acceptance, money or reservations.

## Automated Gates

Run separately from the intended final integrated worktree:

```powershell
npm run test -- src/app/api/backup src/features/products scripts/backup-cli.test.ts scripts/backup-restore-local.test.ts scripts/verify-backup-restore.test.ts
npm run test
npm run lint
npm run typecheck
npm run build
git diff --check
```

- [ ] Require exit code 0 for the integrated checks and attach a dated result summary. Repeat if another worker changed relevant files/dependencies.
- [ ] Audit the parent-coordinated SheetJS 0.20.3 dependency change; this block adds no dependency and retains the writer. Do not claim overall release security from a version change alone.
- [ ] Verify direct technician requests never fetch product costs. Keep private backup endpoints admin-only and no-store.
- [ ] Verify server product pagination actually uses the requested range/count, stable ID tie-breaking, and retains category/search/status/sort/page-size state.
- [ ] Test new/edit product dialogs, SKU generation, stock writes, delete/toggle errors and stock-reservation constraints against synthetic staging fixtures.
- [x] Restore the private application export into a new disposable local database without touching chetech_staging: 40 tables / 8,221 rows, exact IDs/counts/checksums, 68 covered FKs and zero orphans verified independently. This does not complete the full auth/Storage/sequence recovery gate.
- [x] Read-only local availability RPC tests pass for real reserved/available values and operations denial; product form retains physical stock, never free stock.

## Pilot and Rollback

- [ ] Use synthetic/anonymized data for previews. Never serve tmp/backups through previews, reports, screenshots or external hosting.
- [ ] Validate 360/390/430/768/1024/1366/1920 px, keyboard labels/focus, category dropdown (not a carousel), empty results, slow/offline navigation and browser history.
- [ ] Confirm changes do not imply full-catalog counts from one product page; page-local stock/active metrics are explicitly labeled.
- [ ] Measure list payload, network/server/render duration on the workshop PC and two phones before/after, with a realistic catalog.
- [ ] Obtain operational acceptance for the small pilot; owner authorizes deployment in a separate step.
- [ ] Roll back application code only if compatible with the additive schema. Do not drop populated tables or overwrite cash/stock to hide discrepancies.
- [ ] On restore/export mismatch or cash/stock inconsistency, pause the affected operation, preserve artifacts/events privately and reconcile with the owner.
