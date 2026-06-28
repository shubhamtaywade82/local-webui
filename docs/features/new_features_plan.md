# local-webui Consolidated Feature Plan

This plan maps directly to the TypeScript monorepo and replaces old Ruby-oriented planning content.

## 0) Scope and Principles

- Keep slices small and testable.
- Maintain backward compatibility for active user flows.
- Side effects must remain opt-in and fail-closed by default.
- Prefer deterministic server behavior over model-format assumptions.

## 1) Baseline Architecture

- Web app: `apps/web`
- API and streaming: `apps/server`
- Shared packages: `packages/*`
- Knowledge corpus: `knowledge/`

Critical code paths:

- Chat orchestration: `apps/server/src/routes/chat.ts`
- Agent loop: `packages/agent-runtime/runtime.ts`
- Tooling: `packages/tools/*`, `packages/agent-tools/*`
- Trading stream: `apps/server/src/services/marketStream.ts`
- Execution safety: `packages/execution-engine/*`

## 2) Epics (Dependency Ordered)

```text
E1 Chat Stream Robustness
E2 Tool Contract Hardening
E3 Retrieval Quality and RAG Reliability
E4 Trading Safety and Policy Gates
E5 Market Stream Resilience
E6 Authenticated Trading UX/API
E7 Observability and Recovery
E8 Test and CI Maturity
```

## 3) Epic Details

### E1 Chat Stream Robustness

Goal:

- Prevent malformed internal tool markup from reaching end users.

Scope:

- Stream parser hardening in non-agent path.
- Strict extraction for editable payloads.

Acceptance:

- malformed tool-style output is not rendered as final assistant response.

### E2 Tool Contract Hardening

Goal:

- Keep runtime tool behavior deterministic.

Scope:

- tighten schema validation and error contracts.
- align guard behavior across chat and agent paths.

Acceptance:

- invalid tool calls never cause side effects.

### E3 Retrieval Quality and RAG Reliability

Goal:

- Improve context relevance and troubleshooting clarity.

Scope:

- retrieval threshold tuning and diagnostics.
- ingestion-path reliability checks.

Acceptance:

- retrieval remains stable across ingest/restart cycles.

### E4 Trading Safety and Policy Gates

Goal:

- Keep live order creation explicitly opt-in.

Scope:

- preserve/extend `PLACE_ORDER` checks for all create-order entry points.
- document and test deny-by-default behavior.

Acceptance:

- create-order attempts are denied when policy is not enabled.

### E5 Market Stream Resilience

Goal:

- Maintain pulse continuity despite upstream instability.

Scope:

- stale-stream detection improvements.
- reconnect subscription integrity.
- fallback polling behavior verification.

Acceptance:

- pulse updates recover automatically after transient stream interruptions.

### E6 Authenticated Trading UX/API

Goal:

- Expose account data safely for authenticated workflows.

Scope:

- positions/open-orders summary endpoints and optional UI integration.
- strict handling for missing credentials.

Acceptance:

- authenticated account state is available without exposing secrets.

### E7 Observability and Recovery

Goal:

- Speed up issue diagnosis in production-like runs.

Scope:

- structured events for stream lifecycle, parser outcomes, and policy denials.
- better WS error payload consistency.

Acceptance:

- key failures are traceable from structured logs/events.

### E8 Test and CI Maturity

Goal:

- Reduce regressions in high-risk flows.

Scope:

- targeted unit and integration tests for chat stream, guards, and trading paths.
- keep test runtime practical for frequent local execution.

Acceptance:

- CI catches parser/guard regressions before release.

## 4) Milestones

### M1 Safety and Contracts

- E2 + E4

### M2 Stream Stability

- E1 + E5

### M3 Retrieval and Observability

- E3 + E7

### M4 Surface Expansion and Hardening

- E6 + E8

## 5) Risk Register

- Model-format drift in streamed output.
- Upstream provider instability (Ollama/CoinDCX).
- Accidental side effects from weakly-guarded tool paths.

Mitigation:

- strict parser/validator, env-based kill switches, and focused regression tests.

## 6) Definition of Done

Plan completion criteria:

- no leaked internal control markup in user-visible chat output,
- side-effect flows remain deny-by-default,
- market stream resiliency improvements are verified,
- tests/lint/typecheck/build pass for touched scope.
