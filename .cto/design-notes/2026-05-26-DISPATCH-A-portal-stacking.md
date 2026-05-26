# Dispatch A — Portal stacking fix (kit-wide)

DATE: 2026-05-26
OWNER: senior-dev (frontend specialist)
PRIORITY: P0 — blocks Investec Account ship.
BRANCH: feat/headless-migration (existing)

## Goal
Make every Reka-portalled dropdown (Select, Tooltip, Popover, Menu, CommandPalette,
Dialog) stack ABOVE in-page sticky elements (notably KTable's sticky thead at
z-index 2). One mechanism, fixed once at the kit layer.

## Constraints
- DO NOT touch KTable.vue. A separate senior-dev has an in-flight column-alignment
  fix on it. Check git status / branch state before starting.
- KDL tokens only. No magic z-index numbers in components after this fix.
- No inline `style="..."` with tokens (standing policy).
- Tests pass at >= current count (72/72 + the KTable alignment additions in flight).

## Approach
1. Add z-index design tokens to `src/css/klikk.css` (the existing token root —
   confirm filename, may be `src/css/tokens.css` or similar):
     --kdl-z-dropdown:  1000
     --kdl-z-sticky:    1100
     --kdl-z-popover:   1200
     --kdl-z-tooltip:   1300
     --kdl-z-modal:     1400
     --kdl-z-toast:     1500
   (Sticky-thead re-tokenisation is a FOLLOW-UP, not part of this dispatch — KTable
   is off-limits this round.)

2. For each of these components, MOVE the portal-content CSS rules out of `<style scoped>`:
   - KSelect.vue (priority — drives Investec fix)
     Rules to move: .kselect-content, .kselect-viewport, .kselect-item,
     .kselect-item[data-highlighted], .kselect-item[data-state="checked"],
     .kselect-item[data-disabled], .kselect-item-icon, .kselect-item-indicator,
     .kselect-scroll-btn, and the :root[data-theme="dark"] .kselect-content rule.
   - KMultiSelect.vue (same pattern — .kmselect-* rules)
   - KMenu.vue, KPopover.vue, KTooltip.vue, KCommandPalette.vue, KDialog.vue —
     INSPECT first. If their z-index lives inside `<style scoped>`, move it. If
     they're already using a non-scoped block or have no z-index conflict observed,
     leave alone and note as follow-up.

3. Two acceptable shapes — pick whichever is cleaner per-component:
   (a) SPLIT block pattern: add a second `<style>` (unscoped) block to the same
       .vue file, containing only portal-content rules. `<style scoped>` keeps
       everything else (trigger, label, messages, etc.).
   (b) GLOBAL stylesheet: create `src/css/portals.css`, import from `src/main.js`
       once, put all portal-content rules there.
   Lean towards (a) for cohesion (rules stay in the component file); (b) is fine
   if it ends up being many small migrations.

4. Each migrated portal-content rule uses `z-index: var(--kdl-z-popover)` (Select,
   Multiselect, Menu, Popover), `var(--kdl-z-tooltip)` (Tooltip), `var(--kdl-z-modal)`
   (Dialog), `var(--kdl-z-popover)` (CommandPalette popper) / `var(--kdl-z-modal)`
   (CommandPalette overlay if it has one).

## Acceptance criteria
- [ ] z-index tokens added and documented.
- [ ] KSelect dropdown options render ABOVE a sticky thead (z-index 2) when placed in
      a FilterBar above a KTable.
- [ ] KMultiSelect parity confirmed.
- [ ] No regression on KTooltip / KPopover / KMenu / KDialog / KCommandPalette stacking.
- [ ] Vitest count strictly increases by at least 2 (KSelect.stacking.spec.ts,
      KMultiSelect.stacking.spec.ts).
- [ ] Existing tests all still pass.

## Vitest gates (MC standing policy — fix must come with the test)
File: `src/components/klikk/__tests__/KSelect.stacking.spec.ts`
Cases:
  1. Mount `<KSelect :options="['a','b']" />` inside a wrapper with a sibling sticky
     element at z-index 2. Trigger open. Query
     `[data-reka-popper-content-wrapper]` from `document.body`. Read computed
     `z-index` — assert > 2 AND is a finite number (not "auto").
  2. Assert the value resolves to the token (compare against
     `getComputedStyle(document.documentElement).getPropertyValue('--kdl-z-popover')`).

File: `src/components/klikk/__tests__/KMultiSelect.stacking.spec.ts`
Same shape.

## Out of scope
- Re-tokenising KTable's sticky thead z-index. Follow-up after the in-flight KTable
  alignment work lands.
- Other primitives that don't currently exhibit stacking conflicts.
- Visual design of the dropdowns (CDO chain).

## Risks
- Floating UI watchEffect reads `getComputedStyle(contentElement).zIndex` on mount.
  If the global stylesheet hasn't loaded by then (very first render after a hard
  refresh), the z-index can briefly resolve to "auto". Acceptable — Floating UI
  re-evaluates on subsequent opens and the stylesheet is bundled, so this is a
  pure dev-HMR-edge-case, not a prod issue.
- Some Reka components don't use SelectPortal — they use DialogPortal /
  PopperPortal etc. Confirm each portal-host's actual mount target is `document.body`
  before assuming the kit-wide fix applies. Spot-check via DOM inspection on dev.
