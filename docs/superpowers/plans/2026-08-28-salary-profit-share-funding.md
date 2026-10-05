# Salary Profit Share And Funding Plan

**Goal:** Extend the existing monthly salary liquidation with equal profit sharing after salary completion and an exact multi-account funding split.

**Architecture:** Keep `salary_members`, `salary_liquidations`, `app_settings`, `balance_transfers`, and `movimientos_caja`. Add normalized liquidation member and funding detail tables. Member detail records what each person earns; funding detail records where the money came from. Only funding rows create cash movements, so account balances are deducted exactly once.

### Task 1: Monetary model

- [ ] Change the calculator input to the amount of the current withdrawal.
- [ ] Fill remaining monthly salary proportionally before any profit share.
- [ ] Split the current profit share equally between active members using cent-safe largest remainders.
- [ ] Validate exact account funding and account balance limits in pure tests.

### Task 2: Database extension

- [ ] Add salary, profit-share, total, withdrawal date, and salary-mass snapshots to liquidation headers.
- [ ] Add `salary_liquidation_members` and `salary_liquidation_funding` with RLS and indexes.
- [ ] Backfill details for any legacy salary liquidation without duplicating cash movements.
- [ ] Replace the confirmation RPC with an advisory lock, idempotency, stale-plan validation, account-balance validation, and one cash movement per funding account.
- [ ] Extend the read RPC with member history and funding origin.

### Task 3: Application flow

- [ ] Update data types and RPC mapping.
- [ ] Replace per-person account selection with exact account funding inputs.
- [ ] Show profit share and final total per member.
- [ ] Disable confirmation while funding differs, exceeds balances, or submission is pending.
- [ ] Show full liquidation history separately from extraordinary withdrawals.

### Task 4: Verification and release

- [ ] Run required salary/profit-share/funding tests and the complete suite.
- [ ] Run typecheck, lint, production build, RLS/security checks, and no-write production verification.
- [ ] Deploy to Vercel and verify protected production routes.
