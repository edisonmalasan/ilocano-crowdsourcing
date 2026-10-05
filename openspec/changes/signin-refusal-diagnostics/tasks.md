# Tasks

## 1. Sign-in refusal diagnostics

- [ ] 1.1 Add the optional `log` sink to `ResearcherSignInDeps` and emit one line per outcome (reason-qualified refusal, ordinal-qualified success) in `runResearcherSignIn`. Verify: unit tests over injected loggers prove all four reasons plus success each log exactly once with no credential, session, or secret in any line.
- [ ] 1.2 Pass a namespaced `console.info` sink from `signInAction`. Verify: wrapper test proves the action logs through without changing its refusal contract.
- [ ] 1.3 Run the full suite: `lint`, `format:check`, `typecheck`, `test:unit`, `test:dom`, `test:integration`, `build`. Verify: all exit 0 with counts read back.
- [ ] 1.4 Run a can-fire probe on the logging (sink removed/no-op) with a green control and byte-identical restore. Verify: the probe fires red.
- [ ] 1.5 Update `docs/ROADMAP.md` Project Status rows for the Apply and verify `ledger-integrity` passes.
