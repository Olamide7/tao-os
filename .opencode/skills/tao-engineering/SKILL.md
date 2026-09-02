---
name: tao-engineering
description: "Use when building or modifying TAO — enforces next-action, verification, local-first, and deterministic rules. Triggers on TAO projects, features, refactors, or persistence changes."
---

# TAO Engineering

Operational rules for TAO — local-first Personal Operating System. Every active project has one next physical action.

## Trigger
Use when implementing, modifying, or reviewing TAO features, data models, persistence, or planning logic.

## Rules

1. **Next-action invariant:** Every active project has exactly one primary next physical action. Reject active without it.

2. **Verification before done:** Never declare complete without verification — run build + manual check. If tests/typecheck/lint exist, run them.

3. **Inspect before change:** Read `src/lib/store.js`, `src/lib/planning.js`, `src/lib/ai.js`, `src/main.js`, `index.html` before modifying architecture.

4. **Reuse first:** Reuse `TAOStore` (`src/lib/store.js:1`), `planning.js` scoring, `ai.js` provider abstraction before creating new abstractions.

5. **Minimal coherent:** Prefer smallest change that satisfies the requirement end-to-end.

6. **No scope creep:** Do not expand scope during implementation. Park extras as ideas (Idea Vault).

7. **Preserve data:** Maintain `tao.v1` localStorage compatibility. Migrate, don't wipe. Test export/import round-trip.

8. **No AI dependency for core:** Core flows (next-action, scoring, memory) must work with `mock` provider offline.

9. **Replaceable AI:** AI providers remain swappable via `src/lib/ai.js:1` interface. Never hardcode a single provider.

10. **Deterministic first:** Prefer deterministic logic where AI adds no meaningful value (scoring, weekly analysis, enforcement).

11. **State completeness:** Every feature handles loading / empty / error / success states.

12. **Automated verification:** Every significant feature gets automated verification (test or build-time check).

13. **Test behavior:** Test observable behavior, not implementation details.

14. **No needless rewrite:** Do not rewrite working code without evidence of necessity.

15. **Full check before complete:** Run relevant tests, typecheck, lint, and `npm run build`. All must pass.

16. **Fix before report:** If any check fails, diagnose and fix before reporting completion.

17. **Record decisions:** Log architectural choices in Decision Journal / ADRs, don't silently change them.

## Verification template
```
npm run build
# + any of: npm test, tsc --noEmit, eslint
# + manual: create active project without nextAction → must reject
# + manual: offline mock provider → core still works
```
