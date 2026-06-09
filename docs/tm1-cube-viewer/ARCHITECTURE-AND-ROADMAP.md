# Klikk Cube Viewer → PAW Replacement — Architecture & Phased Roadmap

**Status:** ARCHITECT-OWNED design · **Date:** 2026-06-04 · **Author:** tm1-architect (CFO chain)
**Ambition (locked, MC 2026-06-04):** replace PAW for *most* finance users — the Klikk console becomes the **primary** TM1 surface, genuine PAW-grade, not PAW-lite.
**Brief:** `PAW-parity-and-journey.md` §0a. **Skills applied:** `tm1-development`, `klikk-tm1-integration`.
**Verified against:** TM1py `SubsetService`/`CellService` source (cubewise-code master), `tm1-development/03-tm1py-and-rest.md`, `04-mdx.md`, `klikk-tm1-integration/05-read-path-reporting.md`. Citations inline.

> **This is a design document. No implementation has started.** It defines the contracts, the sequencing, and who builds what. Code follows MC's go on the phase plan.

---

## 0. The single most important finding — the backend is NOT the constraint

I read the live MDX engine (`apps/planning_analytics/services/mdx_query.py` on `192.168.1.133`). **The query engine already does everything nested columns needs.** This reframes the whole roadmap:

- `_axis_set(spec)` already crossjoins an **n-deep** list of dimension specs on **either axis** — the same `CROSSJOIN(...)` loop builds rows and cols identically. Multiple measures on an axis is *also* already expressible (a measure dim is just another spec in the list).
- `execute_mdx` already returns columns as a list of **member-name tuples** (`col_tuples = [[m["Name"] for m in t["Members"]] ...]`), and flattens cells by `ordinal = ri * ncols + ci`. So a 3-level nested column axis comes back correctly shaped *today*.
- The query contract `POST /tm1/query/` already accepts `cols: [{dimension, members[], hierarchy?, subset?}, ...]` — an array, not a single dim.

**The gap is entirely in the frontend render.** `PivotExplorer.vue` deliberately degrades when `colDims.length > 1`:
- `colHeadLabel()` (lines 842–850) returns the raw composite tuple string and the doc-comment says *"single-col-dim is the contract that MUST be correct."*
- The `<thead>` renders **one flat `<tr>`** of `displayColHeaders` (single string per column) — there is no nested multi-row header band, no col-header spanning, no per-level grouping.
- `resolveShownLabels()` (lines 1765–1775) only aliases column headers when `colDims.length === 1`.

The row side, by contrast, **already does** n-dim crossjoin rendering (the `outerRowDims × innerRowDim` group/queue machinery, lines 1069–1205) with path-keyed drill that survives overlapping rollups. **So nested columns is: mirror the proven row-side tuple handling onto the column header band.** That is why it is Step 1 — highest impact, the engine is ready, zero writeback risk, and the hard client-side pattern already exists on the other axis to copy.

**Two transport-layer issues I found that are NOT part of this scope but gate Phase 1 hardening** (integration-engineer owns, see §8):
1. `mdx_query._session()` builds a **fresh `requests.Session()` on every call** — no connection reuse. Violates `tm1-development` reflex "reuse one service." Fine at today's volume; a problem the moment we drive PAW-grade traffic.
2. `tm1_client.py` defaults `TM1_VERIFY_SSL=False` and `mdx_query` calls `verify=False`. Violates `klikk-tm1-integration` reflex #2 (`ssl=True, verify=<CA-bundle>`, never `verify=False`). Internal-only mitigates the risk but it is still a documented regression to close.
3. `build_mdx` has **no cube/dimension whitelist** (reflex #11). Members are `]`→`]]` escaped (good) but cube/dim/hierarchy/subset names are interpolated unescaped. Acceptable for read with structured params; **mandatory to fix before the subset-WRITE endpoint** (Step 4).

---

## 1. PHASE 1 — PAW-grade READ (the near-term, shippable program)

Read-only. No sandbox, no cellset PUT, no writeback. Every step independently shippable + live-verified.

### 1.1 The n-dimensional ordered, nestable axis model (THE core model)

**Conceptual model.** Each axis (rows, cols) is an **ordered list of dimension "stacks."** Each stack is `{dimension, hierarchy, memberSet}` where `memberSet` is an ordered list of members (from explicit selection, a drill tree, or a resolved subset). The axis tuple set is the **crossjoin in list order, outer-slowest / inner-fastest** — identical semantics on both axes. This is exactly what `_axis_set` already builds; the model change is making the *frontend* treat columns the way it already treats rows.

**Query contract (`POST /tm1/query/`) — minimal change, additive.** The body already supports this. We formalise and extend it:

```jsonc
{
  "cube": "gl_pln_forecast",
  "rows": [
    { "dimension": "cost_object", "hierarchy": "cost_object",
      "members": ["EXPENSE", "Rent", "Salaries"] }
  ],
  "cols": [                                  // ORDERED — outer first
    { "dimension": "year",  "members": ["2024","2025","2026","2027"] },
    { "dimension": "month", "subset": "All_Month" },
    { "dimension": "measure", "members": ["amount", "growth_pct"],
      "calculated": ["growth_pct"] }         // NEW (§1.3): names that are WITH-members, not stored
  ],
  "filters": { "version": "forecast", "entity": "All_Entity" },
  "suppress": true,
  "calc_members": [                          // NEW (§1.3): server-side WITH MEMBER defs
    { "axis": "cols", "dimension": "measure", "name": "growth_pct",
      "expression": "([measure].[amount]) / ([measure].[amount], [year].PREVMEMBER) - 1",
      "format": "0.0%" }
  ]
}
```

Everything except `calc_members` / `calculated` is **already honoured**. The structural Phase-1 work is the **response→render** contract, because the frontend must stop flattening:

**Response contract (formalised — `execute_mdx` already produces the data, we standardise the envelope):**

```jsonc
{
  "mdx": "SELECT ... ON 0, ... ON 1 FROM [...] WHERE (...)",
  "rowAxis":  { "dimensions": ["cost_object"],         "tuples": [["EXPENSE"], ["Rent"], ...] },
  "colAxis":  { "dimensions": ["year","month","measure"],
                "tuples": [["2024","Jan","amount"], ["2024","Jan","growth_pct"], ...] },
  "cells": [ { "value": 123.4, "formatted": "123.40", "consolidated": false }, ... ]  // row-major, ri*ncols+ci
}
```

Naming the axis `dimensions` array + returning tuples-as-arrays (not joined strings) is the **one load-bearing backend change** in Step 1 — it lets the frontend build a true nested header. (Today the frontend reconstructs tuples defensively from `requestedColMembers`; we make the server authoritative.)

**Frontend render change (the bulk of Step 1).** Build a **nested column-header band**: one `<thead>` row per column dimension, each cell spanning the count of leaf columns beneath it (the classic merged-header pivot). Reuse the row-side group/queue logic conceptually — column tuples group by their outer-prefix exactly as rows group by `outerTuple`. The frozen-corner cell spans the full row-header band (already done) **and** the full column-header band depth. `resolveShownLabels()` aliases **every** column dimension's members, not just `colDims[0]`.

**Trade-off named:** we keep the **crossjoin** axis model (PAW's default), not an asymmetric/ragged axis. Crossjoin is what the engine and `_axis_set` produce and what 95% of PAW exploration uses. Ragged/asymmetric axes (different measures under different years) are a Phase-1.5 nicety, not a blocker — defer.

**Proof-point:** reproduce the *exact* PAW view in the brief (§3): cols nested `Year(2024–27) › All_Month › {amount, growth%}`, rows `cost_object` drilled, live, in the console. Screenshot diff against PAW.

### 1.2 Measures as a first-class axis member set

Today "measure is a single filter" (`pickMeasureMember` seeds one). PAW-grade requires `amount` + `growth%` **side by side**. With §1.1 this is **free**: the measure dimension becomes a normal stack in the `cols` (or `rows`) array with `members: ["amount", "growth_pct"]`. No backend change beyond §1.1.

**UI:** the measure dimension stops being special-cased into the filter well; it can be dragged to an axis like any dim, and its Set Editor lists measures (including calculated ones — §1.3). Default layout still auto-seeds `amount` as the innermost column measure so a fresh cube opens sensibly.

### 1.3 Calculated members (growth %, ratios) — **server-side MDX `WITH MEMBER`, recommended**

**Recommendation: server-side `WITH MEMBER` / `WITH SET`, not client-side calc columns.** Reasons:

1. **Correctness on consolidations.** A growth% computed client-side from two displayed cells is wrong the moment a value is itself a ratio, a rounded display value, or a suppressed cell. `WITH MEMBER` computes in the engine against true stored/consolidated values — the same number PAW shows.
2. **Suppression & totals stay coherent.** `NON EMPTY` and the engine's consolidation logic see the calculated member; client-side columns are bolted on after suppression and double-count or misalign.
3. **One source of truth.** The MDX is the definition; the frontend just renders cells. No parallel JS calc library to keep in step with TM1's semantics (the 2026-05-26 bug-class lesson: don't reimplement the engine's behaviour in the client).

**Per `tm1-development/04-mdx.md`:** `WITH MEMBER ... AS ...` works in TM1 read MDX (PA 2.1), is **non-persistent** (re-evaluated per query — exactly what we want for ad-hoc analysis), and TM1 has no `CurrentMember` *in TI* but **does** support `.PREVMEMBER` / tuple-relative references *in MDX*. So `growth% = amount / (amount, year.PREVMEMBER) - 1` is expressible.

**The hard constraint this collides with — `klikk-tm1-integration` reflex #11 + read-path skill §8 "no raw MDX editor."** We do **not** let users type free MDX. The calculated-member contract is **structured + whitelisted**:

- The API accepts a **named calc-member spec** (`{name, expression, format}`), and `services/mdx_builder.py` (new, per read-path skill §6) **validates** the expression against an allow-list: only references to whitelisted dims/members/measures of the current cube, only an allow-list of functions (`PREVMEMBER`, arithmetic, `IIF`, `DIV`-guards), no `}`-control-cube references, no `StrToMember` on user strings. A spec that references anything off-list is rejected 400 **before** the MDX is assembled.
- A **curated library** of common calc members (Growth %, YoY, % of parent, margin) ships as named presets — most users pick from the library and never author. Authoring raw calc-MDX is a **staff/architect-gated** capability (see §1.4 governance), not a general-user surface.

**Trade-off named:** server-side `WITH` re-evaluates every query (no Stargate benefit for the calc member itself — Stargate caches the *base* cells it reads). For a handful of ratio columns over a suppressed slice this is negligible. If a calc member becomes hot and stable (used in many saved views), the idiom is to **promote it to a real rule-calculated measure** in the cube — that is a `tm1-developer` job (rule + feeder), not a viewer feature. The viewer's calc members are for *ad-hoc* analysis; persistent business measures live in the model.

### 1.4 Named/dynamic subsets + MDX authoring + Save-as — needs a subset-WRITE endpoint

Today subsets are **read-only** (`list_subsets`, `subset_members`). PAW-grade "Save as named subset / Replace / dynamic MDX subset" requires a **write** endpoint. This is the first place Phase 1 mutates TM1 — so it gets the security treatment.

**The TM1 idiom (verified against TM1py `SubsetService` source, cubewise-code master):**

| Operation | Method | URL (PA 2.1 `/api/v1`) | Body |
|---|---|---|---|
| Create subset | `POST` | `/Dimensions('D')/Hierarchies('H')/Subsets` | `subset.body` |
| Update subset | `PATCH` | `/Dimensions('D')/Hierarchies('H')/Subsets('S')` | `subset.body` |
| Dynamic→static | `POST` | `/Dimensions('D')/Hierarchies('H')/Subsets('S')/tm1.SaveAs` | `{"MakeStatic": true}` |
| Static elements (alt) | `PUT` | `.../Subsets('S')/Elements/$ref` | `[{"@odata.id": ".../Elements('E')"}]` |

Body shape (from `Subset.body`):
- **Static:** `{ "Name", "Hierarchy@odata.bind": "Dimensions('D')/Hierarchies('H')", "Elements@odata.bind": ["Dimensions('D')/Hierarchies('H')/Elements('E1')", ...] }`
- **Dynamic:** `{ "Name", "Hierarchy@odata.bind": ..., "Expression": "<MDX>" }` (no Elements list — *"when a subset has an expression it's dynamic, otherwise static"*).

**New Klikk endpoint design:** `POST /tm1/subset/save/` (and `DELETE /tm1/subset/`):

```jsonc
POST /tm1/subset/save/
{
  "dimension": "cost_object", "hierarchy": "cost_object",
  "name": "Top10_Properties_by_Revenue",
  "type": "dynamic",                         // "static" | "dynamic"
  "expression": "{TOPCOUNT(TM1FILTERBYLEVEL(TM1SUBSETALL([cost_object]),0),10, ...)}",  // dynamic
  "members": [...],                          // static
  "scope": "public",                         // public only in Phase 1 (private = per-TM1-user; we use a service acct)
  "replace": false
}
```

**Security gates (non-negotiable — this is the modelling layer, even read-grade):**
1. **Staff/architect permission class only** (`CanWriteSubset`, DRF). General finance users get read + *ephemeral* sets (applied to the axis, not persisted). Persisting a named subset to the shared TM1 server is a curation act — gated.
2. **Subset-name + dimension + hierarchy validated against the cube whitelist** (`mdx_builder.py`), and **name-escaped** (`'`→`''`, `]`→`]]`). This is where the missing-whitelist gap (§0) **must** be closed.
3. **Dynamic-subset MDX validated** by the same allow-list validator as calc members (§1.3) — TM1SUBSETALL/TM1FILTERBYLEVEL/TOPCOUNT/FILTER on whitelisted dims only; **no** `}`-control-cube refs, no cross-cube reads. A dynamic subset is MDX that the engine *re-runs every read* — an injection here is an exfiltration channel (read-path skill §1).
4. **POPIA audit** (read-path skill §5): log `user_id, op=subset_save, dimension, name, type, timestamp`. Never log the expression body verbatim if it could embed identifiers.
5. **Deployment discipline.** Subsets created here land on the **staging** TM1 (`192.168.1.132`). They are model objects. Anything that should be *permanent shared model* (a standing reporting subset the whole team relies on) is promoted via `tm1project` source control — **not** left as an ad-hoc console write. The viewer's Save-as is for analyst working sets; durable model subsets go through the deployment path. State this in the UI ("saved to staging — promote via model deployment for shared use").

**Trade-off named:** we allow **dynamic-subset MDX authoring** (a deliberate exception to the read-path skill's "no raw MDX editor" rule) because PAW-parity demands it and a *subset* expression is a constrained, validated, single-dimension surface — far narrower than a free cube-query MDX box. We do **not** allow free-form *cube-query* MDX (the `SELECT ... ON 0 ...` surface stays server-built). That is the line: **validated subset/calc MDX, yes; arbitrary query MDX, never.**

### 1.5 Set-editor-as-hierarchy-tree + conditional formatting + Excel export

- **Set editor as tree** (frontend; reuse the source-tree renderer for THE SET pane — brief §7 "M"). The drill-tree path machinery already exists in `PivotExplorer`; lift it into `SetEditor.vue`. Add search-with-descendants (backend already has `dimension_children`; add a `descendants` resolve via `DESCENDANTS(...)` MDX behind the same structured endpoint). Show attributes as columns (reuse `element_names` over `}ElementAttributes_<dim>`).
- **Conditional formatting / heatmap** (pure frontend). Per-measure colour scale on a chosen calc/measure column (the brief's green growth% heatmap). No backend change. Accounting-style negatives in parentheses = a formatter option (convention toggle).
- **Excel export.** Two options. **(a) Client-side** (`SheetJS`/`xlsx` from the rendered cellset) — fast, no backend, but loses live formulas. **(b) Server-side** `.xlsx` from the same cellset. **Recommendation: client-side for Phase 1** (the data is already in the browser; it is a render concern), explicitly *not* a PAfE replacement (read-path skill §8 "Klikk's responsibility is the analytical UI, not Excel replacement"). Note: this contradicts that skill line slightly — resolve with MC, but a "download what I see" button is table-stakes for PAW-parity and is trivial; it is not "Excel-from-TM1 as a product."

### 1.6 Performance — how to not melt on a wide crossjoin

The naïve risk: a 4-deep column crossjoin × a drilled row hierarchy = tens of thousands of tuples in one cellset, one synchronous `POST /tm1/query/` that blocks and may exceed the LB timeout. Levers, in priority order:

1. **`NON EMPTY` on both axes — already on** (`build_mdx` does this). This is the single biggest reducer; `SKIPCHECK` + good feeders in the cube make it dramatically faster (`04-mdx.md`). **Dependency on the model:** the cubes the viewer hits (`gl_pln_forecast` family) must have correct feeders — that is the `tm1-architect`/`tm1-developer` model contract, and a wide-slice viewer makes feeder health *visible*. (Flag: confirm feeder health on the planning cubes before we drive heavy traffic.)
2. **Crossjoin ordering: filter before crossjoin.** `04-mdx.md`: `CROSSJOIN(FILTER(A,pred), B)` beats `FILTER(CROSSJOIN(A,B),pred)`. The `_axis_set` builder should, where a stack carries a predicate (e.g. level filter), apply it to the component **before** crossjoining. Today it crossjoins raw member lists — fine for explicit small lists, a problem for `TM1SUBSETALL`-scale stacks. Add this to `_axis_set` when subsets/level-filters enter the column axis.
3. **`async_requests_mode` / OData async to survive the LB.** Per `03-tm1py-and-rest.md`, `async_requests_mode=True` (OData `Prefer: respond-async`) is what stops a >60s query dying at the gateway. **Important nuance I verified:** TM1py's `execute_mdx_async` is *thread-based extraction parallelism*, **not** the OData server-async path — they are different levers. For Klikk: the Django bridge issues the query; for big slices it should use the **async OData pattern** (submit → poll `Location`) so the browser's `POST /tm1/query/` doesn't hold a socket for minutes. This is integration-engineer's resilience work (§8), exposed to the frontend as an async job (submit → poll → fetch result).
4. **Paging / windowing the cellset.** For very wide results, page the **column** axis (extract a window of column tuples at a time) and/or virtualise the grid render. The frontend grid should virtualise rows already at PAW-scale (hundreds of drilled rows). Backend: support `colWindow: {offset, limit}` on the query contract for the extreme case. Defer to Step 6 (only if a real slice proves it necessary — don't pre-build).
5. **Stargate cache reuse (TM1 side, free).** `04-mdx.md`/read-path skill §4: TM1's Stargate caches a view's computed cells once calc time > `VMT` (5s default), reused until underlying data changes. Klikk does nothing to enable it — it just works. **Pre-warm** after a sync: read-path skill §4 pre-warm pattern — after `sync_xero_to_tm1`, run the top-N popular slices to warm Stargate (and the Klikk Redis read cache). First-query-of-the-morning drops from seconds to ~50ms.
6. **Klikk Redis read cache** (read-path skill §4): `key = sha256(user_role | cube | canonical_json(query))`, TTL 60–300s, **tag-invalidate by cube** on sync. `user_role` in the key prevents cross-role bleed under service-account passthrough (Pattern A, which is our v1 — read-path skill §3). Calc-member queries are cacheable too (the spec is part of the canonical JSON).

**Performance trade-off named:** server-side `WITH MEMBER` calc + wide crossjoin defeats some Stargate reuse for the *calc* cells; mitigated by the Redis layer (caches the final shaped response) and by promoting hot calc members to rules. We accept slightly higher first-query cost for correctness; we recover it with caching + pre-warm.

---

## 2. PHASE 2 — WRITEBACK (designed, deferred; separate POPIA + CCO-gated project)

Designed here so Phase 1 doesn't paint us into a corner, but **not built until** the CCO/financial-integrity gate clears. **Internal-only reaffirmed: writeback is even more sensitive than read — it mutates the planning model.**

### 2.1 The writeback architecture (the TM1 idiom, verified)

- **Cellset PUT/PATCH** (verified against TM1py `CellService`): `PATCH /Cellsets('id')/Cells` with **ordinal-based** body `[{"Ordinal": o, "Value": v}, ...]` — each ordinal maps to a cell position in the already-created cellset. So a write is: create cellset for the edited view → PATCH the changed ordinals → commit.
- **Sandboxes:** TM1py 2.x selects the sandbox via the **`!sandbox` query parameter** (`/Cellsets('id')/Cells?!sandbox=<name>`), not a header. A changeset groups edits (`!ChangeSet`).
- **Commit:** sandbox → base via the sandbox publish/commit; base writes persist via **`CubeSaveData` per cube** (per `tm1-development` reflex: `CubeSaveData` during the day, **never `SaveDataAll` in production hours**).
- **Throughput** (if bulk write, e.g. spreading a number across many cells): `write_async(use_blob=True)` is the modern fastest path (`03-tm1py-and-rest.md`); but interactive single-cell edits are simple `PATCH`.

### 2.2 The architectural tension MC must resolve (sandbox decision conflict)

**This is the most important open question in Phase 2, and it is a genuine conflict between two locked decisions:**
- The brief (§0a) says Phase 2 = "sandboxes/commit."
- The **2026-06-03 locked TM1 design** (carried in `klikk-tm1-integration`) says **"Sandbox model: none — single shared base; all PAW/PAfE writes go straight to the base cube; last-write-wins."**

These cannot both stand for the viewer's writeback. **Three options for MC:**
- **(A) Honour the no-sandbox decision** — viewer writes straight to base, last-write-wins, with optimistic-lock guard (§2.3). Simplest, matches the model decision, but **no what-if isolation** — a planner's draft is immediately live. Risky for a "most users" surface.
- **(B) Introduce sandboxes for the viewer only** — viewer edits land in a per-user `}Sandbox`, explicit "commit to base." Safer (draft isolation, the PAW data-entry idiom), but **reverses** the 2026-06-03 decision → triggers `MaximumUserSandboxSize`/`JobQueuing` config, and a re-think of the "very small team / last-write-wins is fine" premise.
- **(C) Hybrid** — read-grade for everyone, writeback only for a small sanctioned planner group, in sandboxes, behind the CCO gate. Most defensible for "replace PAW for *most* users" (most users read; the few who plan get safe writeback).

**My recommendation: (C).** It honours "most users" (they read), gives planners PAW-grade safety (sandboxes), and the sandbox reversal is scoped to the few who need it — a smaller blast radius than flipping the whole model. **But this is MC's financial-process call, not mine to lock** — it reopens a 2026-06-03 decision and must go CFO → CCO.

### 2.3 Optimistic locking & spreading

- **Optimistic locking** (required under last-write-wins / option A or B): on read, capture each editable cell's value (or a view-level version token). On write, re-read and **reject if changed since read** (409 → "this cell changed, reload"). TM1 has no native row-version; we synthesise it (value-at-read comparison, or a `}` audit-cube timestamp). Without this, two planners silently clobber each other — unacceptable on a planning server at budget close.
- **Spreading** (PAW's killer data-entry feature): proportional/equal/repeat/percent-change spread across a consolidation's leaves. TM1 has native spreading operators; via REST these are **special value strings** in the cell write (e.g. `P` proportional, `R` repeat). Phase 2 maps the viewer's spread UI to those operators server-side (structured, never raw). This is XL effort and the reason writeback is its own project.

### 2.4 The gate (hard)

Per `klikk-tm1-integration` reflexes #3, #7 and §04: writeback = mutating financial planning data. **Before any Phase-2 code merges:** financial-integrity review (CCO) → POPIA re-assessment (writeback changes the processing) → DPA/ROPA delta → idempotency design (reflex #7: idempotency key per write, `CellPutN` not `CellIncrementN`) → internal-only reaffirmed (writeback endpoint is staff-internal, never `/api/public/*`, reflex #9). **The architect's position: do not start Phase 2 until Phase 1 is live, stable, and the sandbox decision (§2.2) is resolved by the CFO/CCO.**

---

## 3. Sequenced phase plan — ordered, each independently shippable

Each step has a **concrete proof-point** and an owner. `tm1-developer` = TI/MDX/rules/feeders/model; `integration-engineer` = REST resilience/retry/circuit-breaker/async/transport; `backend-dev` = DRF endpoints/serializers/whitelist/cache/audit; `frontend-dev` = Vue grid/Set Editor.

| Step | Deliverable | Proof-point (live-verified) | Primary owner | Supporting |
|---|---|---|---|---|
| **1** | **Nested columns** (n-deep crossjoin render). Backend: formalise response envelope (axis `dimensions` + tuples-as-arrays). Frontend: nested column-header band + spanning + multi-dim aliasing. | The exact PAW view (brief §3): `Year › Month › {amount, growth%}` cols × drilled `cost_object` rows, rendered identically, in console. | **frontend-dev** | backend-dev (envelope) |
| **2** | **Measures as an axis member set.** Drag the measure dim to an axis; `amount` + a second measure side-by-side. | Two measures rendered as adjacent innermost columns under each period. | **frontend-dev** | — |
| **3** | **Calculated members** (server-side `WITH MEMBER`) + curated calc library (Growth%, YoY, % of parent, margin) + the **MDX allow-list validator** in `mdx_builder.py`. | Growth% column computed by the engine matches PAW to the cent; an off-whitelist expression is rejected 400. | **backend-dev** (validator + MDX assembly) | tm1-developer (validate MDX idioms), integration-engineer (async if slow) |
| **4** | **Subset-WRITE endpoint** (`POST /tm1/subset/save/`, static + validated-dynamic) + `CanWriteSubset` gate + cube/name whitelist (closes §0 gap) + POPIA audit. | Save-as a static set and a dynamic TOPCOUNT subset to staging TM1; reload and see it; injection attempt rejected. | **backend-dev** | tm1-developer (subset MDX), integration-engineer (write transport) |
| **5** | **Set-editor-as-tree** + search-with-descendants + attributes-as-columns; **conditional formatting/heatmap**; **Excel export** (client-side). | Set editor shows the hierarchy as a tree with twisties/icons; growth% heatmap renders; "Download" produces the visible grid as `.xlsx`. | **frontend-dev** | backend-dev (`descendants` resolve) |
| **6** | **Performance hardening**: Redis read cache (role-keyed, tag-invalidate by cube) + Stargate pre-warm after sync + async-OData big-slice path + (only if a real slice needs it) column windowing. | A wide crossjoin that took >5s cold returns <500ms warm; a >60s slice survives via async; cache invalidates on next sync. | **integration-engineer** (async/transport/circuit-breaker) | backend-dev (cache/audit), tm1-developer (confirm feeder health on planning cubes) |
| **— PHASE 1 SHIP LINE: PAW-grade read, live, verified —** | | | | |
| **7** | **Phase 2 design ratification**: CFO/CCO resolve the sandbox conflict (§2.2); POPIA re-assessment; financial-integrity gate. **No code.** | Signed ADR: sandbox model for writeback (A/B/C), gate cleared. | **tm1-architect** + CFO + CCO | — |
| **8** | **Writeback MVP** (only after Step 7): single-cell edit → cellset PATCH → commit, with optimistic-lock 409, in the chosen sandbox model, internal-only, idempotent. | A planner edits a forecast cell in the console, commits, value persists (sandbox→base per the decision); a concurrent edit is rejected, not clobbered. | **integration-engineer** (write transport/idempotency) | backend-dev (DRF/audit), tm1-developer (sandbox/spread TI), frontend-dev (entry UI) |
| **9** | **Spreading** (proportional/equal/repeat/% via native operators, structured). | Spread a number across a consolidation's leaves from the console, matching PAW. | **integration-engineer** | tm1-developer (spread semantics), frontend-dev |

**Why this order:** Steps 1–2 are pure render over an engine that's already ready — fastest visible PAW-parity, zero risk. Step 3 adds the first server-built MDX cleverness (calc) but stays read-only. Step 4 is the first *write* (subsets) and earns the security scaffolding (whitelist + validator + gate) that Phase 2 reuses. Steps 5–6 polish + harden. The ship line is a genuine "PAW-grade read for most users." Phase 2 is gated behind a decision, not a date.

---

## 4. Recommended Step 1 — nested columns (the architect's call)

**Land nested columns first.** It is the single biggest gap (brief: "biggest gap"), the **engine already supports it** (§0), the hard client-side pattern **already exists on the row axis** to mirror, and it carries **zero writeback risk**. It is the cheapest path to "this is no longer mediocre" and it de-risks everything after it (measures-as-axis and calc members both render *through* the nested-column band Step 1 builds). The only backend change is making the response envelope authoritative (axis `dimensions` + tuple arrays) — small, additive, non-breaking.

---

## 5. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| **Feeder health on the planning cubes** unknown; a wide crossjoin with bad feeders is slow *and* can return wrong consolidations. | High | `tm1-developer` audits feeders on `gl_pln_forecast` family before Step 6; `SKIPCHECK` + correct feeders is the prerequisite for `NON EMPTY` performance (`02-rules-and-feeders.md`, `04-mdx.md`). |
| **Transport not hardened** — fresh `requests.Session` per call, `verify=False`, no whitelist (§0). | High (esp. before Step 4 write) | integration-engineer: single reused session + `verify=<CA-bundle>`; backend-dev: cube whitelist in `mdx_builder.py`. **Whitelist is a hard gate for Step 4.** |
| **MDX injection via calc-member / dynamic-subset authoring** (the deliberate exceptions to "no raw MDX"). | High | Single shared allow-list validator (functions + whitelisted dims/members, no `}`-control refs, no `StrToMember` on user input). Staff-gated. Defence reviewed by integration-engineer + cco. |
| **Sandbox decision conflict** (§2.2) blocks Phase 2 cleanly. | Medium | Resolve at Step 7 *before* any writeback code; my recommendation = option C (hybrid). |
| **Scope creep into "Excel replacement" / "raw MDX editor"** — both explicitly out per read-path skill §8. | Medium | Hold the line: client-side "download what I see" only; validated subset/calc MDX only, never free query MDX. |
| **Stargate/Redis cache staleness** showing planners old numbers mid-edit. | Medium | Short TTL (60–300s), tag-invalidate by cube on sync; Phase 2 writeback bypasses read cache for the editing user (read-through-own-writes). |
| **The "why ours over PAW" reason stays unproven** → build effort without payoff. | Medium (product) | Each step is independently shippable + live-verified; if value isn't landing by Step 3, re-evaluate before Step 4's write complexity. |

---

## 6. Open questions for MC

1. **Excel export** (§1.5): client-side "download the visible grid" — OK as PAW-parity table-stakes, despite read-path skill §8 saying "not Klikk's job"? (I recommend yes, scoped to download-what-you-see, not Excel-from-TM1.)
2. **Calc-member authoring reach** (§1.3): curated library for all users + raw calc-MDX authoring for **staff/architect only** — agree? Or do power-users (CIMA-level analysts) get authoring too?
3. **Subset Save-as scope** (§1.4): public subsets to **staging** only, with "promote via model deployment for shared use" — or do you want a direct path to a PROD TM1 once it exists? (PROD is TBD per 2026-06-03.)
4. **Sandbox conflict** (§2.2 — the big one): for Phase 2 writeback, A (no sandbox, last-write-wins, matches 2026-06-03), B (sandboxes for the viewer, reverses it), or C (hybrid — read for most, sandboxed write for a planner group)? This reopens a locked decision and needs CFO→CCO.
5. **Feeder audit** (§5): can `tm1-developer` get a window to verify feeder health on the `gl_pln_forecast` family before Step 6 drives heavy traffic?
6. **Service-account vs per-user TM1 identity** (read-path skill §3): stay on Pattern A (service-account passthrough, role-keyed cache) for the read surface, or does "replace PAW for most users" change the security-context calculus toward per-user TM1 identity?

---

## 7. Constraints reaffirmed (every phase)

- **TM1 internal-only** (POPIA §21 sub-processor; financial data). The Django bridge is the **only** public surface — never browser→TM1, never PAW/PAfE/REST exposed publicly. Holds for read *and* write. (`klikk-tm1-integration` reflex #1.)
- **No raw cube-query MDX from users.** Server builds the `SELECT` MDX from structured params. The *only* user-authored MDX is **validated, single-dimension** subset/calc expressions, staff-gated. (Reflex #11 + the deliberate, constrained exception.)
- **Cellset hygiene.** Every create paired with a delete (already done in `execute_mdx`); for any new raw-REST path, create+delete in try/finally; prefer TM1py helpers. (Reflex #12.)
- **One reused session; `async_requests_mode` behind the LB; `verify=<CA-bundle>`.** (Transport hardening — integration-engineer, §8.)
- **No ad-hoc prod writes.** Subsets/calc land on **staging**; durable model objects promote via `tm1project` source control, not console writes — *especially* during budget season.
- **Source of truth = Xero, not TM1.** The viewer reads/writes the planning model; it never writes back to Xero.

---

## 8. Boundary — who owns what (architect's contract)

- **tm1-architect (me):** this design, the axis/calc/subset/writeback model, the security model for the new write surfaces, the sandbox-decision recommendation, the phase gates. I review every step against PAW-parity + the constraints.
- **tm1-developer (my report):** model-side — confirm feeder health on planning cubes; validate the subset/calc MDX idioms; build any spreading TI and the sandbox/commit TI for Phase 2; promote durable subsets via `tm1project`.
- **integration-engineer (CTO chain, across the boundary):** the Django↔TM1 **transport** — reused session, `verify`, retry/backoff/circuit-breaker, the async-OData big-slice path, write idempotency. They build the pipe; I define the contract (this doc). Neither reaches into the other's code.
- **backend-dev:** the DRF surface — formalise the query envelope, the subset-save endpoint, `mdx_builder.py` (whitelist + allow-list validator), the Redis read cache, the POPIA audit logger, permission classes.
- **frontend-dev:** the Vue grid — nested column band, measures-as-axis UI, set-editor-as-tree, conditional formatting, Excel export, (Phase 2) data-entry/spreading UI. Per the 2026-05-26 lesson: mount-based tests, live-verify; `frontend-verifier` before any CTO frontend GO.

---

**Bottom line:** the engine is already PAW-capable; Phase 1 is mostly a *frontend render* program over a query contract that barely needs to change, plus one new (gated) subset-write endpoint and a server-side calc-member capability. Ship nested columns first. Defer writeback behind a financial-integrity gate and resolve the sandbox-model conflict before a line of Phase-2 code. TM1 stays internal-only throughout.
