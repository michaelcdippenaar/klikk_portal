# Klikk Slice & Dice (TM1 cube viewer) — Findings, Journey & PAW-Parity Brief

**Status:** working notes · **Date:** 2026-06-04 · **Author:** MC + Claude (CTO-loop)
**Audience:** MC; `head-of-ai-resources` (loop-in); `tm1-architect` (this is your brief before you're called).
**Reference env:** PAW at `http://192.168.1.132:8080` (PA 2.1 / v11), database `Klikk_Group_Planning_V3`. Our viewer: `console.8-bit.space/app/reporting?report=tm1-explorer`.

---

## 0. TL;DR

- We built a "PAW-lite" TM1 exploration grid (Slice & Dice) in the Klikk console: Vue 3 frontend (`PivotExplorer.vue`) over a Django/DRF MDX engine (`apps/planning_analytics/services/mdx_query.py`) talking to the TM1 REST API.
- This session fixed a **class of latent bugs**: three KDL form primitives (KSelect, KToggle, KCheckbox) were wired to the **obsolete radix `:checked`/`undefined` API instead of reka-ui's `modelValue`** — every one was a *dead control* (alias picker blank, suppress-zeros inert, member checkboxes unselectable). All three fixed, mount-tested (mutation-verified), deployed, and **live-verified in the browser**.
- We added **alias display** (entity UUID → "Klikk (Pty) Ltd") end-to-end and **fixed suppress-zeros** and **multi-dimension row drill**.
- We then opened the **real PAW** and diffed it against ours. Verdict (MC's words): the current replica is **mediocre**. It is a genuine PAW-*lite*, missing the features that make PAW PAW.
- **Strategic premise (MC):** PAW is just a web client over the TM1 REST API → we can build a genuinely PAW-grade experience in-house. **True, with caveats** (see §6–§8). The open question is *scope/role*, not feasibility.

---

## 0a. DECISIONS LOCKED (MC, 2026-06-04) — read this first

These set the scope for `tm1-architect`'s roadmap:

1. **Ambition: replace PAW for most users.** The Klikk console cube viewer is to become the *primary* TM1 surface for the finance team — not a complement. Target = genuine PAW-grade, not PAW-lite.
2. **Writeback: read-only first, writeback as a later phase.** Phase 1 = PAW-grade *read* (nested rows+cols, measures-as-axis, calculated members, named/dynamic subsets + MDX, conditional formatting, export, set-editor-as-tree). Phase 2 (separate, risk-reviewed) = data entry (sandboxes / cellset PUT / commit / spreading) with a POPIA + financial-integrity (CCO) gate.
3. **Process: architect-led roadmap before code.** `tm1-architect` designs the full n-dimensional axis model + calc strategy + subset-write + async/paging + the writeback architecture for Phase 2, and the phase plan, *before* implementation. `head-of-ai-resources` kept in the loop on fleet/skill/knowledge implications.

> Implication: "replace PAW" is a multi-phase program, not a feature. Expect a sequenced roadmap (read-grade → writeback → parity polish), each phase shippable and verified live.

---

## 1. The journey this session (what changed, in order)

| Area | What we did | Commit(s) |
|---|---|---|
| MDX engine | Generalised `mdx_query.py` to `(dim, hierarchy)`; added `list_hierarchies/subsets/subset_members/aliases`, `element_names(dim, els, attribute)` | `ff2813c` |
| API client | `getTm1DimensionHierarchies/Subsets/SubsetMembers/DimensionAliases` + hierarchy params | `d4b27da` |
| Set Editor v1 | PAW-style subset editor (KDialog): source tree, hierarchy picker, load-subset, THE SET ordered list | `888a2d1`, `1acd2f5` |
| Drag-pivot | Drag a dimension into Rows/Columns; context-pill move menu | `a7d5982`, `f3038ad` |
| Suppress + multi-dim | Suppress-zeros (client drop of all-zero rows/cols + re-query) and multi-dimension row drill | `df767b7` |
| **Alias display (#98)** | `POST /tm1/element-labels/` resolves keys→alias values; per-dim alias + auto-`name` default; pivot grid + set editor relabel UUIDs→names | `a1fafa7` (backend), `130a7b3` (frontend) |
| **KToggle fix** | Reka Switch binding `:checked`→`:model-value`; suppress-zeros now actually works | `c7d4e0f` |
| **KCheckbox fix** | Reka Checkbox binding `:checked`→`:model-value`; consolidation/member selection now works | `8631073` |
| Set Editor alias fix | Empty-string `''` sentinel (Reka rejects) → `__principal__`; wired `ensureAliasLabels` to the new endpoint; per-(dim,hier) metadata memo | `5fc5d6e` |

All deployed to staging (`klikk-financials-console`), full suite **474 tests green**, builds clean.

---

## 2. The Reka primitive bug family (root-caused & important)

reka-ui **2.9.8** standardised value components on `modelValue` / `update:modelValue` (via `useVModel`). Our KDL wrappers were written against the **old radix-vue `:checked` / `@update:checked`** API. Result: the prop was ignored (component ran *uncontrolled*) and the event never fired (no write-back). Each presented as a "dead" control:

| Primitive | Symptom | Root cause | Fix | Lock |
|---|---|---|---|---|
| KSelect | alias/hierarchy picker blank, selection didn't round-trip | passed `undefined` for null model → SelectRoot uncontrolled | bind non-null `model-value` | (earlier) |
| KToggle | "Suppress zeros" did nothing (125/236 zero rows stayed) | `:checked`/`@update:checked` don't exist on `SwitchRoot` | `:model-value`/`@update:model-value` | `KToggle.binding.spec.ts` |
| KCheckbox | couldn't select consolidations/members in Set Editor | same, on `CheckboxRoot` | same | `KCheckbox.binding.spec.ts` |

**Overlay roots are fine** — `DialogRoot/DropdownMenuRoot/PopoverRoot/ToastRoot` correctly use `open`/`update:open`; `KAccordion`/`KRadioGroup`/`KMultiSelect` use `v-model` and were not flagged.

**Lesson (recurrence of the 2026-05-26 incident):** the suppress/checkbox unit tests passed because they drove the *consumer's* `update:modelValue` emit **directly**, bypassing the dead primitive→Reka binding. Green tests, dead feature. Fix added: mount-based primitive specs that exercise the real Reka binding (controlled-state render + re-emit), each **mutation-verified** (fail on the old binding, pass on the fix). **Takeaway for the fleet: a passing component test that doesn't drive the real primitive is not a ship signal — and live-verify UI behaviour before claiming done.**

---

## 3. PAW vs our cube viewer — the diff (observed live)

PAW view observed: *"Year on Year Revenue Growth"* — columns nested **Year (2024–27) › All_Month › {amount, growth %}**, rows = `cost_object` hierarchy (All → Property → Residential → leaves), green heatmap on `growth %`, accounting negatives in parentheses, context tiles: `version=forecast`, `entity=All_Entity`, `Grouping=INCOME_STATEMENT`.

### Set Editor
| | PAW | Ours | Status |
|---|---|---|---|
| Select consolidations + leaves | ✅ (ⓔ consol / ◉ leaf icons) | ✅ **fixed** (was dead checkbox) | done |
| Two panes (Available / Current set) | ✅ | ✅ | match |
| Current set rendered as | **hierarchy tree** (indent, twisties, icons) | **flat numbered list** | gap |
| Name display (ID / name / attribute) | "Member ID ▾" | "Display label" alias picker | match |
| Hierarchy / root picker | "All roots ▾" | ✅ | match |
| Search **with descendants** | ✅ | loaded-rows filter only | gap |
| Show attributes as columns | ✅ | ✗ | gap |
| Named/dynamic subset + **MDX** authoring | ✅ ("Enter named set", MDX) | "coming soon" | gap |
| **Save as** named subset / Replace | ✅ | "coming soon" | gap |
| Set calculation | ✅ | ✗ | gap |

### Cube viewer
| | PAW | Ours | Status |
|---|---|---|---|
| **Nested column dims** | Year › Month › measure (multi-level crossjoin) | **single col dim; multi-col degrades** | **biggest gap** |
| **Multiple measures side-by-side** | amount + growth % | measure is a single filter | gap |
| Row hierarchy drill (indent + twisty) | ✅ | ✅ | match |
| Suppress zeros | ✅ | ✅ **fixed** | done |
| Alias / friendly names | ✅ | ✅ **added** | done |
| Conditional formatting (heatmap) | ✅ | ✗ | gap (nice-to-have) |
| Calculated members (growth %, ratios) | ✅ | ✗ | gap |
| Negative format | parentheses | `-x` red | convention |
| Writeback / data entry / sandbox / commit | ✅ | ✗ (read-only) | **scope fork** |
| Export to Excel | ✅ | ✗ | gap |

---

## 4. Why the current viewer is "mediocre" (honest assessment)

It is a **read-only PAW-*lite***: single column dimension (no nesting), set editor shows a flat list (not a hierarchy), no calculated members, no named subsets/MDX authoring, no conditional formatting, no writeback. It was also carrying three dead form-primitive bugs (now fixed) that made core interactions silently fail. The bones are sound (real MDX engine, real drill, real suppress, real alias) — but the ceiling is well below PAW.

---

## 5. Why this matters / the locked decisions that created the need

Per MC's locked TM1 design (2026-06-03): planners **write directly to the base cube in PAW**, scenarios live in **Version members**, and **ad-hoc users go to PAW**. So the finance team lives in PAW. Two consequences:
1. **End-user PAW runbook** needed (decided: docs, not an agent skill — see the runbook scope doc).
2. If we want analysis *inside the Klikk console* (branded, integrated with Xero/Investec, no separate PAW login/licence for casual users), our viewer has to be good enough to be worth it — hence "PAW-grade."

---

## 6. Is PAW-grade achievable? Yes — it's all TM1 REST

PAW is a web client over the TM1 REST API (`/api/v1`): `ExecuteMDX` → cellsets, `}ElementAttributes_<dim>` for aliases, subsets/hierarchies, and (for writeback) cellset PUTs + sandboxes. **We already use this stack** (`mdx_query.py`). So every PAW *read* behaviour is reproducible. The honest caveats:

- **It's a real build, not a tweak.** Nested rows+cols, set-as-hierarchy editor, calculated members, named-set MDX, and especially **writeback** are each non-trivial.
- **Don't rebuild what PAW already gives you** unless there's a reason (embedding, licensing, curation, branding, read-only governance). That's a *product* decision (§9 Q1), not an engineering one.
- **Writeback is the big fork.** Read-only stays simple. Data entry pulls in sandboxes, commit/locking, spreading, and real POPIA/financial-integrity risk — a different project class.
- **Performance:** PAW uses async MDX, paging, and the Stargate cache. A naive full-cellset fetch won't match it at scale.

---

## 7. PAW-grade gap → effort (engineering view; tm1-architect to refine)

| Capability | Effort | Notes |
|---|---|---|
| Nested column dims (multi-level crossjoin) | M–L | Row side already does multi-dim; mirror it on columns + header rendering |
| Set editor as hierarchy tree (icons, twisties) | M | Reuse the source-tree renderer for THE SET pane |
| Multiple measures on an axis | M | Measure becomes an axis member set, not a single filter |
| Named/dynamic subsets + MDX authoring + Save-as | M | Needs a backend **write** endpoint for subsets (currently read-only) |
| Calculated members (growth %, ratios) | M | MDX `WITH MEMBER` / `WITH SET`; or client-side calc columns |
| Conditional formatting / heatmaps | S–M | Mostly frontend |
| Export to Excel | S | |
| **Writeback / sandbox / commit** | **XL** | Separate project; scope fork; CCO/risk loop |

---

## 8. Architecture sketch (for tm1-architect to validate/own)

- **Read path (today):** Vue `PivotExplorer.vue` → DRF `tm1/query/` → `mdx_query.run_pivot()` builds MDX (`build_mdx`, `_axis_set` crossjoin) → `ExecuteMDX` → cellset → normalised JSON. Aliases via `POST /tm1/element-labels/` → `element_names()` over `}ElementAttributes_<dim>`.
- **To reach PAW-grade read:** generalise the axis model to **ordered, nestable dimension stacks on both rows and cols** (crossjoin n-deep), promote *measure* to a first-class axis member set, add **calculated members** (MDX `WITH`), and a **subset write** endpoint (`Save as`). Consider async/paged MDX + reuse of TM1's Stargate cache for big slices.
- **If writeback is in scope (separate decision):** cellset PUT, sandboxes (`}tp_...`), commit, optimistic-lock handling, spreading — and a hard POPIA/financial-integrity review (this is the modeling layer, internal-only).
- **Constraint:** TM1 stays **internal-only** (POPIA §21 sub-processor); the Django bridge is the only public surface. No direct browser→TM1.

---

## 9. Open decisions (need MC) — these set everything

1. **Role of our viewer vs PAW.** Complement (read-only embedded explorer) / replace PAW for casual & ad-hoc users / full PAW-grade incl. modeling? → sets the fidelity bar and the build size.
2. **Writeback?** Read-only analysis, or must support **budget data entry** in our viewer (sandboxes/commit)? → the biggest architectural + risk fork.
3. **Fidelity target / priority order.** Which gaps are must-have vs nice: nested cols, set-as-hierarchy, multiple measures, named sets/MDX, calcs, conditional formatting, export?
4. **Effort horizon.** Tighten the top 2–3 gaps now (nested cols + set editor), or commit to a phased PAW-grade roadmap?
5. **The "why ours over PAW" killer reason** — to keep the build honest.

---

## 10. Recommended next steps

1. MC answers §9 Q1–Q4 (in chat).
2. **Call `tm1-architect`** with this doc as the brief → he owns: the n-dimensional axis model, calculated-member strategy (MDX `WITH` vs client calc), subset-write endpoint design, async/paging + Stargate cache, and the writeback/sandbox decision if in scope. He directs `tm1-developer` (TI/rules/MDX) + co-ordinates `integration-engineer` (REST resilience) and `frontend-dev` (Vue grid).
3. `head-of-ai-resources` stays in the loop: confirm no new agent/skill is warranted (PAW navigation = end-user **docs**, already decided; the architect/dev TM1 skills stay as reference). Re-evaluate only if a durable, non-obvious knowledge gap appears.
4. Land **nested columns** first (highest-impact, no writeback risk) as the proof the viewer can be more than mediocre.

---

## Appendix — key technical facts

- TM1: `192.168.1.132:44414`, base `http://.../api/v1`, user `Admin`, creds via active `TM1ServerConfig` DB row (never hardcode). **Internal-only.**
- Backend repo on staging VM `192.168.1.133`: `/srv/klikk-financials/compose/klikk_financials_v4` (bind-mounted to the `klikk-financials-v4` container at `/app`). Console builds from `/srv/klikk-financials/compose/klikk_portal`.
- Key files: `apps/planning_analytics/services/mdx_query.py` (MDX engine), `views.py`/`urls.py` (DRF), `src/components/reporting/PivotExplorer.vue` + `SetEditor.vue` + `PivotAxisChip.vue`, `src/components/klikk/K{Select,Toggle,Checkbox}.vue` (primitives), `src/api/planningAnalytics.js`.
- `element-labels` is a **POST** (element keys can contain commas; body avoids querystring corruption).
- Account dim alt-hierarchies: EBITDA, Grouping, IS (excl non-cash), is_non_cashflow (+ default + Leaves). Entity members are UUIDs with a `name` alias (e.g. `41ebfa0e… → "Klikk (Pty) Ltd"`).
- PAW database `Klikk_Group_Planning_V3` cubes seen: `gl_src_trial_balance`, `gl_pln_forecast`, `gl_rpt_trial_balance`, `cashflow_{cal_metrics,cnt_mapping,pln_forecast,rpt_summary}`, `listed_share_*`, `prop_{agr,res}_*`, `hier_cnt_*`, `sys_*`. (Budget/forecast entry happens in the `*_pln_forecast` family under Version members — confirm exact cube per process.)
