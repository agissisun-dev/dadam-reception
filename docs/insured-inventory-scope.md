# Insurance-only inventory isolation (V17)

## Boundary

Only `insured` inventory belongs to clinic S or N. `medicine`, `topical`, `supply`, and `yakchim` remain shared and must have `clinic IS NULL`. A mapped authenticated account sees/writes its own insured items plus shared items. An unmapped/null account gets neither. Movements inherit visibility and insert scope from their referenced item; authenticated movement UPDATE and DELETE are always denied, including after a future permissive `auth_all` policy is added.

The migration replaces existing inventory policies and adds restrictive scope guards. Restrictive policies combine with permissive policies using AND, so another ordinary permissive policy cannot OR-bypass them. V17 also revokes TRUNCATE and TRIGGER on both inventory tables from PUBLIC, anon, and authenticated, because TRUNCATE bypasses RLS. Ordinary DML grants and owner/service privileges remain unchanged. The synthetic fixture deliberately grants those dangerous privileges before migration, then checks they are absent and direct authenticated TRUNCATE fails. This is an authenticated-client boundary, not protection against table owners, BYPASSRLS/service roles, or an administrator who changes restrictive policies/triggers.

## Migration behavior

`supabase/schema-v17-insured-inventory-scope.sql` includes V15 prerequisites and does not require V15 to have run: all five kinds, nullable `cabinet_items.clinic`, `unit NOT NULL DEFAULT '개'`, and positive-or-NULL `ledger_codes.per_day`. Existing ordinary items stay shared; there is no inferred clinic assignment. Adding the unit default supplies the same metadata default as V15, not a stock quantity.

- Every item's kind and clinic are immutable after creation, even before its first movement. Name, active flag and other ordinary fields remain editable within RLS scope. Correct erroneous classification through an explicitly reviewed administrative procedure, not the normal client.
- Non-NULL `ledger_codes.cabinet_item_id`: `extract` must target an insured item of the code's clinic; `cabinet` must target a shared noninsured item. Other groups cannot carry inventory targets. NULL aliases remain valid, including old extract/cabinet aliases.
- Non-NULL `ledger_items.cabinet_move_id`: `extract` must reference an insured item of the actual entry's clinic; `cabinet` must reference a shared noninsured item. A valid caller clinic alone is not sufficient. The relationship trigger reads real referenced rows under a fixed empty search path; entry rows are share-locked against concurrent clinic edits. Changing an entry's clinic cannot invalidate existing linked insurance inventory.
- No inventory consumption trigger is added. Existing client code owns deduction, so saving a ledger line must not consume stock a second time.
- No seeds, cloning, quantity changes, record repair, patient-data changes, or V12 changes. Strict `current_clinic()` and its grants are not changed.
- One transaction locks the five relevant tables, takes in-transaction fingerprints of every original item field (excluding only added clinic/unit) and every movement field, validates existing item scopes and code/movement relationships, installs constraints/policies/triggers, verifies unchanged fingerprints, then reloads the PostgREST schema cache. A mismatch raises `V17_INVENTORY_PRESERVATION_FAILED`. These fingerprints are captured after locking, so legitimate staff writes before the lock do not create false external-before/after failures. Invalid existing relationships raise `V17_INVALID_*` and abort the transaction. Invalid existing `per_day` values fail CHECK installation. Reruns replace the same named objects without business-row changes.

## Deployment preflight and limitations

The migration supports the pre-V15 schema. Before deployment, verify actual item kinds, policies, relationship compatibility, and existing metadata; a zero count on one UI tile is not a database preflight.

Parent-reported final live catalog review found only the item primary-key unique index on id, no global name uniqueness, and zero existing triggers on cabinet_items, cabinet_moves, ledger_codes, or ledger_items. Existing inventory constraints matched the old three-kind CHECK and movement kind/quantity/purpose checks plus item/patient foreign keys and primary keys, with no reported drift extras. These are parent-provided live observations, not queries executed by this implementation task. V17 does not silently remove unknown uniqueness or deduction triggers. Deployment still requires parent review of actual grants, relationship validity, and the final migration.

Apply V17 after existing strict clinic mapping and ledger schemas; do not reapply legacy V15/V11 afterwards because older policies/constraints could change this boundary. Deployment should run the whole file as a transaction and stop on any error. Never automatically repair blocked relationships or copy another clinic's inventory. Backup/production rollout and live RLS verification belong to the parent task.

## Offline regression runner

`scripts/test-insured-inventory.mjs` intentionally does not match `*.test.mjs`; it is a standalone native Node runner, not a Vitest suite. It creates an isolated in-memory PGlite database with entirely synthetic S/N/unmapped identities and rows, applies the actual V17 SQL, and closes the database. It makes no network requests.

Use an already available PGlite module, with `PGLITE_MODULE` set to its `file:///.../dist/index.js` URL, or use an existing installed `@electric-sql/pglite`. No install is required or performed. `INSURED_PROJECT_ROOT` is optional; otherwise the root is derived from the runner location.

PowerShell from the account working directory, using the existing portable runtime:

```powershell
$env:PGLITE_MODULE = 'file:///C:/path/to/pglite/dist/index.js'
& node --preserve-symlinks --preserve-symlinks-main scripts/test-insured-inventory.mjs
```

Verified run: **34 passed, 0 failed**, PGlite 0.5.16, portable Node 24.22.3. Earlier first run had 30 passes and 3 assertion-message mismatches because restrictive RLS rejected malformed items before CHECK constraints; expectations were corrected. Only executed assertions are counted.

Coverage: V15-absent migration; preserved old items/unlinked aliases; independent same-name S/N insured items; all four shared categories; direct foreign `in/out/count/discard` denied for both clinics while own movements succeed; unmapped/null denial; immutable classification and editable names; positive per_day; code and movement FK foreign/wrong-kind rejection; linked entry-clinic mutation rejection; malicious future permissive policy; append-only movements; rerun with no business-row changes; unchanged strict mapping function; no automatic deductions; transaction rollback without record repair for invalid existing item/code/movement relationships.

This is synthetic PostgreSQL/WASM regression evidence, not live Supabase/PostgREST evidence. The fixture models relevant schema and RLS, not every deployed column/extension/privilege. Multi-connection concurrency and live UI/client behavior are not tested by this runner.
