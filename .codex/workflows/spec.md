<!-- input: requirement, proposal, design, or change-framing requests plus repository context -->
<!-- output: a routed spec entry workflow that resolves into Quick or BMM -->
<!-- pos: spec entrypoint for the local Codex layer -->
# Spec Workflow

Use this entry workflow for requirement discovery, proposal shaping, spec-first requests, and change framing.

`spec.md` is an entry semantic, not an execution mode.

Every request that starts here must still resolve into either:

- `.codex/workflows/quick.md`
- `.codex/workflows/bmm.md`

Default landing mode:

- `bmm.md`

Compression rule:

- if the request is already well-framed, has deterministic inputs and outputs, and fits one coherent WBS-style Level 3 milestone with one dominant validation story, `spec.md` may resolve into `quick.md`

## What To Do

1. Inspect the current code, docs, and any existing change record before deciding the landing mode.
2. Read `.codex/workflows/router.md` and classify the request as a `spec` entry.
3. Default to `bmm.md` when the request still needs discovery, proposal framing, architecture choices, or more than one milestone.
4. Route to `quick.md` only when the work is already implementation-ready and can stay inside one managed Level 3 milestone.
5. Apply the shared internal rules from:
   - `.codex/core/harness.md`
   - `.codex/core/wbs-planning.md`
   - `.codex/core/work-breakdown.md`
   - `.codex/core/task-sizing.md`
   - `.codex/core/milestone-design.md`
   - `.codex/core/validation-matrix.md`
   - `.codex/core/closeout-loop.md`
   - `.codex/core/adr-rules.md`
   - `.codex/core/openspec-sync.md`
6. Prefer new change records under `openspec/changes/{change-name}/` when the routed work needs one.
7. If the task already has a coherent legacy folder under `_bmad-output/changes/{change-name}/`, keep that record accurate rather than splitting the truth source mid-task.
8. Use `.codex/core/milestone-design.md` as the shared layer to define and manage milestone-level execution slices instead of leaving the spec as one large planning block.
9. Keep milestone validation, ADR, and closeout expectations explicit in the change record or milestone notes.

## Hard Rule

`spec.md` does not create a third mode.

It is the entry workflow for spec-shaped requests, and it must resolve into `Quick` or `BMM` before implementation expands.
