# HAR Loop-In — TM1 Cube Viewer "Replace-PAW" Program

**From:** Head of AI Resources
**To:** MC; `tm1-architect` (roadmap author); CTO chain (build owners)
**Date:** 2026-06-04
**Re:** Fleet / skill / knowledge / doctrine readiness for escalating the Slice & Dice (TM1) cube viewer from PAW-lite prototype to a multi-phase "replace PAW for most finance users" program.
**Source brief:** `PAW-parity-and-journey.md` (§0a locked decisions, §2 Reka bug family, §6–§10).

**Constraint honoured:** this memo **proposes**. Nothing here is applied. The one doctrine change I recommend (§3 below) is flagged as requiring a `fleet-verifier` `SCAN-COMPLETE` before it lands, per §14a.

---

## TL;DR — four verdicts

1. **Fleet readiness: SUFFICIENT for Phase 1 (read-grade). No new agent, no new skill, no new knowledge base warranted now.** The existing TM1 pair + dev specialists + skills cover the whole read-grade surface. Re-evaluate at the Phase 2 (writeback) gate, not before.
2. **PAW end-user navigation stays end-user docs/runbook, NOT an agent skill.** Confirmed on the record. The trigger surface is already covered by `tm1-development` ref `08-paw-navigation.md` for *agents*; an end-user runbook is a different audience and a different artefact.
3. **One genuine doctrine gap to fix** — and it is a direct recurrence of the 2026-05-26 incident, now proven to repeat on a whole *class* of component (KSelect/KToggle/KCheckbox all dead in prod, all green in tests). I recommend amending the `klikk-frontend-verification` skill to require a **mount-based v-model round-trip test, mutation-verified, for any reka-ui wrapper primitive**. Exact change drafted in §3. **Requires `fleet-verifier` SCAN-COMPLETE.**
4. **Model policy: no deviation.** All-opus-except-junior-dev holds for every agent on this program. Rationale in §4.

---

## 1. Fleet readiness for a sustained read+writeback "replace-PAW" build

I assessed the program against the locked phasing (§0a: Phase 1 = PAW-grade read; Phase 2 = writeback, separately risk-reviewed) and mapped each capability in §7 to an existing seat.

### Phase 1 (read-grade) — fully covered by the existing fleet

| §7 capability | Owning seat | Skill backing | New asset needed? |
|---|---|---|---|
| n-dimensional axis model (nested rows+cols, measure-as-axis) | `tm1-architect` designs the MDX axis model; `frontend-dev` renders the grid | `tm1-development` (04-mdx), `klikk-tm1-integration` (05-read-path) | No |
| Calculated members (MDX `WITH MEMBER/SET`) | `tm1-architect` (strategy) → `tm1-developer` (MDX) or `frontend-dev` (client calc) | `tm1-development` (04-mdx) | No |
| Named/dynamic subsets + MDX authoring + Save-as (needs a subset **write** endpoint) | `tm1-architect` (contract) → `integration-engineer` (DRF write endpoint, MDX-injection defence) | `klikk-tm1-integration` (05-read-path §1, reflex #11 no-user-MDX) | No |
| Set-editor-as-hierarchy-tree | `frontend-dev` (reuse source-tree renderer) | `klikk-design-language` | No |
| Conditional formatting / heatmaps, Excel export | `frontend-dev` | `klikk-design-language` | No |
| Async/paged MDX + Stargate cache reuse at scale | `tm1-architect` (design) → `integration-engineer` (cellset hygiene, async mode) | `tm1-development` (03-tm1py, 04-mdx), `klikk-tm1-integration` (reflex #5, #12) | No |
| Frontend verification of every shipped slice | `frontend-verifier` (mandatory before CTO GO) | `klikk-frontend-verification` | No (but see §3 — the skill needs one amendment) |

**The orchestration spine is already correct and documented** (brief §10.2): `tm1-architect` owns the n-dim axis model + calc strategy + subset-write design + async/paging + the writeback decision; he directs `tm1-developer` (TI/rules/MDX) and co-ordinates `integration-engineer` (REST resilience, the Django bridge) + `frontend-dev` (Vue grid). The architect↔developer↔integration-engineer boundary is settled doctrine (AGENT_FLEET decision #40, reciprocal note added to `integration-engineer.md` 2026-06-03): TM1-pair owns inside-TM1, integration-engineer owns the `apps/planning_analytics/` bridge, they meet at the data contract. This is exactly the split a sustained build needs — no gap, no collision.

### Phase 2 (writeback) — re-evaluate at the gate, do NOT pre-build

Writeback (sandboxes / cellset PUT / commit / spreading) is the §7 "XL / scope fork" item and pulls in a hard POPIA + financial-integrity (CCO) gate per §0a.2. **Fleet implication: still no new agent.** The seats that own it already exist:

- `integration-engineer` owns the writeback client code (cellset PUT, idempotency — `klikk-tm1-integration` reflex #7, optimistic-lock handling).
- `tm1-architect` owns the sandbox/commit/spreading **model** decision (and the existing locked decision is *no sandboxes, single shared base, last-write-wins* — `klikk-tm1-integration` project-decisions table; writeback-in-Klikk forces that to be **re-opened**, which is an architect call).
- `cco` / `privacy-officer` own the sub-processor + §72 + financial-integrity gate (`klikk-tm1-integration` reflex #3, #4).

What I will watch for at the Phase 2 gate, and only then decide on a new asset: if writeback-conflict handling, spreading semantics, and sandbox-vs-base-cube governance become a **durable, non-obvious body of project knowledge** that the existing skills don't carry, that is a *skill* candidate (a `klikk-tm1-integration` reference page, most likely — not a new skill, and not an agent). Today that knowledge is one paragraph in the project-decisions table; it is not skill-sized yet. **Disciplined call: defer.**

### Why no new agent — explicitly

I am holding the "do not invent assets for their own sake" line. A new agent earns its place only when there is (a) a durable scope no existing seat owns, AND (b) a routing surface that would otherwise collide. Neither is true here. "Replace PAW" is a large program, but it is a large program **across seats that already exist with correct boundaries**. Spinning up a "tm1-reporting-engineer" or similar would create a routing collision with `frontend-dev` (the grid), `integration-engineer` (the bridge), and `tm1-developer` (the MDX) — three seats that already own the three pieces. That is fleet sprawl, not capability.

---

## 2. Confirmed on the record: PAW navigation = end-user runbook, NOT an agent skill

**Confirmed.** This was decided correctly before, and the escalation to "replace PAW" does not change it. Two distinct artefacts, two distinct audiences:

- **Agent-facing PAW navigation** already exists and is sufficient: `tm1-development` skill reference `08-paw-navigation.md` (home/Quick Launch, Books/Sheets/Views, cube viewer, Set Editor, spreading operators, sandboxes, modelling workbench, Trace Feeders, "where did X go" legacy→new). Agents that need to reason about PAW behaviour to *build a replica* load this. That is the right home for it.
- **End-user PAW navigation** (the finance team learning to drive PAW, per brief §5.1) is a **runbook / docs** for humans — a different audience, a different register, not loaded into an agent's context. A runbook scope already exists.

A skill is policy-or-reference-for-agents. End-user how-to docs are neither. Creating a skill for end-user PAW navigation would be the "skill for its own sake" anti-pattern — it would never be triggered by an agent doing agent work, and it would bloat the trigger surface. **No skill. The runbook is the right vehicle.**

(Sharpening note for the record: the *escalation* to "replace PAW for most users" slightly *reduces* the end-user PAW-runbook's eventual scope — if the Klikk viewer becomes the primary surface, the finance team will need a **Klikk-viewer** runbook more than a PAW one. That is a CDO/docs concern for later, not a fleet asset, and not actionable now.)

---

## 3. Doctrine gap to fix — reka-ui primitive v-model round-trip (the important one)

### The mechanism (why this is not "already covered")

The 2026-05-26 KTable incident produced the `klikk-frontend-verification` skill, whose §3 already requires "mount-based spec that asserts observable DOM" for "each changed component that is a KTable consumer (or other shared primitive)". **That requirement was in place and the bug class still shipped.** KSelect, KToggle, and KCheckbox were all dead in production — alias picker blank, suppress-zeros inert, member checkboxes unselectable — because the reka-ui wrappers used the obsolete radix `:checked`/`@update:checked`/`undefined` API instead of reka-ui 2.9.8's `modelValue`/`update:modelValue`. **Unit tests passed because they drove the *consumer's* `update:modelValue` emit directly, bypassing the dead primitive→Reka binding** (PAW-parity §2). Green tests, dead control. This is the *exact* signature of the original incident, now proven to recur on a whole *family* of form primitives, not a one-off.

The existing skill language is **necessary but not specific enough**. "Mount-based, asserts observable DOM" can be satisfied by a test that mounts the wrapper and checks it renders — without ever proving the prop→primitive→emit round-trip actually fires through the live Reka binding. The bug lives precisely in that round-trip. The skill needs to name the round-trip explicitly, for the specific component class where this failure mode lives: **reka-ui wrapper primitives**.

### Proposed change — `klikk-frontend-verification` SKILL.md, check #3

Add a sub-clause to "Tests — passing AND mount-based for changed components". Draft text (exact insertion, after the existing mount-vs-library-direct block):

> **Reka-ui wrapper primitives — mandatory v-model round-trip (added after the 2026-06-04 KSelect/KToggle/KCheckbox recurrence):**
>
> For any changed component that is a **reka-ui wrapper primitive** (a KDL component wrapping a reka-ui value primitive — `SelectRoot`, `SwitchRoot`, `CheckboxRoot`, `RadioGroupRoot`, `ToggleGroupRoot`, `SliderRoot`, `NumberFieldRoot`, `TagsInputRoot`, or any reka root that exposes `modelValue`/`update:modelValue`), a library-direct OR shallow mount test is **NOT sufficient**. There must be at least one **mount-based v-model round-trip spec** that:
>
> 1. Mounts the wrapper in a **controlled-render harness** (a parent that binds `v-model` to a reactive ref and re-renders on change), NOT one that asserts on the consumer's `update:modelValue` emit in isolation.
> 2. Asserts the **inbound** direction: a non-default `modelValue` from the parent reaches and visibly sets the primitive's rendered state (the switch shows checked, the select shows the chosen item, the checkbox shows ticked).
> 3. Asserts the **outbound** direction: a real user interaction on the rendered primitive (`trigger('click')` / Reka's exposed interaction) re-emits `update:modelValue` and updates the parent ref.
> 4. Is **mutation-verified**: the spec MUST fail against the obsolete `:checked` / `@update:checked` / `undefined`-model binding and pass against the `model-value` / `update:model-value` binding. A round-trip spec that passes on BOTH bindings does not test the binding and does not count. State in the spec how mutation was verified (the binding it was run against to confirm RED).
>
> A `KToggle.binding.spec.ts` / `KCheckbox.binding.spec.ts` mutation-verified spec is the reference shape (PAW-parity-and-journey §2). The verifier surfaces a **blocker** (not a soft flag) if a changed reka-ui wrapper primitive lacks a mutation-verified round-trip spec — this class of bug ships silently and the soft "insufficient coverage" flag has now demonstrably failed to stop it twice.

### Why a *blocker*, not the existing soft "insufficient-coverage" flag

The current skill treats library-direct-only coverage as a **surfaced flag, not a hard block** ("not a hard block, but visible"). For reka-ui wrapper primitives specifically, that calibration has now failed twice — the same mechanism, escalated from one component (KTable/KSelect) to three (KToggle/KCheckbox added). A flag that is surfaced and then shipped-past is paperwork. For this **narrow, well-characterised, high-blast-radius class** (a dead form control silently breaks core interactions and passes tests), the verification must be a hard precondition. I am deliberately scoping the blocker **narrowly to reka-ui wrapper primitives**, not all components — broadening it to everything would over-block and breed the "skip the check, it's a small change" pressure the verifier exists to resist.

### Companion: a one-line reflex in `klikk-design-language`

Not strictly required, but cheap and preventive: a hard reflex in the KDL skill that **all KDL value wrappers bind reka-ui's `model-value`/`update:model-value`, never the obsolete radix `:checked`/`@update:checked`/`undefined`-model API.** This stops the bug at authoring time, not just at verification time. I flag it as optional-but-recommended; it is a KDL skill change and therefore **co-signed by CDO** per §14a (line 599), separate from the frontend-verification change.

### What this requires before it lands — the §14a gate (flagged clearly, per the constraint)

Both changes are doctrine/skill changes that **constrain future behaviour**, so per §14a (line 611 — "if the change constrains future behaviour, it's a doctrine change and needs co-sign") they are NOT typo-class reference edits and need the full gate:

| Change | Co-sign owner (§14a) | Gate before "landed" |
|---|---|---|
| `klikk-frontend-verification` SKILL.md — reka round-trip blocker | `head-of-ai-resources` (§14a line 601) | **`fleet-verifier` SCAN-COMPLETE required** (§14a line 609) |
| `klikk-design-language` SKILL.md — value-wrapper binding reflex (optional) | `cdo` (§14a line 599) | **`fleet-verifier` SCAN-COMPLETE required** |

**Neither is applied in this memo.** My recommended sequence: MC says go → I (or `frontend-verifier`/CTO as proposer) draft the exact skill diff → spawn `fleet-verifier` with the change scope → on `SCAN-COMPLETE`, the skill change lands and the decision is logged in AGENT_FLEET. The adversarial-bypass questions I would expect `fleet-verifier` to press hardest (so you can read its verdict): **Q2 (canonical bypass)** — "mount the wrapper, assert it renders, never drive the real Reka interaction" (a round-trip spec that is shallow in disguise); the mutation-verification clause is the defence, and the verifier should test whether the clause itself can be gamed by a spec that asserts the emit without asserting the rendered inbound state. **Q4 (catcher)** — `frontend-verifier` is the catcher and the surface is executable (the spec fails RED on the old binding), which is the right shape; the residual is that "mutation-verified" is asserted by the test author, so the verifier may flag that the RED run is claimed-not-proven unless CI captures it.

---

## 4. Model / policy for the build agents

**No deviation from the all-opus-except-junior-dev policy (AGENT_FLEET decision #34).** Every seat on this program is opus-grade and already pinned:

- `tm1-architect`, `tm1-developer`, `integration-engineer`, `frontend-dev`, `backend-dev`, `data-engineer`, `frontend-verifier`, `fleet-verifier` — all `opus` / `claude-opus-4-8`. Verified in the agent files.
- `junior-dev` is not in this chain and would not be (this is judgment-heavy n-dimensional MDX, async cellset hygiene, financial-integrity work — the opposite of junior-dev's tightly-scoped single-file lane).

No agent on this program does junior-dev-shape work, so nothing drops to sonnet. If MC later wants cost optimisation on this program, the lever is **scope sequencing** (land nested columns first, defer writeback — which the brief already recommends in §10.4), **not** re-tiering models. Re-tiering this chain would trade model quality on exactly the work — MDX correctness, feeder discipline, MDX-injection defence, financial-integrity — where a quality regression is most expensive.

---

## 5. POPIA / sub-processor flag for the architect's Phase 2 roadmap (in-lane reminder, not a new gate)

Not my gate to set (CCO owns it), but flagging for the architect's roadmap so it is sequenced, not bolted on: Phase 2 writeback into TM1 from the Klikk console is **the modelling layer becoming writable from a wider surface**. Two existing reflexes bind it (`klikk-tm1-integration` #3, #4): any new external orchestrator around TM1 = new sub-processor → CCO loop → DPA → ROPA → privacy notice before merge; and no financial PI leaves SA without §72 transfer-basis docs (relevant only if PAaaS/v12 is ever considered — today's on-prem PA 2.1 keeps it in-zone). The read path stays internal-only behind the Django bridge (no direct browser→TM1 — brief §8 constraint, `klikk-tm1-integration` reflex #1, #9). I will co-sign with CCO when the Phase 2 architecture lands; I implement after sign-off, I do not set the gate.

---

## 6. What I am NOT doing (and why)

- **Not creating any agent.** Fleet covers the program with correct boundaries; a new seat would collide with existing ones.
- **Not creating any skill.** PAW end-user navigation is docs (confirmed §2); writeback knowledge is not skill-sized yet (re-evaluate at Phase 2 gate, §1).
- **Not creating any knowledge-base source.** No durable external-intel gap appears; the TM1 skills + the architect's internet access (WebFetch/WebSearch against IBM/Cubewise/TM1py docs) cover version-sensitive lookups.
- **Not applying the doctrine change.** §3 is a proposal; it needs `fleet-verifier` SCAN-COMPLETE per §14a.
- **Not re-tiering any model.** §4.

---

## Recommended next step (one line)

MC: approve the §3 reka-ui round-trip skill amendment in principle → I route it through the `fleet-verifier` SCAN-COMPLETE gate (and the optional KDL reflex through CDO co-sign + the same gate) → on SCAN-COMPLETE it lands and is logged in AGENT_FLEET; everything else proceeds with the existing fleet as-is.

**Doc:** `/Users/mcdippenaar/ClaudProjects/klikk_financials_portal/docs/tm1-cube-viewer/HAR-loop-in.md`
