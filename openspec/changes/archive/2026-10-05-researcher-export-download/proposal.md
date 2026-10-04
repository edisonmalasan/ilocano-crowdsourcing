# Proposal

## Why

Researchers currently review coverage in the protected `/researcher` dashboard but can only obtain the research corpus through `pnpm run export:research` on an operator machine. An authenticated researcher downloading the same export from the dashboard removes the operator round-trip while keeping every existing guarantee: authorization-gated access, server-only credentials, and one shared derivation.

## What Changes

- Add an "Export research data" action to the authenticated researcher dashboard that downloads one dated ZIP containing the existing five artifacts (`validations.json`, `validations.csv`, `summary.json`, `validated-dataset.json`, `validated-dataset.csv`).
- Serve the download from an explicit server-side route that re-verifies the signed researcher session for the export request itself; layout-group coverage alone is not the authorization.
- Build the ZIP from the existing export derivation (`renderDocuments`/`collectExportSources` path and the `ExportSources` read-only picks); no second export algorithm. Web export and CLI export produce equivalent contents from the same database state.
- Keep `pnpm run export:research` as the operator/backup path, unchanged in behavior.
- Add `fflate` (zero-dependency) as the ZIP implementation; no other new production dependency.
- Export stays read-only: no research-data mutation, no public endpoint, no credential reaches the browser, mechanical-candidate / `needs_review` / adjudication semantics unchanged.
- Polish the researcher dashboard presentation within the incumbent soft neo-brutalist idiom (hierarchy, spacing, export section); all figures, copy meanings, and routes unchanged.

## Capabilities

### New Capabilities

- `researcher-export-download`: authenticated dashboard ZIP download of the research export.

### Modified Capabilities

- `research-export`: the CLI-only restriction is lifted for one authenticated HTTP download path; web and CLI exports must be content-equivalent from the same state.
- `researcher-dashboard`: dashboard gains the export action and its presentation is refined; figures and meanings unchanged.
- `researcher-admin-access`: the export request carries its own explicit session verification; refusal behavior unchanged.
- `consistency-guards`: the web export joins the cross-consumer agreement as a fourth reader of the same builders.

## Impact

- New route file under `src/app/researcher/(protected)/` plus a thin core module; closed test enumerations that pin group files, `getAdminEnv` readers, and route witnesses must be extended honestly.
- `package.json` + `pnpm-lock.yaml` gain `fflate`.
- No migration, no schema change, no dataset change, no archived-history rewrite.
