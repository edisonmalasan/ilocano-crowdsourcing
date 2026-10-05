# Tasks

## 1. Success result plus client navigation

- [x] 1.1 Return `{ status: "authenticated" }` from `signInAction` instead of throwing `redirect()`; keep every refusal path byte-identical. Verify: wrapper test proves the success shape, the issued httpOnly cookie, and unchanged refusals.
- [x] 1.2 Navigate with `router.push(RESEARCHER_HOME)` on success in `SignInForm`; render refusal only on returned refusals; keep the latch and the generic transport-failure catch. Verify: DOM regression test proves correct credential → navigation to `/researcher` with no refusal message ever appearing.
- [x] 1.3 Run the full suite: `lint`, `format:check`, `typecheck`, `test:unit`, `test:dom`, `test:integration`, `build`. Verify: all exit 0 with counts read back.
- [x] 1.4 Run a can-fire probe (success branch removed/no-op navigation) with a green control and byte-identical restore. Verify: the probe fires red.
- [ ] 1.5 Verify the real sign-in flow in a browser against a local or preview deployment with a configured key. Verify: correct key navigates with no refusal flash; wrong key shows only the generic refusal.
- [x] 1.6 Update `docs/ROADMAP.md` Project Status rows for the Apply and verify `ledger-integrity` passes.
