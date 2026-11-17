# V18 materials clinic boundary

## Scope and application

Apply `supabase/schema-v18-materials-clinic.sql` after V17, using a migration owner. V14 supply tables are optional: V18 creates their complete base shape when absent. V18 is transactionally rerunnable. It takes short table locks, with a 5-second lock timeout and 30-second per-statement timeout. A preflight or preservation failure must be investigated, not repaired by assigning stock. Do not rerun V17 after V18: its older classification contract deliberately rejects private supplies.

Only SQL, this document and `scripts/test-materials-clinic.mjs` belong to this change. No live database, browser, network, records, credentials or environment secrets were accessed. Authentication persistence and frontend behavior belong to separate work. `current_clinic()` and the existing service API caller's S clinic behavior are unchanged.

## Catalog and stock contracts

- `cabinet_items.legacy_shared boolean NOT NULL DEFAULT false` marks old `kind='supply', clinic IS NULL` rows as read-only archives. Their IDs, name, clinic, unit, active state and all other original fields remain unchanged. Both mapped clinics can read archive items and movements. No new movement, item update, deletion or new code link can use an archive.
- `legacy_source_id bigint NULL` is a self-FK. Unique `(legacy_source_id, clinic)` makes catalog cloning idempotent. A non-null source must reference an archived shared supply. Clients cannot forge `legacy_shared`; kind, clinic, legacy flag and source are immutable after creation.
- Each old shared supply gets one S and one N catalog-only clone, preserving name/unit/minimum/active/sort. No movement, opening quantity, ownership allocation or duplication of existing stock occurs. Clones have **unknown/uninitialized stock**, not verified zero stock.
- Future `ledger_codes.cabinet_item_id` targets are remapped using the exact old source ID and the code's clinic, never a name match. All historical `ledger_items`, movements and entry clinics remain intact. Transaction checks compare original item fields plus hashes of original items, movements, ledger items and entries, and validate the exact expected code remap.
- New supplies require S/N clinic. Insurance remains S/N-private. Medicine, topical and yakchim remain shared with `clinic=NULL`. New yakchim creation is supported; no yakchim seed or duplicate is inserted by this migration.
- A private supply must receive an explicit `kind='count'` movement before any in/out/discard. Count quantity **0 is valid**. Initialization is derived from an existing COUNT, not a separate flag. The trigger locks the item row before checking, serializing movements and unit changes on that item. A rolled-back COUNT does not initialize stock.
- Inventory units are trimmed, nonempty and at most 20 characters. Staff can edit a unit only before **any** movement exists. An archived unit can never change. There is no conversion of quantities. Unit metadata does not add request quantity/unit columns: requests remain free text.

Actual old quantities and ownership must be checked privately before deployment. V18 does not hardcode live IDs, balances or ownership; it preserves every row found under its transaction locks.

## Requests, settings and policy boundaries

- `supply_requests.clinic` defaults strictly to `current_clinic()`, never S as a fallback. Existing rows keep their clinic and all fields. Request and settings clinics cannot be reassigned by UPDATE.
- `supply_settings` has primary key `(clinic,id)` with `id=1`. Existing shared V14 settings are migrated to S/N rows with the **same existing opaque PIN** to avoid lockout. No PIN value is displayed, logged or fetched from a real account. Absent settings initialize both clinics with NULL. Existing already-scoped rows are preserved.
- Client settings upserts must use conflict key `clinic,id`; client reads/writes must use their strict mapped clinic. The PIN remains the pre-existing UI convenience lock, not an authorization credential.
- All four tables use restrictive clinic guards, in addition to permissive policies, so a future permissive `FOR ALL USING(true)` cannot widen access. Unmapped/missing identities see and write nothing. Archive item mutation and movement update/delete remain restricted. Authenticated ordinary DML privileges remain available; TRUNCATE and TRIGGER privileges are revoked from PUBLIC, anon and authenticated on all four tables.
- Owner/service bypass of RLS is intentionally not portrayed as client isolation; server callers must continue providing their authorized clinic. Trigger validation still rejects invalid scope/link/classification/unit/archive mutations. This migration does not change server caller authentication.

## Ledger integration and operational limits

- New code/movement links accept own-clinic supply or own-clinic insured with the correct cabinet/extract group. Shared medicine/topical/yakchim links remain valid. Existing archive ledger links can keep unchanged move/entry/group references; entry clinic changes cannot invalidate them.
- Creating a new archive-linked correction or trying to return archive stock is blocked (`MATERIALS_LEGACY_LINK_REVIEW` / `MATERIALS_LEGACY_READ_ONLY`). Historical ledger corrections may need manual review. There is no invented stock return, compensation scheme or new atomic ledger rewrite.
- There are no automatic stock-deduction triggers. The client must prevalidate private initialization **before** ledger writes and surface initialization errors, not swallow them. Multiple browser/API calls are not made atomic by this schema.
- Significant errors: `MATERIALS_FIRST_COUNT_REQUIRED`, `MATERIALS_INVALID_UNIT`, `MATERIALS_UNIT_HAS_MOVEMENTS`, `MATERIALS_LEGACY_READ_ONLY`, `MATERIALS_LEGACY_FLAG_FORBIDDEN`, `MATERIALS_INVALID_SOURCE`, `INVENTORY_CLASSIFICATION_IMMUTABLE`, `INVENTORY_LINK_SCOPE_MISMATCH`, `INVENTORY_ENTRY_SCOPE_MISMATCH`, `MATERIALS_CLINIC_REQUIRED`, `MATERIALS_CLINIC_IMMUTABLE`. RLS may intentionally return no rows rather than throw on a forbidden UPDATE/DELETE; clients must check affected rows.
- Unknown item scope, malformed units, invalid source/code/history relationships or private movements without a COUNT fail preflight. The migration does not silently normalize old units, reallocate old quantities, repair inconsistent history or emit live stock assumptions.

## Offline validation

Run the native runner (intentionally not named `*.test.mjs`) with Node 24 and PGlite 0.5.16:

```powershell
$env:PGLITE_MODULE = 'file:///absolute/path/to/pglite-runtime/package/dist/index.js'
& 'path/to/node.exe' --preserve-symlinks --preserve-symlinks-main scripts/test-materials-clinic.mjs
```

The isolated synthetic fixture applies the actual V17 SQL before the actual V18 SQL. It contains 15 synthetic items, 51 synthetic movements and two historical ledger links, including duplicate supply labels to prove ID-based remapping. It tests absent V14 and existing V14 shared settings, preservation, empty clones, both clinics, unmapped/missing identities, COUNT-zero initialization and rollback, immutable classifications, unit editing/locking, source validation, private insurance, all three other shared kinds, ledger link guards, request/settings isolation, future permissive-policy attacks, DML/unsafe privileges, no deductions, rerun idempotence and atomic failure on bad existing links.

Actual latest execution: **28 passed, 0 failed** (PGlite isolated synthetic). This is not live deployment evidence. PGlite is single-session here: the row-lock design is present, but real multi-session lock contention, Supabase/PostgREST behavior and production concurrency were not exercised. No production migration was applied by this task.
