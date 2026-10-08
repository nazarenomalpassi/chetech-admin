# CHETECH: minimal operational interface

Authorized scope: implement the complete UI/UX plan and publish to production.

## Design contract

- Preserve the existing CHETECH logo, brand fonts and graphite identity. Use locally hosted Source Sans 3 for operational text and numbers; keep the original brand assets.
- Flat light surfaces, one quiet border, consistent 8-12px control / 12-16px panel radii.
- Practical readable type; 16px mobile fields, comfortable 44px touch targets.
- Primary work visible; rare administrative actions secondary. No decorative page entrances.
- Keep contextual searches, complete REP references, month-to-date defaults and current workflows.
- Keep technical updates in the order list and the concise complete intake sheet.
- Preserve database, authentication, accounting rules, payments, stock and numbering.

## Coverage and acceptance

| Area | Deliverable | Verification |
| --- | --- | --- |
| Shared UI | Tokens, buttons, controls, badges, metrics, tables, dialogs, loading, errors | Component interactions, keyboard, contrast and rendered screenshots |
| Navigation | Compact left sidebar, clear names, mobile section indicator, skip link | Desktop/tablet/mobile navigation and current section |
| Repairs | List, intake, quick work, detail, parts, customer decisions, delivery, documents | Search drafts, status selection, complete REP, same-list save, synthetic workflow |
| Commerce | Products, sales, expenses, TV boards and release actions | Combined filters, modal editing, collection splits, row actions |
| Operations | Visits, third-party repairs, repair payments | Linked order, dates, follow-up and visible payment methods |
| Finance | Dashboard, reports, cash, transfers, salaries, installments, replenishment | Period labels, available/pending distinction, unchanged financial regression tests |
| Remaining UI | Configuration, login, access denied, fiscal readiness, documents | Locked cash base, manual fiscal opt-in, PDF/print, recovery states |
| Responsive | 360, 390, 768, 1024, 1366, 1920px, text enlargement | No document overflow, readable identifiers/amounts, touch/keyboard usability |
| Publishing | Reviewed commit, GitHub merge, Vercel production | Successful checks and production deployment mapped to final commit |

## Execution

1. Inspect clean production source and prepare isolated branch.
2. Implement shared system while independent module owners adapt their files.
3. Review the complete diff against this matrix; repair omissions and regressions.
4. Run local staging browser checks, appropriate interaction/regression tests, lint, types and production build.
5. Obtain an independent code review, integrate, publish and verify the canonical URL.

## Evidence

Record final screenshots, test results, coverage limitations and deployment identity in
`docs/audits/2026-10-08-minimal-ui-system.md` after verification. Browser emulation
does not claim a physical iPhone test.
