# Agent tool (fork)

Lets an AI agent use the calculator and optimizer on an exported backup, without the browser.
User-facing instructions: [AGENTS.md](../AGENTS.md). This page is for maintainers.

## Pieces

| File | Role |
|---|---|
| `scripts/agent-host.mjs` | Loads `src/agent/commands.ts` in Node through Vite's SSR module runner (same aliases/dynamic imports as the app). Shims: in-memory `localStorage`, `self` for the processor worker, console → stderr. |
| `scripts/agent.mjs` | CLI: `<command> --arg value`, one JSON object on stdout. |
| `scripts/agent-mcp.mjs` | Minimal stdio MCP server (JSON-RPC: initialize, tools/list, tools/call), tools `tacet_forge_<command>`; calls are serialized. |
| `src/agent/commands.ts` | Commands, argument schema (`describe`), JSON errors (`AgentError`). Imports a backup with `applyImportedDatabase` (same validation/migrations as the app) into fresh Pinia stores; `apply` exports the stores to a new file. |
| `src/agent/optimizerContext.ts` | The `optimizerContext` that `Calculator.vue` `handleOptimize` builds, from `buildCharacterCalculationContext`. |
| `src/agent/optimizerInputs.ts` | The arguments `OptimizerWorkspaceSetup.vue` emits (set passive and main echo buff stats). |
| `src/agent/teamRotation.ts` | `team-rotation`, `rotations`, `frames`: wraps `calcTeamRotationDamage` (damage + frame timing), `rotationDpsReadings`, `calcFrameTimeline`, `buildTimelineStrip`; members get the derived calculator state, and echo actions without an echo get the slot's main echo (as the Teams page does when adding one). |
| `src/agent/calculatorState.ts` | What the calculator saves when it renders a character (`echoSetBonus`, slot-1 `mainEcho`, always-on main echo buffs). A backup may lack it, and `apply` changes echoes, so it is derived before calculating. |

The optimizer runs the app's unmodified `processor.worker.ts` in-process (generator loop from
`generateLoadouts`, batches, global top-N with the same dedupe), so results equal the app's.

## Accuracy checks

- `tests/agent/optimizerInputs.parity.test.ts` renders the real optimizer screen and compares its
  emitted arguments with `optimizerInputs.ts`.
- `tests/agent/commands.test.ts` runs the commands on `tests/fixtures/agent/backup.json` (synthetic):
  applying the best loadout and recomputing damage must equal the optimizer value; `apply` never
  touches the input.
- `team-rotation`: a one-character team equals that character's saved rotation in `damage`; a saved
  team equals the same actions given inline.
- Checked by hand against the app: same damage and same top-5 optimizer values (2026-11-25); the
  fixture's team gives the same totals and DPS on the Teams page (2026-11-26).
- `scripts/agent.mjs batch` runs several commands in one process (start-up is most of a call).

After an upstream merge that touches the optimizer screen, `handleOptimize` or the calculator's
saved state, run `npx vitest run tests/agent`.
