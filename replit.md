# PPE Lifecycle Tracker

PPE control-room software for tracking employee equipment lifecycle, inspections, replacements, and subcenter PPR requirements.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/ppe-lifecycle-tracker/src/App.tsx` — routes, local store, dashboard, register, requirements, person detail, and settings screens
- `artifacts/ppe-lifecycle-tracker/src/data.ts` — PPE rule definitions and workbook-to-app normalization
- `artifacts/ppe-lifecycle-tracker/src/data/sourceData.json` — normalized records imported from the supplied workbook
- `artifacts/ppe-lifecycle-tracker/src/index.css` — shared visual theme and responsive layout

## Architecture decisions

- The first version is a client-side operational tool using localStorage so edits, status updates, and rule changes persist without requiring a separate service.
- Source workbook rows are normalized to the two requested skill profiles; the workbook's Climbing Helmet fields are presented as Helmet (WAH).
- Every PPE item required by a skill is materialized on each employee record. Blank, zero-quantity, Faulty, NOK/Nok, and Missing values are excluded from available stock.

## Product

- Dashboard shows overall coverage, open replacement actions, PPR units to source, and subcenter readiness.
- PPE register supports search, skill/subcenter/readiness filters, inline lifecycle editing, and CSV export.
- Requirements view groups PPR needs by subcenter and skill, supports gap-only filtering, and exports procurement CSV.
- Settings supports per-skill quantities, JSON snapshot import/export, and restoration to the supplied workbook snapshot.

## User preferences

No saved preferences.

## Gotchas

- Run the web artifact through its managed workflow so PORT and BASE_PATH are provided to Vite.
- The PPR calculation uses only status OK with quantity greater than zero as available stock.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
