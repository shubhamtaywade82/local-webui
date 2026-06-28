# local-webui Delivery Plan (v2)

This file is the execution tracker for `new_features_plan.md`.

## 1) Status Board

### Slice A - Trading Safety Gate

Status: completed

Delivered:

- `PLACE_ORDER` policy utility in `@workspace/coindcx-client`
- Guard in execution engine create-order flow
- Guard in `coindcx_futures` `create_order`
- Tests for policy and futures tool behavior

Acceptance:

- create-order denied when `PLACE_ORDER` is unset or falsey.

### Slice B - Private CoinDCX Stream Join

Status: completed

Delivered:

- Private `coindcx` join in shared market stream when keys are present
- Opt-out via `COINDCX_PRIVATE_STREAM`

Acceptance:

- server runs safely with or without private stream enablement.

### Slice C - Chat Output Hygiene

Status: planned

Deliver:

- harden stream parser to avoid leaked `<tool>/<path>/<content>` blocks.

Acceptance:

- malformed tool-like output does not appear in final chat text.

### Slice D - Tool Contract Alignment

Status: planned

Deliver:

- align tool-failure contracts and error payloads across runtime paths.

Acceptance:

- invalid tool payloads fail closed with consistent error messages.

### Slice E - Authenticated Trading Surface

Status: planned

Deliver:

- account-state endpoints/UI (positions, open orders) for authenticated workflows.

Acceptance:

- authenticated visibility improves without weakening execution safeguards.

## 2) Verification Requirements Per Slice

- Unit tests for new parser/guard/policy logic.
- Integration tests for changed routes or WS behavior.
- Typecheck and lint for touched apps/packages.
- Build remains green for touched scope.

Suggested baseline commands:

- `pnpm --filter @workspace/coindcx-client test`
- `pnpm --filter @workspace/tools test`
- `pnpm exec tsc --noEmit -p apps/server`

## 3) Rollout Rules

- Keep side effects opt-in by env policy.
- Preserve current successful user flows while hardening edge cases.
- Add observability with each reliability slice.

## 4) Open Risks

- Model output variability can still produce malformed structures.
- Upstream network/API instability can appear as app regressions.
- Authenticated UX expansion risks crossing safety boundaries if not isolated.

Mitigation:

- fail-closed parser design, env policy gates, targeted tests, structured logs.

## 5) Done Criteria for v2

- planned slices delivered or explicitly descoped,
- no internal control-markup leakage in chat output,
- policy guards remain default-safe,
- tests/lint/typecheck/build pass for implemented slices.
