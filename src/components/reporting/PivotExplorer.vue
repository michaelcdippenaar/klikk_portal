<template>
  <SectionCard
    title="Slice &amp; Dice (TM1)"
    description="Pivot any TM1 cube as a live exploration grid. A PAW-lite explorer; nothing here writes back to TM1."
  >
    <div class="pivot">
      <!-- ════════════════════════════════════════════════════════════════════
           1 ── TOOLBAR — cube picker + actions, one compact row.
           ═════════════════════════════════════════════════════════════════ -->
      <div class="pivot-toolbar">
        <div class="pivot-toolbar__cube">
          <KSelect
            v-model="cube"
            class="pivot-toolbar__cube-select"
            placeholder="Select a TM1 cube…"
            :options="cubeOptions"
            :disabled="cubesLoading || !!cubesError"
            aria-label="TM1 cube"
          />
        </div>

        <div class="pivot-toolbar__actions">
          <KToggle v-model="suppressEmpty" label="Suppress zeros" />

          <button
            type="button"
            class="pivot-toolbar__btn"
            :disabled="!canSwap || running"
            title="Swap rows and columns"
            aria-label="Swap rows and columns"
            @click="swapAxes"
          >
            <svg
              class="pivot-toolbar__btn-icon"
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.75"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <polyline points="16 3 20 7 16 11" />
              <line x1="20" y1="7" x2="4" y2="7" />
              <polyline points="8 21 4 17 8 13" />
              <line x1="4" y1="17" x2="20" y2="17" />
            </svg>
            <span>Swap</span>
          </button>

          <!-- Refresh runs/re-runs the query. While a fetch is in flight it is
               REPLACED by Cancel (interim freeze-guard companion): Cancel aborts
               the in-flight TM1 fetch, leaves the previous grid intact, and flips
               back to Refresh. The render-freeze itself is handled by the row cap;
               Cancel is purely for aborting a slow/large NETWORK fetch. -->
          <button
            v-if="!running"
            type="button"
            class="pivot-toolbar__btn"
            :disabled="!canRun"
            @click="runQuery"
          >
            <svg
              class="pivot-toolbar__btn-icon"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.75"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <polyline points="23 4 23 10 17 10" />
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
            </svg>
            <span>Refresh</span>
          </button>

          <button
            v-else
            type="button"
            class="pivot-toolbar__btn pivot-toolbar__btn--cancel"
            title="Cancel the in-flight TM1 query"
            aria-label="Cancel the in-flight TM1 query"
            @click="cancelQuery"
          >
            <svg
              class="pivot-toolbar__btn-icon"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.75"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <line x1="6" y1="6" x2="18" y2="18" />
              <line x1="18" y1="6" x2="6" y2="18" />
            </svg>
            <span>Cancel</span>
          </button>

          <span v-if="running" class="pivot-toolbar__busy" role="status">
            <KSpinner size="xs" tone="accent" label="Querying TM1" />
            <span>Running…</span>
          </span>
        </div>
      </div>

      <!-- Cube-load / dimension-load status (thin, inline). -->
      <p v-if="cubesError" class="pivot-banner pivot-banner--error">{{ cubesError }}</p>
      <p v-else-if="cubesLoading" class="pivot-banner">
        <KSpinner size="xs" tone="muted" label="Loading cubes" />
        <span>Loading cubes…</span>
      </p>
      <p v-else-if="cube && dimsLoading" class="pivot-banner">
        <KSpinner size="xs" tone="accent" label="Loading dimensions" />
        <span>Loading dimensions for {{ cube }}…</span>
      </p>
      <p v-else-if="cube && dimsError" class="pivot-banner pivot-banner--error">{{ dimsError }}</p>

      <!-- ════════════════════════════════════════════════════════════════════
           2 ── CONTEXT BAR — filter dimensions as dropdown pills.
                Each reads "Dimension: Member"; clicking opens its member picker.
           ═════════════════════════════════════════════════════════════════ -->
      <div
        v-if="cube && !dimsLoading && !dimsError && filterDims.length"
        class="pivot-context pivot-dropzone"
        :class="{ 'pivot-dropzone--active': dropZone === 'filter' && draggingDim }"
        role="group"
        aria-label="Filter context — drop a dimension here to filter by it"
        @dragover.prevent="onZoneDragOver('filter')"
        @dragenter.prevent="onZoneDragOver('filter')"
        @dragleave="(e) => onZoneDragLeave(e, 'filter')"
        @drop.prevent="onZoneDrop('filter')"
      >
        <span class="pivot-context__label">Context</span>
        <div class="pivot-context__pills">
          <!-- Each filter dimension is a token holding three affordances: a
               leading GRIP HANDLE (the sole drag-initiation surface), the
               member-picker (KPopover, tap-to-change-member) and a move menu
               (KMenu, the keyboard/non-drag path to Rows / Columns). Only the
               grip is draggable — the group + both buttons set draggable=false
               so a quick mouse-drag that starts on a button is never swallowed
               as a click; the grip owns dragging unambiguously. -->
          <div
            v-for="dim in filterDims"
            :key="`ctx-${dim}`"
            class="pivot-pill-group pivot-token"
            :class="{ 'pivot-token--dragging': draggingDim === dim }"
            draggable="false"
            :title="`${dim} — grab the handle to drag to Rows or Columns, or use the move menu`"
          >
            <span
              class="pivot-grip"
              draggable="true"
              role="button"
              :aria-label="`Drag ${dim} to rows, columns or filter`"
              :title="`Drag ${dim} to rows, columns or filter`"
              @dragstart="(e) => onDimDragStart(e, dim)"
              @dragend="onDimDragEnd"
            >
              <svg
                class="pivot-grip__icon"
                width="10"
                height="16"
                viewBox="0 0 10 16"
                fill="currentColor"
                aria-hidden="true"
              >
                <circle cx="3" cy="3" r="1.25" />
                <circle cx="7" cy="3" r="1.25" />
                <circle cx="3" cy="8" r="1.25" />
                <circle cx="7" cy="8" r="1.25" />
                <circle cx="3" cy="13" r="1.25" />
                <circle cx="7" cy="13" r="1.25" />
              </svg>
            </span>

            <KPopover
              :model-value="openPicker === `filter:${dim}`"
              @update:model-value="(o) => togglePicker(`filter:${dim}`, o, dim)"
            >
              <template #trigger>
                <button
                  type="button"
                  class="pivot-pill"
                  draggable="false"
                  :aria-label="`${dim}: ${filterSelections[dim] ? displayMember(dim, filterSelections[dim]) : 'none'} — change member`"
                >
                  <span class="pivot-pill__dim">{{ dim }}</span>
                  <span class="pivot-pill__sep" aria-hidden="true">:</span>
                  <span
                    class="pivot-pill__member"
                    :title="filterPrincipalTitle(dim)"
                  >{{ filterSelections[dim] ? displayMember(dim, filterSelections[dim]) : '—' }}</span>
                  <svg
                    class="pivot-pill__chevron"
                    width="11"
                    height="11"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>
              </template>

              <div class="pivot-picker">
                <p class="pivot-picker__title">{{ dim }}</p>
                <KSelect
                  v-if="elementCache[dim] && !elementCache[dim].error"
                  :model-value="filterSelections[dim]"
                  class="pivot-picker__control"
                  :options="elementOptions(dim)"
                  :placeholder="memberPlaceholder(dim)"
                  :aria-label="`Filter member for ${dim}`"
                  @update:model-value="(v) => setFilterMember(dim, v)"
                />
                <button
                  v-else
                  type="button"
                  class="pivot-picker__load"
                  :disabled="isElementsLoading(dim)"
                  @click="ensureElements(dim)"
                >
                  <KSpinner v-if="isElementsLoading(dim)" size="xs" tone="muted" />
                  <span>{{ loadBtnLabel(dim) }}</span>
                </button>
                <p v-if="elementError(dim)" class="pivot-picker__error">{{ elementError(dim) }}</p>
              </div>
            </KPopover>

            <!-- INLINE ALIAS PICKER — the first-class, always-visible "display
                 attribute" control (PAW shows it right on the dimension). Shown
                 whenever the dim has ≥1 alias; reads "· <active label> ▾" and
                 opens a compact menu of principal + every alias (the active one
                 checked). Display-only — selecting one relabels the pills/grid
                 live via setDimAlias; the pivot query is never aliased. -->
            <KMenu
              v-if="dimAliasList[dim] && dimAliasList[dim].length"
              align="start"
              :model-value="openAliasMenu === `filter:${dim}`"
              @update:model-value="(o) => toggleAliasMenu(`filter:${dim}`, o)"
            >
              <template #trigger>
                <button
                  type="button"
                  class="pivot-pill__alias"
                  draggable="false"
                  :aria-label="`Display label for ${dim}: ${aliasButtonLabel(dim)} — change`"
                  :title="`Display ${dim} elements under: ${aliasButtonLabel(dim)}`"
                >
                  <span class="pivot-pill__alias-sep" aria-hidden="true">·</span>
                  <span class="pivot-pill__alias-name">{{ aliasButtonLabel(dim) }}</span>
                  <svg
                    class="pivot-pill__alias-chevron"
                    width="10"
                    height="10"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>
              </template>

              <KMenuItem
                :icon="!dimAlias[dim] ? 'check' : null"
                @select="chooseAlias(`filter:${dim}`, dim, '')"
              >
                principal name
              </KMenuItem>
              <KMenuItem
                v-for="a in dimAliasList[dim]"
                :key="`ctx-inline-alias-${dim}-${a}`"
                :icon="dimAlias[dim] === a ? 'check' : null"
                @select="chooseAlias(`filter:${dim}`, dim, a)"
              >
                {{ a }}
              </KMenuItem>
            </KMenu>

            <!-- Move menu — keyboard-operable equivalent of dragging this pill
                 onto an axis well. Current role is filter, so only the two axis
                 targets are offered. (Alias selection is the inline control above
                 now — the discoverable, always-visible path.) -->
            <KMenu
              align="end"
              :model-value="openCtxMenu === dim"
              @update:model-value="(o) => toggleCtxMenu(dim, o)"
            >
              <template #trigger>
                <button
                  type="button"
                  class="pivot-pill__move"
                  draggable="false"
                  :aria-label="`Move ${dim} to Rows or Columns`"
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                  >
                    <circle cx="12" cy="5" r="1" />
                    <circle cx="12" cy="12" r="1" />
                    <circle cx="12" cy="19" r="1" />
                  </svg>
                </button>
              </template>

              <KMenuItem @select="moveCtxDimension(dim, 'rows')">Move to Rows</KMenuItem>
              <KMenuItem @select="moveCtxDimension(dim, 'cols')">Move to Columns</KMenuItem>
            </KMenu>
          </div>
        </div>
      </div>

      <!-- ════════════════════════════════════════════════════════════════════
           3 ── AXIS WELLS — Rows / Columns zones, each showing its dimension
                chips. A chip menu moves the dimension between axes / filter.
           ═════════════════════════════════════════════════════════════════ -->
      <div
        v-if="cube && !dimsLoading && !dimsError && dimensions.length"
        class="pivot-wells"
      >
        <div
          class="pivot-well pivot-dropzone"
          :class="{ 'pivot-dropzone--active': dropZone === 'rows' && draggingDim }"
          role="group"
          aria-label="Rows axis — drop a dimension here to put it on rows"
          @dragover.prevent="onZoneDragOver('rows')"
          @dragenter.prevent="onZoneDragOver('rows')"
          @dragleave="(e) => onZoneDragLeave(e, 'rows')"
          @drop.prevent="onZoneDrop('rows')"
        >
          <span class="pivot-well__label">Rows</span>
          <div class="pivot-well__chips">
            <PivotAxisChip
              v-for="dim in rowDims"
              :key="`row-${dim}`"
              :dim="dim"
              axis="rows"
              :open="openChipMenu === `rows:${dim}`"
              :alias-open="openAliasMenu === `rows:${dim}`"
              :dragging="draggingDim === dim"
              :aliases="dimAliasList[dim] || []"
              :active-alias="dimAlias[dim] || ''"
              @toggle="(o) => toggleChipMenu(`rows:${dim}`, o)"
              @toggle-alias="(o) => toggleAliasMenu(`rows:${dim}`, o)"
              @move="(target) => moveDimension(dim, target)"
              @edit="openSetEditor(dim)"
              @alias="(a) => chooseAlias(`rows:${dim}`, dim, a)"
              @dragstart="(e) => onDimDragStart(e, dim)"
              @dragend="onDimDragEnd"
            />
            <span v-if="!rowDims.length" class="pivot-well__empty">none</span>
          </div>
        </div>

        <div
          class="pivot-well pivot-dropzone"
          :class="{ 'pivot-dropzone--active': dropZone === 'cols' && draggingDim }"
          role="group"
          aria-label="Columns axis — drop a dimension here to put it on columns"
          @dragover.prevent="onZoneDragOver('cols')"
          @dragenter.prevent="onZoneDragOver('cols')"
          @dragleave="(e) => onZoneDragLeave(e, 'cols')"
          @drop.prevent="onZoneDrop('cols')"
        >
          <span class="pivot-well__label">Columns</span>
          <div class="pivot-well__chips">
            <PivotAxisChip
              v-for="dim in colDims"
              :key="`col-${dim}`"
              :dim="dim"
              axis="cols"
              :open="openChipMenu === `cols:${dim}`"
              :alias-open="openAliasMenu === `cols:${dim}`"
              :dragging="draggingDim === dim"
              :aliases="dimAliasList[dim] || []"
              :active-alias="dimAlias[dim] || ''"
              @toggle="(o) => toggleChipMenu(`cols:${dim}`, o)"
              @toggle-alias="(o) => toggleAliasMenu(`cols:${dim}`, o)"
              @move="(target) => moveDimension(dim, target)"
              @edit="openSetEditor(dim)"
              @alias="(a) => chooseAlias(`cols:${dim}`, dim, a)"
              @dragstart="(e) => onDimDragStart(e, dim)"
              @dragend="onDimDragEnd"
            />
            <span v-if="!colDims.length" class="pivot-well__empty">none</span>
          </div>
        </div>
      </div>

      <!-- ════════════════════════════════════════════════════════════════════
           4 ── THE PIVOT GRID — the hero. Frozen row-header column + frozen
                column-header band; drillable indented row hierarchy; totals.
           ═════════════════════════════════════════════════════════════════ -->
      <p v-if="cube && runError" class="pivot-banner pivot-banner--error">{{ runError }}</p>

      <EmptyState
        v-else-if="!cube && !cubesLoading && !cubesError"
        icon="▦"
        title="Choose a cube to begin"
        body="Pick a TM1 cube above. Its dimensions load automatically and the grid opens populated."
      />

      <EmptyState
        v-else-if="cube && !dimsLoading && !dimsError && !dimensions.length"
        icon="∅"
        title="No dimensions"
        :body="`The cube ${cube} returned no dimensions.`"
      />

      <p v-else-if="cube && !canRun && !running && !result" class="pivot-banner">
        Put at least one dimension on Rows and one on Columns to run a query.
      </p>

      <template v-else-if="result">
        <EmptyState
          v-if="!displayRows.length"
          icon="∅"
          title="No data"
          body="The query returned no rows. Try a different member, or turn off Suppress zeros."
        />
        <div
          v-else
          class="pivot-grid-wrap"
          :class="{ 'pivot-grid-wrap--busy': running }"
        >
          <table
            class="pivot-grid"
            :aria-label="`${cube} pivot — ${isCapped ? `showing first ${renderRows.length.toLocaleString()} of ${visibleRows.length.toLocaleString()}` : visibleRows.length.toLocaleString()} rows by ${displayColHeaders.length} columns`"
          >
            <thead>
              <!-- NESTED COLUMN-HEADER BAND: one <tr> per column dimension
                   (outer→inner). Each band cell colspan-spans the surviving leaf
                   columns beneath its tuple-prefix (classic merged-header pivot,
                   the column-side dual of the row outer-tuple grouping). The
                   frozen CORNER (rowspan = full band depth, one frozen column
                   wide) and the TOTAL head (rowspan = full band depth) sit on the
                   FIRST band row and span downward. The INNERMOST band row's cells
                   carry the per-leaf labels the data cells align to and keep the
                   `pivot-grid__col-head` contract (alias/:title) verbatim. -->
              <tr
                v-for="(band, bi) in colBand"
                :key="`band-${band.level}`"
                class="pivot-grid__col-band-row"
                :style="{ '--band-level': band.level }"
              >
                <!-- Corner + Total only on the first band row; they rowspan the band. -->
                <th
                  v-if="bi === 0"
                  class="pivot-grid__corner"
                  scope="col"
                  :rowspan="colBandDepth"
                >
                  {{ rowAxisLabel }}
                </th>

                <!-- The INNERMOST band row carries the per-leaf labels the data
                     cells align to → it keeps the `pivot-grid__col-head` contract
                     (the selector every existing test + the alias logic reads as
                     "a leaf column header"). OUTER (group) cells get ONLY
                     `pivot-grid__col-group` so that contract still means LEAVES,
                     not the spanning year/measure bands above them. -->
                <th
                  v-for="cell in band.cells"
                  :key="cell.key"
                  :scope="cell.isInner ? 'col' : 'colgroup'"
                  :colspan="cell.span"
                  :class="[
                    'pivot-num',
                    cell.isInner ? 'pivot-grid__col-head' : 'pivot-grid__col-group',
                  ]"
                  :title="bandCellTitle(cell)"
                >
                  {{ bandCellLabel(cell) }}
                </th>

                <th
                  v-if="bi === 0"
                  class="pivot-grid__col-head pivot-grid__total-head pivot-num"
                  scope="col"
                  :rowspan="colBandDepth"
                >
                  Total
                </th>
              </tr>
            </thead>

            <tbody>
              <!-- INTERIM FREEZE-GUARD: iterate the CAPPED renderRows, never the
                   full displayRows — capping the rendered body is what stops a
                   wide view freezing the tab. Totals (tfoot below) still sum the
                   full displayRows via colTotals / grandTotal. -->
              <tr
                v-for="row in renderRows"
                :key="row.key"
                class="pivot-grid__row"
                :class="{
                  'pivot-grid__row--consol': row.drillable,
                  'pivot-grid__row--parent': row.isOuterParent,
                }"
                :aria-level="row.level + 1"
              >
                <th
                  class="pivot-grid__row-head"
                  :class="{
                    'pivot-grid__row-head--consol': row.drillable,
                    'pivot-grid__row-head--parent': row.isOuterParent,
                  }"
                  scope="row"
                >
                  <!-- The frozen row-header band. In the PAW-style nested shape each
                       row carries ONE segment for its own level — an OUTER-PARENT
                       group header (collapse twisty, no re-query) or the INNERMOST
                       drill node (drill twisty, re-queries) — indented by depth.
                       The pre-response / no-tree fallback lays its plain segments
                       side-by-side (legacy). Either way it stays one frozen column,
                       so the sticky-left pane is intact (no per-column offsets). -->
                  <span class="pivot-grid__row-head-band">
                    <span
                      v-for="hcell in row.headerCells"
                      :key="hcell.key"
                      class="pivot-grid__row-seg"
                      :class="{
                        'pivot-grid__row-seg--inner': hcell.isInner,
                        'pivot-grid__row-seg--parent': hcell.isOuterParent,
                      }"
                      :style="(hcell.isInner || hcell.isOuterParent)
                        ? { '--row-indent': `${hcell.level * INDENT_PX}px` }
                        : null"
                    >
                      <!-- OUTER-PARENT: client-side collapse twisty (toggleOuter,
                           never re-queries). aria-expanded = NOT collapsed. -->
                      <button
                        v-if="hcell.isOuterParent"
                        type="button"
                        class="pivot-grid__twisty"
                        :aria-expanded="!hcell.collapsed"
                        :aria-label="`${hcell.collapsed ? 'Expand' : 'Collapse'} ${displayMember(hcell.dim, hcell.member)}`"
                        @click="toggleOuter(hcell.outerKey)"
                      >
                        <svg
                          class="pivot-grid__twisty-icon"
                          :class="{ 'pivot-grid__twisty-icon--open': !hcell.collapsed }"
                          width="10"
                          height="10"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="3"
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          aria-hidden="true"
                        >
                          <polyline points="9 6 15 12 9 18" />
                        </svg>
                      </button>
                      <!-- INNERMOST drill: the existing consolidation drill (re-
                           queries children). Leaves get a spacer to align labels. -->
                      <template v-else-if="hcell.isInner">
                        <button
                          v-if="hcell.drillable"
                          type="button"
                          class="pivot-grid__twisty"
                          :class="{ 'pivot-grid__twisty--busy': drilling === hcell.drillKey }"
                          :disabled="drilling === hcell.drillKey"
                          :aria-expanded="hcell.expanded"
                          :aria-label="`${hcell.expanded ? 'Collapse' : 'Expand'} ${displayMember(hcell.dim, hcell.member)}`"
                          @click="toggleRow(row)"
                        >
                          <KSpinner v-if="drilling === hcell.drillKey" size="xs" tone="muted" />
                          <svg
                            v-else
                            class="pivot-grid__twisty-icon"
                            :class="{ 'pivot-grid__twisty-icon--open': hcell.expanded }"
                            width="10"
                            height="10"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="3"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            aria-hidden="true"
                          >
                            <polyline points="9 6 15 12 9 18" />
                          </svg>
                        </button>
                        <span v-else class="pivot-grid__twisty-spacer" aria-hidden="true" />
                      </template>
                      <span
                        class="pivot-grid__row-label"
                        :title="rowSegTitle(hcell)"
                      >{{ displayMember(hcell.dim, hcell.member) }}</span>
                    </span>
                  </span>
                </th>

                <td
                  v-for="ci in displayColIndices"
                  :key="`c-${row.key}-${ci}`"
                  class="pivot-grid__cell pivot-num"
                  :class="cellClass(row.cells[ci])"
                >
                  {{ formatCell(row.cells[ci]) }}
                </td>

                <td
                  class="pivot-grid__cell pivot-grid__total-cell pivot-num"
                  :class="totalClass(row.rowTotal)"
                >
                  {{ formatTotal(row.rowTotal) }}
                </td>
              </tr>
            </tbody>

            <tfoot>
              <tr class="pivot-grid__total-row">
                <th class="pivot-grid__row-head pivot-grid__total-corner" scope="row">Total</th>
                <td
                  v-for="(total, ci) in colTotals"
                  :key="`ctot-${ci}`"
                  class="pivot-grid__cell pivot-grid__total-cell pivot-num"
                  :class="totalClass(total)"
                >
                  {{ formatTotal(total) }}
                </td>
                <td
                  class="pivot-grid__cell pivot-grid__grand-total pivot-num"
                  :class="totalClass(grandTotal)"
                >
                  {{ formatTotal(grandTotal) }}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </template>

      <!-- INTERIM FREEZE-GUARD banner — shown ONLY when the surviving row set
           exceeds MAX_RENDER_ROWS, i.e. the body was truncated. The totals footer
           below still reflects the FULL set; this only tells the user the BODY is
           capped and how to narrow it. Removed when virtualisation supersedes the
           cap. role="status" so it's announced; aria-live polite (non-error). -->
      <p
        v-if="cube && result && isCapped"
        class="pivot-banner pivot-banner--notice"
        data-test="pivot-cap-banner"
        role="status"
        aria-live="polite"
      >
        Showing the first {{ MAX_RENDER_ROWS.toLocaleString() }} of
        {{ visibleRows.length.toLocaleString() }} rows — refine your selection
        (drill in, collapse a group, filter, or turn on Suppress zeros), or wait
        for full virtualisation.
      </p>

      <!-- ════════════════════════════════════════════════════════════════════
           Footer — grid size + Show MDX disclosure (kept).
           ═════════════════════════════════════════════════════════════════ -->
      <div v-if="cube && result && displayRows.length" class="pivot-footer">
        <span v-if="gridSizeLabel" class="pivot-footer__size">{{ gridSizeLabel }}</span>

        <button
          v-if="hasExpansions || collapsedRowKeys.size"
          type="button"
          class="pivot-footer__reset"
          @click="resetToDefault"
        >
          Reset view
        </button>

        <div class="pivot-footer__spacer" />

        <div v-if="mdxText" class="pivot-mdx">
          <button
            type="button"
            class="pivot-mdx__toggle"
            :aria-expanded="showMdx"
            aria-controls="pivot-mdx-body"
            @click="showMdx = !showMdx"
          >
            <svg
              class="pivot-mdx__chevron"
              :class="{ 'pivot-mdx__chevron--open': showMdx }"
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <polyline points="9 6 15 12 9 18" />
            </svg>
            <span>{{ showMdx ? 'Hide MDX' : 'Show MDX' }}</span>
          </button>
        </div>
      </div>

      <pre
        v-if="mdxText"
        v-show="showMdx"
        id="pivot-mdx-body"
        class="pivot-mdx__code"
      >{{ mdxText }}</pre>
    </div>

    <!-- ════════════════════════════════════════════════════════════════════════
         SET EDITOR — PAW-style Subset Editor, opened from an axis chip's
         "Edit set…" menu item. Applies a hierarchy + ordered member list back
         onto the axis, then re-queries through the shared reseed path.
         ═════════════════════════════════════════════════════════════════════ -->
    <SetEditor
      v-if="editorDim"
      v-model="editorOpen"
      :dimension="editorDim"
      :hierarchy="dimHierarchy[editorDim] || null"
      :members="memberSelections[editorDim] || []"
      @apply="applySet"
    />
  </SectionCard>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import SectionCard from '../klikk/SectionCard.vue';
import KSelect from '../klikk/KSelect.vue';
import KToggle from '../klikk/KToggle.vue';
import KSpinner from '../klikk/KSpinner.vue';
import KPopover from '../klikk/KPopover.vue';
import KMenu from '../klikk/KMenu.vue';
import KMenuItem from '../klikk/KMenuItem.vue';
import EmptyState from '../klikk/EmptyState.vue';
import PivotAxisChip from './PivotAxisChip.vue';
import SetEditor from './SetEditor.vue';
import {
  getTm1Cubes,
  getTm1CubeDimensions,
  getTm1DimensionElements,
  getTm1DimensionChildren,
  getTm1DimensionAliases,
  getTm1ElementLabels,
  runTm1Query,
} from '../../api/planningAnalytics';

const DEFAULT_CUBE = 'gl_src_trial_balance';
const MAX_MEMBER_OPTIONS = 500; // cap the picker for very large dimensions.
const INDENT_PX = 16; // per-level row-header indent (PAW exploration hallmark).

// INTERIM FREEZE-GUARD — pending true row virtualisation (a separate,
// architect-led build). The grid renders every cell synchronously, so a wide
// view (hundreds of rows × 13+ cols) blocks the main thread and the tab goes
// unresponsive. Until virtualisation lands we cap the number of rows actually
// rendered to the DOM. The totals footer still sums the FULL surviving set
// (see colTotals / grandTotal below) — only the rendered BODY is capped, never
// the maths. Easy to tune: bump this one constant. Remove when virtualisation
// supersedes it.
const MAX_RENDER_ROWS = 1000;

// ── Defensive normalisers — backend lives in a separate repo, so every shape
// is coerced and the raw payload is logged once for easy adjustment. ─────────

function pickName(item) {
  if (item == null) return null;
  if (typeof item === 'string') return item;
  if (typeof item === 'number') return String(item);
  // Column headers come back as member tuples, e.g. [["Jul"],["Aug"]] -> "Jul".
  if (Array.isArray(item)) {
    return item.map(pickName).filter(Boolean).join(' / ') || null;
  }
  return item.name ?? item.Name ?? item.value ?? item.id ?? null;
}

// { cubes: [...] } | { results: [...] } | [...] | [{name}] -> string[]
function normaliseCubes(data) {
  const raw =
    (Array.isArray(data) && data) ||
    data?.cubes ||
    data?.results ||
    data?.data ||
    [];
  return raw.map(pickName).filter(Boolean);
}

// { dimensions: [...] } | [...] | [{name}] -> string[]
function normaliseDimensions(data) {
  const raw =
    (Array.isArray(data) && data) ||
    data?.dimensions ||
    data?.results ||
    data?.data ||
    [];
  return raw.map(pickName).filter(Boolean);
}

// { elements: [{name,type}] } | [...] | ['a','b'] -> [{ value, label, type }]
function normaliseElements(data) {
  const raw =
    (Array.isArray(data) && data) ||
    data?.elements ||
    data?.results ||
    data?.data ||
    [];
  return raw
    .map((el) => {
      const name = pickName(el);
      if (!name) return null;
      const type = typeof el === 'object' && el ? el.type ?? el.Type ?? null : null;
      return { value: name, label: name, type };
    })
    .filter(Boolean);
}

// Children of a consolidation. Same backend shape as elements
// ({ children:[{name,type}] } | [...]) -> [{ value, label, type }].
function normaliseChildren(data) {
  const raw =
    (Array.isArray(data) && data) ||
    data?.children ||
    data?.elements ||
    data?.results ||
    data?.data ||
    [];
  return raw
    .map((el) => {
      const name = pickName(el);
      if (!name) return null;
      const type = typeof el === 'object' && el ? el.type ?? el.Type ?? null : null;
      return { value: name, label: name, type };
    })
    .filter(Boolean);
}

// TM1 element types: 'N'/1 = numeric leaf, 'S'/2 = string leaf, 'C'/3 =
// consolidation (drillable). Backend may return the letter or the int — accept
// both. A null/unknown type is treated as a leaf (not drillable).
function isConsolidation(type) {
  if (type == null) return false;
  if (typeof type === 'number') return type === 3;
  const t = String(type).trim().toUpperCase();
  return t === 'C' || t === '3' || t === 'CONSOLIDATED' || t === 'CONSOLIDATION';
}

// A pivot cellset is { rows: [{ members:[...], cells:[{value}] }] }. Members may
// be strings or {name}; cells may be {value}/{Value}/{number} or bare numbers.
//
// The COLUMN axis is the load-bearing part for nested columns. The authoritative
// shape is the additive envelope `data.colAxis = { dimensions:[…outer→inner],
// tuples:[[m,…], …] }` — leaf-column order matches each row's `cells` order. We
// derive THREE column views from it:
//   colTuples    — one ARRAY per leaf column (["2024","Jan"]); drives the nested
//                  spanning band (group by outer-prefix, exactly like the rows).
//   colDimNames  — the ordered column dimension names (one per band row).
//   colHeaders   — the FLAT innermost-member label per leaf (legacy contract:
//                  every existing consumer — cell indexing, the aria-label count,
//                  the size badge, single-col-dim aliasing — reads this and stays
//                  intact). For a single col dim colHeaders === the members.
// FALLBACK (envelope absent — never break): reconstruct leaf headers from the
// legacy flat `columns`/`col_headers`/requested members and treat each as a
// 1-segment tuple under the request's col dim names.
function normalisePivot(data, requestedColMembers, rowDimLabels, colDimNamesReq) {
  const rawRows = data?.rows || data?.cellset?.rows || data?.data || [];
  const rows = (Array.isArray(rawRows) ? rawRows : []).map((r) => {
    const rawMembers = r?.members ?? r?.row_members ?? r?.tuple ?? [];
    const members = (Array.isArray(rawMembers) ? rawMembers : [rawMembers])
      .map(pickName)
      .filter((m) => m != null);
    const rawCells = r?.cells ?? r?.values ?? [];
    const cells = (Array.isArray(rawCells) ? rawCells : []).map(readCell);
    return { members, cells };
  });

  const widest = rows.reduce((max, r) => Math.max(max, r.cells.length), 0);

  // Authoritative path: the colAxis envelope (tuples-as-arrays).
  const colAxis = data?.colAxis || data?.col_axis || null;
  let colTuples = [];
  let colDimNames = [];
  if (colAxis && Array.isArray(colAxis.tuples)) {
    colDimNames = (Array.isArray(colAxis.dimensions) ? colAxis.dimensions : [])
      .map(pickName)
      .filter(Boolean);
    colTuples = colAxis.tuples.map((t) =>
      (Array.isArray(t) ? t : [t]).map(pickName).filter((m) => m != null),
    );
  } else {
    // Fallback: legacy flat headers (each a member string OR a 1-element tuple).
    const headerSource =
      data?.col_headers ||
      data?.columns ||
      data?.cols ||
      data?.column_members ||
      requestedColMembers ||
      [];
    colTuples = (Array.isArray(headerSource) ? headerSource : []).map((h) => {
      // A legacy entry may already be a tuple array (multi-member) or a scalar.
      if (Array.isArray(h)) return h.map(pickName).filter((m) => m != null);
      const name = pickName(h);
      return name != null ? [name] : [];
    });
    colDimNames = Array.isArray(colDimNamesReq) ? colDimNamesReq.slice() : [];
  }

  // Keep the column band rectangular against the actual cell width (defensive):
  // pad short / trim long so every leaf cell has a header tuple and vice-versa.
  if (colTuples.length < widest) {
    for (let i = colTuples.length; i < widest; i += 1) colTuples.push([`Col ${i + 1}`]);
  } else if (colTuples.length > widest && widest > 0) {
    colTuples = colTuples.slice(0, widest);
  }

  // The depth of the column band = the longest tuple (outer→inner). Normalise
  // every tuple to that depth so the band rows align (a short tuple repeats its
  // last segment forward — degenerate, but keeps the grid rectangular).
  const colDepth = colTuples.reduce((max, t) => Math.max(max, t.length), 0);
  if (colDimNames.length < colDepth) {
    for (let i = colDimNames.length; i < colDepth; i += 1) colDimNames.push(`Col ${i + 1}`);
  } else if (colDimNames.length > colDepth && colDepth > 0) {
    colDimNames = colDimNames.slice(0, colDepth);
  }

  // The FLAT leaf labels (legacy `colHeaders`): the innermost member of each
  // tuple — exactly the single-col-dim string the old code rendered.
  const colHeaders = colTuples.map((t) => (t.length ? t[t.length - 1] : ''));

  // Row headers: one per row-axis dimension. Fall back to the deepest row tuple.
  const depth = rows.reduce((max, r) => Math.max(max, r.members.length), 0);
  const rowHeaders =
    rowDimLabels && rowDimLabels.length
      ? rowDimLabels.slice(0, Math.max(depth, 1))
      : Array.from({ length: Math.max(depth, 1) }, (_, i) => `Row ${i + 1}`);

  return { rows, colHeaders, colTuples, colDimNames, rowHeaders };
}

// Cells normalise to { value, formatted } so the table can prefer the backend's
// pre-formatted string while totals still sum the raw numeric value.
function readCell(cell) {
  if (cell == null) return { value: null, formatted: null };
  if (typeof cell === 'number') return { value: cell, formatted: null };
  if (typeof cell === 'string') return { value: cell, formatted: null };
  // object: { value, formatted } | { Value } | { v } | { Numeric }
  const v = cell.value ?? cell.Value ?? cell.v ?? cell.Numeric ?? cell.numeric ?? null;
  const formatted =
    cell.formatted ?? cell.Formatted ?? cell.formatted_value ?? cell.display ?? null;
  return { value: v, formatted: formatted != null ? String(formatted) : null };
}

// The raw numeric of a normalised cell, for summing totals. Non-numeric → null.
function cellNumber(cell) {
  if (!cell) return null;
  const n = Number(cell.value);
  return Number.isFinite(n) ? n : null;
}

// ── State ────────────────────────────────────────────────────────────────
const cube = ref(null);
const cubes = ref([]);
const cubesLoading = ref(false);
const cubesError = ref('');

const dimensions = ref([]);
const dimsLoading = ref(false);
const dimsError = ref('');

// dim -> 'rows' | 'cols' | 'filter' | 'unused'
const assignments = reactive({});
// dim -> string[] (rows/cols members)
const memberSelections = reactive({});
// dim -> string|null — an EXPLICIT alternate hierarchy chosen for this dimension
// via the Set Editor. null/absent = the dimension's default hierarchy. Threaded
// into each axis spec ({ dimension, hierarchy?, members }) at query time so
// runTm1Query honours the per-axis hierarchy (and TM1SubsetToSet for the set).
const dimHierarchy = reactive({});
// dim -> string (filter member)
const filterSelections = reactive({});
// dim -> { loading, error, options:[{value,label,type}] }
const elementCache = reactive({});
// dim -> { [memberName]: type } — element types learned from element/children
// payloads, so the rendered pivot knows which members are drillable (type 'C').
const memberTypes = reactive({});
// dim -> string[] — the populated default members resolved on cube load (children
// of the top consolidation). "Collapse all" restores Rows to these.
const defaultMembers = reactive({});

// ── DISPLAY ALIASES (display-only labels; the query is never aliased) ─────────
// The pivot can show human alias labels (e.g. an entity UUID → "Klikk (Pty) Ltd")
// in row/col headers + filter pills WITHOUT touching the MDX — axisSpec keeps
// principal keys. Three reactive maps, all keyed by dimension:
//   dimAlias[dim]      → the active alias NAME ('' / absent = principal names).
//   dimAliasList[dim]  → the dim's available alias names (lazy-loaded once).
//   aliasLabels[dim]   → { principalMember: aliasLabel } for the dim's CURRENT
//                        alias+hierarchy (cleared when either changes; only the
//                        members actually shown are fetched + cached).
// dimAliasTouched[dim] records that the USER set/cleared the alias, so the
// auto-default-to-`name` (TM1/PAW convention) never overrides an explicit choice.
const dimAlias = reactive({});
const dimAliasList = reactive({});
const aliasLabels = reactive({});
const dimAliasTouched = reactive({});
// dim -> token incremented on every alias/hierarchy change for that dim, so a
// label fetch that resolves after the user switched alias/hierarchy is dropped
// (last change wins — mirrors querySeq for the pivot query).
const aliasSeq = reactive({});
// Guards re-entrant alias-list loads (lazy, fire-and-forget) so a dim's list is
// fetched at most once in flight.
const aliasListLoading = reactive({});

// The display label for a principal member of a dimension: the cached alias
// label when one exists, else the principal key itself (so the UUID still shows
// rather than a blank until — and if — a label resolves). Reactive: re-renders
// when aliasLabels fills.
function displayMember(dim, member) {
  if (member == null) return member;
  return aliasLabels[dim]?.[member] ?? member;
}

// The principal-key tooltip for a displayed member: shown ONLY when an alias has
// actually relabelled it (label !== principal), so the raw key (e.g. a UUID)
// stays discoverable without cluttering principal-only dims with a redundant
// self-tooltip. Returns undefined when there's nothing extra to reveal.
function memberPrincipalTitle(dim, member) {
  if (member == null) return undefined;
  const label = displayMember(dim, member);
  return label !== member ? member : undefined;
}

function filterPrincipalTitle(dim) {
  return memberPrincipalTitle(dim, filterSelections[dim]);
}

// A nested-band header cell's display label + tooltip. Every cell carries its own
// (dim, member), so aliasing is per-segment and uniform across the band depth —
// the same `displayMember`/`memberPrincipalTitle` the rows use. This supersedes
// the old single-col-dim-only path: ALL column dimensions alias now (architect
// §1.1). A cell with no dim (degenerate/padded) falls back to its raw member.
function bandCellLabel(cell) {
  if (cell?.dim == null || cell?.member == null) return cell?.label ?? cell?.member ?? '';
  return displayMember(cell.dim, cell.member);
}

function bandCellTitle(cell) {
  if (cell?.dim == null || cell?.member == null) return undefined;
  return memberPrincipalTitle(cell.dim, cell.member);
}

// A row-header segment's tooltip. When an alias has relabelled it, surface the
// PRINCIPAL key (e.g. the UUID stays discoverable — mirrors the Set Editor's
// faint-principal pattern); otherwise fall back to the full label so an
// ellipsised long name is still readable on hover (the prior behaviour).
function rowSegTitle(hcell) {
  if (hcell?.dim == null || hcell?.member == null) return hcell?.label;
  return memberPrincipalTitle(hcell.dim, hcell.member) ?? displayMember(hcell.dim, hcell.member);
}

// ── Row-axis EXPANSION TREE (PAW drill-in-place) ────────────────────────────
// The backend returns a FLAT member list on the row axis. To render a real
// PAW-style indented hierarchy with expand/collapse IN PLACE, we maintain a
// client-side tree keyed by ANCESTRY PATH (not bare member name), because the
// account hierarchy has OVERLAPPING ROLLUPS — the same member can appear under
// two different consolidations. A bare-name key would collapse those into one
// node (2nd parent renders missing the child; collapsing the 1st parent strips
// the shared child from under the 2nd). The path key disambiguates them:
//   path = parentPath ? `${parentPath}::${member}` : member
//   rowNodes[path] = { member, path, level, parentPath, expanded, children:[childPath,…] }
// `rowOrder` is the flattened, ordered list of visible PATHS that drives both
// the query's row member list (mapped path→member) AND the rendered rows.
// Expanding a node fetches its children (once), inserts their paths after the
// parent at level+1, and flips expanded=true. Collapsing removes the whole
// descendant subtree (by path prefix) from the query without a re-fetch
// (children stay cached on the node for re-expand).
const rowNodes = reactive({}); // path -> node
const rowOrder = ref([]); // ordered visible PATHS (the row axis)

// ── OUTER-GROUP collapse state (PAW-style per-level row hierarchy) ────────────
// With ≥2 row dims the OUTER dims (every dim except the innermost) render as
// COLLAPSIBLE PARENT rows — each outer member shown ONCE, its descendant rows
// indented beneath — instead of the outer label repeating on every inner row.
// Collapsing an outer parent hides its descendants. This is a PURELY CLIENT-SIDE
// view fold over the ALREADY-FETCHED crossjoin tuples — it issues NO re-query
// (contrast the INNERMOST-dim drill, toggleRow/expandRow, which DOES re-query a
// consolidation's children). The set holds the outer-tuple PATH key of every
// COLLAPSED parent (e.g. tupleKey(["FY24"]) or tupleKey(["FY24","Klikk"])); a row
// is hidden when ANY prefix of its outer path is in the set. Vue 3 makes Set
// mutations (add/delete/has) reactive, so visibleRows recomputes on toggle. reka
// v-model VALUE primitive is N/A (Doctrine #43) — these twisties are plain
// <button>s, so there is no state primitive in play.
const collapsedRowKeys = reactive(new Set());

function isOuterCollapsed(outerKey) {
  return collapsedRowKeys.has(outerKey);
}

// Toggle one outer parent's collapse state (client-side only — NO re-query).
function toggleOuter(outerKey) {
  if (!outerKey) return;
  if (collapsedRowKeys.has(outerKey)) collapsedRowKeys.delete(outerKey);
  else collapsedRowKeys.add(outerKey);
}

// Build a node's ancestry path from its parent's path + its bare member name.
function makePath(parentPath, member) {
  return parentPath ? `${parentPath}::${member}` : member;
}

const suppressEmpty = ref(true);
// Collapsible "show MDX" — a TM1 person wants to see the literal query.
const showMdx = ref(false);

// Which context-pill popover / axis-chip menu is open (single-open model).
const openPicker = ref('');
const openChipMenu = ref('');
// Which context-pill MOVE menu is open (separate from the member-picker popover,
// single-open model). Keyed by dim so only one move menu shows at a time.
const openCtxMenu = ref('');
// Which INLINE alias picker is open. This is the first-class, always-visible
// "· <label> ▾" control on every filter pill and every Rows/Columns axis chip
// (PAW shows the display attribute right on the dimension). Single-open across
// ALL surfaces, keyed `${role}:${dim}` (filter: / rows: / cols:) so a context
// pill and an axis chip for the same dim never both float open. The legacy
// alias items at the bottom of the move/kebab menus still work — this is the
// primary, discoverable path; those are the fallback.
const openAliasMenu = ref('');

// ── Set (Subset) Editor modal ────────────────────────────────────────────────
// editorOpen drives the KDialog; editorDim is the dimension being edited (kept
// rendered while open so the dialog's close transition can play). The editor is
// seeded from dimHierarchy[dim] + memberSelections[dim] and writes both back via
// applySet on Apply.
const editorOpen = ref(false);
const editorDim = ref('');

// ── Drag-and-drop dimension pivoting (PAW hallmark) ──────────────────────────
// HTML5 drag-drop lets the user drag any dimension TOKEN (a Context filter pill
// or a Rows/Columns axis chip) into any of the three ZONES (Context bar, Rows
// well, Columns well). A drop calls moveDimension(dim, target) — the SAME
// reassign path the chip menu / context-pill menu / swap button all funnel
// through (re-seed members + re-query, populated-default preserved). Drag is
// mouse-only; the move menus are the keyboard-operable equivalent.
const draggingDim = ref(''); // dim currently being dragged ('' = none)
const dropZone = ref(''); // 'filter' | 'rows' | 'cols' — zone under the cursor

function onDimDragStart(event, dim) {
  // Belt-and-braces: clear any prior drag state first, in case a previous
  // drag's `dragend` never fired (some browsers drop the event when the drag
  // ends over a non-document target), which would leave dropzones armed.
  draggingDim.value = '';
  dropZone.value = '';
  draggingDim.value = dim;
  // Close any open menu/popover so it doesn't float over the drag.
  openPicker.value = '';
  openChipMenu.value = '';
  openCtxMenu.value = '';
  openAliasMenu.value = '';
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
    // A payload is required for Firefox to start a drag; the dim is the source
    // of truth in draggingDim, but we set text/plain too as a courtesy.
    event.dataTransfer.setData('text/plain', dim);
  }
}

function onDimDragEnd() {
  draggingDim.value = '';
  dropZone.value = '';
}

// Window-level safety net: if a drag ends over a non-document target (a known
// flaky case on some browsers), the per-token `dragend` may never fire, leaving
// `draggingDim`/`dropZone` set and every dropzone armed. A window `dragend`/
// `drop` listener guarantees the drag state is cleared regardless. Registered
// onMounted, removed onBeforeUnmount (no leak). The per-token dragend clear is
// kept too; both paths clear the same state, so this is idempotent.
function clearDragState() {
  draggingDim.value = '';
  dropZone.value = '';
}
onMounted(() => {
  window.addEventListener('dragend', clearDragState);
  window.addEventListener('drop', clearDragState);
});
onBeforeUnmount(() => {
  window.removeEventListener('dragend', clearDragState);
  window.removeEventListener('drop', clearDragState);
});

// dragenter/over on a zone — mark it the active drop target (drives the
// highlight class). preventDefault on dragover is what permits a drop.
function onZoneDragOver(target) {
  if (!draggingDim.value) return;
  dropZone.value = target;
}

// dragleave — only clear if we're actually leaving the zone (dragleave fires
// when crossing onto child elements too; guard with relatedTarget containment).
function onZoneDragLeave(event, target) {
  if (dropZone.value !== target) return;
  const related = event.relatedTarget;
  if (related && event.currentTarget.contains(related)) return;
  dropZone.value = '';
}

// drop — reassign the dragged dim to this zone through the shared path.
// The same-zone no-op (dropped back where it started) is owned by
// moveDimension itself, so we funnel through it unconditionally — that keeps
// the menu-cleanup + reassign logic in one place and avoids duplicating the
// guard here.
function onZoneDrop(target) {
  const dim = draggingDim.value;
  draggingDim.value = '';
  dropZone.value = '';
  if (!dim) return;
  moveDimension(dim, target);
}

const result = ref(null);
const running = ref(false);
const runError = ref('');
// Monotonic token so a stale query response (user changed the slice mid-flight)
// is dropped — last query wins.
let querySeq = 0;
// AbortController for the in-flight pivot fetch. The toolbar's Cancel button
// aborts it; runQuery aborts any prior controller before starting a new run so
// only one fetch is ever live. Cancelling aborts the NETWORK fetch (the UI stays
// responsive during the fetch); the synchronous-render freeze is handled
// separately by the MAX_RENDER_ROWS cap, which Cancel cannot help with.
let queryAbort = null;

// ── Options / derived ──────────────────────────────────────────────────────
const cubeOptions = computed(() => cubes.value.map((c) => ({ value: c, label: c })));

const rowDims = computed(() => dimensions.value.filter((d) => assignments[d] === 'rows'));
const colDims = computed(() => dimensions.value.filter((d) => assignments[d] === 'cols'));
const filterDims = computed(() => dimensions.value.filter((d) => assignments[d] === 'filter'));

const canRun = computed(() => rowDims.value.length > 0 && colDims.value.length > 0);
// Swap is meaningful only with exactly one dim on each axis (v1 single-dim axes).
const canSwap = computed(() => rowDims.value.length === 1 && colDims.value.length === 1);

// The INNERMOST (last) row dimension — the drill target. TM1/PAW subset-drill
// semantics: with rows = year × entity × account, the crossjoin varies the
// innermost dim (account) fastest, so expanding a consolidation expands ITS
// members for that dimension and the crossjoin with the outer dims produces the
// rows. The drill tree (rowNodes/rowOrder) holds the innermost dim's MEMBER SET;
// the query crossjoins the outer dims × that set automatically. Exists whenever
// there is at least one row dim (single-row-dim is the degenerate case: no outer
// dims, the tree IS the rows).
const innerRowDim = computed(() =>
  rowDims.value.length ? rowDims.value[rowDims.value.length - 1] : null,
);

// The OUTER row dimensions — every row dim except the innermost, in axis order.
// These fan the crossjoin (one block of the inner tree per outer tuple); drill
// is UNIFORM across them (expanding the inner dim applies to every outer tuple).
const outerRowDims = computed(() => rowDims.value.slice(0, -1));

// The corner-cell label (row-axis dimension name(s)).
const rowAxisLabel = computed(() => rowDims.value.join(' / ') || 'Rows');

// The literal MDX the backend executed for the current result, if returned.
const mdxText = computed(() => {
  const m = result.value?.mdx ?? result.value?.MDX ?? result.value?.query ?? null;
  return typeof m === 'string' && m.trim() ? m.trim() : '';
});

const pivot = computed(() =>
  result.value
    ? normalisePivot(
        result.value,
        colDims.value.flatMap((d) => memberSelections[d] || []),
        rowDims.value,
        colDims.value,
      )
    : { rows: [], colHeaders: [], colTuples: [], colDimNames: [], rowHeaders: [] },
);

const colHeaders = computed(() => pivot.value.colHeaders);
// One tuple-as-array per LEAF column (["2024","Jan"]); drives the nested band.
const colTuples = computed(() => pivot.value.colTuples);
// The ordered column dimension names (outer→inner); one per band row. Prefer the
// envelope's authoritative names, fall back to the assigned col dims.
const colDimNames = computed(() => {
  const fromEnvelope = pivot.value.colDimNames;
  if (fromEnvelope && fromEnvelope.length) return fromEnvelope;
  return colDims.value.slice();
});
// The depth of the column-header band (number of stacked header rows).
const colBandDepth = computed(() => Math.max(colDimNames.value.length, 1));

// Duplicate-safe row assembly is handled by GROUPING the backend rows by their
// OUTER tuple (the row tuple minus its innermost member) and walking each group
// positionally against the inner tree's visible order (rowOrder). A member can
// legitimately appear MORE THAN ONCE within a group (the same inner leaf under
// two expanded consolidations — overlapping rollups); positional de-queue inside
// the group hands each occurrence its OWN backend row, in request order. A
// suppressed inner tuple simply leaves the group short → that node renders blank.
// tupleKey joins members with a NUL separator that cannot occur in a TM1 name.
const TUPLE_SEP = '\u0000'; // NUL — cannot occur inside a TM1 member name.

function tupleKey(members) {
  return (members || []).join(TUPLE_SEP);
}

// THE RENDERED GRID ROWS (pre-suppression). The drill tree always owns the
// INNERMOST row dim's member set; the rendered rows are the crossjoin of the
// OUTER row dims × that inner tree, in TM1/PAW order (outer dims slowest, inner
// dim fastest).
//
// PAW-STYLE NESTED ROW HIERARCHY (the shape this builder produces with ≥2 row
// dims): each OUTER member is shown ONCE as a COLLAPSIBLE PARENT row, with its
// descendant rows INDENTED beneath it — rather than the outer label repeating on
// every inner row. For >2 row dims the outer levels nest recursively (FY24 ▸ then
// Klikk ▸ then the inner account rows). Every row carries exactly ONE header
// segment (its own level's member, indented by depth):
//   • OUTER-PARENT rows: { isOuterParent:true, outerKey, collapsed, level=outer
//     depth } — a twisty bound to toggleOuter (CLIENT-SIDE fold, no re-query),
//     cells = the rolled values TM1 returned on the bare outer-prefix tuple if
//     any, else [] (blank).
//   • INNER rows: { isInner:true, drillable, expanded, drillKey, path,
//     level=outerCount+treeLevel } — the existing innermost-dim DRILL twisty
//     (toggleRow → expandRow/collapseRow, which DOES re-query). outerKey = the
//     full outer-tuple path the inner row sits under (so outer collapse can hide
//     it). Single-row-dim is the degenerate case (outerCount 0 → no parents, the
//     tree IS the rows, exactly as before).
// Each row also carries: key, label, level (drives indent + aria-level), cells,
// rowTotal.
const gridRows = computed(() => {
  const dim = innerRowDim.value;

  // No tree yet (cube still seeding, or no row dim) → render whatever backend
  // rows exist flat, with one header cell per tuple member (no drill, no outer
  // grouping). This pre-response/no-tree fallback keeps the legacy side-by-side
  // segment band (each member a plain label).
  if (!dim || !rowOrder.value.length) {
    return pivot.value.rows.map((r, i) => {
      const { sum, has } = sumCells(r.cells);
      return {
        key: `flat-${i}`,
        headerCells: (r.members.length ? r.members : [`Row ${i + 1}`]).map(
          (m, hi) => ({
            // `member` is the PRINCIPAL key (used for alias lookup + tooltip);
            // `dim` lets the renderer resolve the per-dim display label. `label`
            // stays the principal as the fallback / aria source.
            member: m,
            dim: rowDims.value[hi] ?? null,
            label: m,
            level: 0,
            drillable: false,
            isInner: false,
            isOuterParent: false,
            outerKey: null,
            key: `h-${i}-${hi}`,
          }),
        ),
        label: r.members.join(' / ') || `Row ${i + 1}`,
        level: 0,
        drillable: false,
        expanded: false,
        drillKey: null,
        path: null,
        isOuterParent: false,
        outerKey: '',
        cells: r.cells,
        rowTotal: has ? sum : null,
      };
    });
  }

  // The visible inner-dim sequence (tree order; duplicates preserved for
  // overlapping rollups). Every outer tuple repeats THIS sequence.
  const innerPaths = rowOrder.value;

  // Group the backend rows by OUTER tuple (the tuple minus its last/inner
  // member), preserving first-appearance order. Suppression (the server-side
  // NON EMPTY that's always on the MDX) may drop inner tuples, so we read the
  // groups from what the backend actually returned rather than recomputing the
  // cartesian product on the client. WITHIN a group we bucket rows into a QUEUE
  // keyed by the inner MEMBER name (not by raw position), then de-queue per inner
  // path's member: this is robust to a dropped inner tuple (its queue is empty →
  // that node renders blank) AND hands each occurrence of a duplicate inner
  // member (overlapping rollups — the same leaf under two expanded parents) its
  // OWN backend row in request order. This mirrors the proven single-dim tuple-
  // queue de-queue, generalised across the outer crossjoin fan.
  const outerCount = outerRowDims.value.length;
  const groupsOrder = []; // outer-tuple keys, first-seen order
  const groups = new Map(); // outerKey -> { outerTuple, queues:Map<member,row[]> }
  // Backend rows keyed by their BARE outer-prefix tuple (e.g. ["FY24"] or
  // ["FY24","Klikk"]) — the rolled values TM1 may return ON the outer member
  // itself. Today's crossjoin only returns full tuples, so these are usually
  // absent (parent rows render blank); we honour them if a future query asks for
  // the consolidation tuple too. First occurrence wins (a prefix is one member).
  const prefixRow = new Map();
  for (const r of pivot.value.rows) {
    // A ROLLED PREFIX row lands on an outer-prefix tuple (arity ≤ outerCount, so
    // it carries no inner member beyond the outer dims). Record its cells for the
    // matching parent and DON'T add it as an inner-queue entry. A full crossjoin
    // row has arity outerCount+1 (outer dims + the inner dim). (Usually no prefix
    // rows arrive — today's crossjoin returns only full tuples — so parents render
    // blank; this honours them if a future query also asks for the rolled tuple.)
    if (outerCount && r.members.length <= outerCount) {
      const pk = tupleKey(r.members);
      if (r.members.length && !prefixRow.has(pk)) prefixRow.set(pk, r.cells);
      continue;
    }
    const outerTuple = outerCount ? r.members.slice(0, outerCount) : [];
    const outerKey = tupleKey(outerTuple);
    let bucket = groups.get(outerKey);
    if (!bucket) {
      bucket = { outerTuple, queues: new Map() };
      groups.set(outerKey, bucket);
      groupsOrder.push(outerKey);
    }
    const innerMember = r.members.length ? r.members[r.members.length - 1] : '';
    const q = bucket.queues.get(innerMember);
    if (q) q.push(r);
    else bucket.queues.set(innerMember, [r]);
  }
  // Single row dim → exactly one (empty-outer) group so the tree drives the rows
  // even before the first response settles.
  if (!groupsOrder.length) {
    groupsOrder.push('');
    groups.set('', { outerTuple: [], queues: new Map() });
  }

  const out = [];
  // Outer-prefix keys already emitted as parent rows — so each outer member is
  // shown ONCE (PAW style), even though many backend groups share the same outer
  // prefix. Walking groups in first-seen order keeps parents adjacent to their
  // first child block; recursive levels (FY24 ▸ Klikk ▸ …) emit only the NEW
  // prefix levels each group introduces.
  const emittedParents = new Set();
  groupsOrder.forEach((outerKey, gi) => {
    const { outerTuple, queues } = groups.get(outerKey);

    // 1) Emit any not-yet-seen OUTER-PARENT rows for this group's prefix path,
    //    outermost first. Level L's parent key is the prefix tuple[0..L].
    for (let L = 0; L < outerCount; L += 1) {
      const prefix = outerTuple.slice(0, L + 1);
      const parentKey = tupleKey(prefix);
      if (emittedParents.has(parentKey)) continue;
      emittedParents.add(parentKey);
      const member = outerTuple[L];
      const pdim = outerRowDims.value[L] ?? null;
      const cells = prefixRow.get(parentKey) || [];
      const { sum, has } = sumCells(cells);
      const collapsed = isOuterCollapsed(parentKey);
      // ONE header segment — the parent's own member, indented to its outer depth,
      // carrying the CLIENT-SIDE collapse twisty (toggleOuter, no re-query).
      const headerCells = [
        {
          member,
          dim: pdim,
          label: member,
          level: L,
          drillable: false,
          isInner: false,
          isOuterParent: true,
          outerKey: parentKey,
          collapsed,
          key: `p-${parentKey}`,
        },
      ];
      out.push({
        key: `p::${parentKey}`,
        headerCells,
        label: member,
        level: L,
        drillable: false,
        expanded: !collapsed, // display-only, drives nothing today. NOT the totals
        // signal — totalRows excludes parents via `!r.isOuterParent`; never filter
        // totals on `.expanded` alone or collapsed parents would double-count.
        drillKey: null,
        path: null,
        isOuterParent: true,
        outerKey: parentKey,
        collapsed,
        cells,
        rowTotal: has ? sum : null,
      });
    }

    // 2) Emit this group's INNER rows, indented PAST the deepest outer parent.
    // Per-group cursors track how many rows of each inner member we've consumed
    // this render pass, so duplicate inner members de-queue in request order.
    const cursors = new Map();
    innerPaths.forEach((path, j) => {
      const node = rowNodes[path] || { member: path, path, level: 0, expanded: false };
      const member = node.member ?? path;
      const q = queues.get(member);
      const at = cursors.get(member) || 0;
      const backendRow = q && q.length ? q[at] || null : null;
      if (q) cursors.set(member, at + 1);
      const cells = backendRow ? backendRow.cells : [];
      const { sum, has } = sumCells(cells);
      const drillable = isConsolidation(memberType(dim, member));
      // Total render depth: the outer dims sit at levels 0..outerCount-1, so the
      // inner tree starts at outerCount and adds its own drill level on top.
      const depth = outerCount + (node.level || 0);
      // ONE header segment — this inner tree node, indented + carrying the
      // existing innermost-dim DRILL twisty (toggleRow → expandRow, re-queries).
      const headerCells = [
        {
          member,
          dim,
          label: member,
          level: depth,
          drillable,
          expanded: !!node.expanded,
          drillKey: drillable ? path : null,
          isInner: true,
          isOuterParent: false,
          outerKey,
          key: `i-${gi}-${path}`,
        },
      ];
      out.push({
        // Unique per (outer-group index, inner occurrence index) — never collides
        // even with overlapping rollups (same path under two parents) because the
        // group index + the positional index j disambiguate.
        key: `g${gi}::${path}::${j}`,
        headerCells,
        label: member,
        level: depth,
        drillable,
        expanded: !!node.expanded,
        drillKey: drillable ? path : null,
        path,
        isOuterParent: false,
        outerKey, // the full outer-tuple path this inner row sits under.
        cells,
        rowTotal: has ? sum : null,
      });
    });
  });
  return out;
});

function sumCells(cells) {
  let sum = 0;
  let has = false;
  for (const cell of cells || []) {
    const n = cellNumber(cell);
    if (n != null) {
      sum += n;
      has = true;
    }
  }
  return { sum, has };
}

// ── PAW-style "Suppress Zeroes" (the client suppression layer) ───────────────
// NON EMPTY (server-side, always on the MDX) only drops EMPTY (null) tuples, but
// the cube has STORED 0.00 values that NON EMPTY KEEPS — so all-zero rows/cells
// survive. PAW's "Suppress Zeroes" additionally drops anything that is zero OR
// empty. When the toggle is ON we layer that on top of NON EMPTY: a cell counts
// as suppressible when it is null/empty OR rounds to zero (|value| < EPS); a row
// is dropped when EVERY data cell is suppressible; a column is dropped when EVERY
// surviving row is suppressible at that column. Totals then recompute over the
// SURVIVING rows/cols only. This is a VIEW filter over gridRows — the drill tree
// (rowNodes/rowOrder) is untouched, so expand/collapse still work and re-query
// re-suppresses. When the toggle is OFF nothing is dropped (current behaviour).
const ZERO_EPS = 0.005; // rounds-to-zero at 2dp (matches the 2dp cell formatter).

function isCellZeroish(cell) {
  if (cell == null) return true;
  const n = cellNumber(cell);
  if (n == null) {
    // Non-numeric: blank/empty is zeroish; a real string member value is not.
    const v = cell.value;
    if (v === null || v === undefined || v === '') return true;
    const f = cell.formatted;
    return !(f && String(f).trim()) && !(typeof v === 'string' && v.trim());
  }
  return Math.abs(n) < ZERO_EPS;
}

// The display set: rows + the surviving column indices, after suppression. When
// suppress is OFF this is the identity (all rows, every column index).
const suppressed = computed(() => {
  const allRows = gridRows.value;
  const colCount = colHeaders.value.length;
  const allColIndices = Array.from({ length: colCount }, (_, i) => i);
  if (!suppressEmpty.value) {
    return { rows: allRows, colIndices: allColIndices };
  }
  // 1) Drop rows whose every data cell is zero/empty. Rows KEPT regardless:
  //    - a row with NO cells yet (pre-response structural row, nothing to suppress);
  //    - an EXPANDED inner consolidation — a structural rollup whose (possibly
  //      non-zero) children are shown beneath it, so dropping it would orphan them
  //      and strip the collapse twisty (PAW keeps the expanded parent and
  //      suppresses its zero CHILDREN individually; a COLLAPSED all-zero
  //      consolidation, whose rolled value IS the row, is dropped);
  //    - an OUTER-PARENT group header (PAW row hierarchy) — it is a navigational
  //      rollup whose descendant rows live in this same set; suppression targets
  //      the inner data rows, never the group headers, so the hierarchy + the
  //      collapse twisty stay intact even when a group's data is all zero.
  const rows = allRows.filter((r) => {
    if (r.isOuterParent) return true;
    if (r.drillable && r.expanded) return true;
    const cells = r.cells || [];
    if (!cells.length) return true;
    return cells.some((c) => !isCellZeroish(c));
  });
  // 2) Drop columns where every SURVIVING row is zero/empty at that index.
  const colIndices = allColIndices.filter((ci) =>
    rows.some((r) => !isCellZeroish(r.cells?.[ci])),
  );
  return { rows, colIndices };
});

// The FULL surviving row set (post-suppression when the toggle is on), BEFORE the
// client-side outer-collapse fold. This is the authoritative set the TOTALS sum
// over — it is NOT capped and is INDEPENDENT of outer collapse, so folding a
// group never changes colTotals / grandTotal. Everything totals-related (totalRows
// / colTotals / grandTotal) derives from displayRows so the footer stays correct
// regardless of which groups are collapsed or whether the body is truncated.
const displayRows = computed(() => suppressed.value.rows);

// The OUTER-COLLAPSE fold (PAW per-level row hierarchy) — a PURELY CLIENT-SIDE
// view over displayRows: drop any row that has a COLLAPSED outer-parent ancestor.
// A row is hidden when ANY prefix of its outerKey path is in collapsedRowKeys.
// The collapsed PARENT itself stays (it owns the re-expand twisty); only its
// descendants (deeper parents + inner rows) are folded away. No re-query — these
// rows are already fetched; collapse just hides them. Totals are unaffected
// (they read displayRows, above).
const visibleRows = computed(() => {
  const rows = displayRows.value;
  if (!collapsedRowKeys.size) return rows;
  return rows.filter((r) => {
    const key = r.outerKey || '';
    if (!key) return true; // single-dim / flat rows have no outer ancestor.
    // The row's OWN key is a collapsed parent → keep it (it's the fold handle);
    // any segment ABOVE it being collapsed hides it. We test each ancestor prefix
    // of the outer path (split on the NUL tuple separator) EXCEPT the row's own
    // full key when the row is itself that parent.
    const segs = key.split(TUPLE_SEP);
    const upTo = r.isOuterParent ? segs.length - 1 : segs.length;
    let prefix = '';
    for (let i = 0; i < upTo; i += 1) {
      prefix = i === 0 ? segs[0] : `${prefix}${TUPLE_SEP}${segs[i]}`;
      if (collapsedRowKeys.has(prefix)) return false;
    }
    return true;
  });
});

// INTERIM FREEZE-GUARD: the rows actually written to the DOM — at most
// MAX_RENDER_ROWS of the VISIBLE (post-outer-collapse) set. The grid <tbody>
// v-for binds to THIS, never displayRows, so a huge view can't block the main
// thread. Collapsing a group reduces this set (fewer rows to render). slice() is
// a no-op (returns the same members) when the set is within the cap.
const renderRows = computed(() => visibleRows.value.slice(0, MAX_RENDER_ROWS));

// True only when the VISIBLE set exceeds the cap — gates the cap banner and the
// "X of Y rows" footer wording. Collapsing groups can bring a capped view back
// under the cap (the rendered count drops), which is the intended escape hatch.
const isCapped = computed(() => visibleRows.value.length > MAX_RENDER_ROWS);

// The surviving column indices (drives header + cell + total column selection).
const displayColIndices = computed(() => suppressed.value.colIndices);
// The column headers actually rendered, in surviving order.
const displayColHeaders = computed(() =>
  displayColIndices.value.map((ci) => colHeaders.value[ci]),
);

// The surviving column TUPLES, in surviving order (parallel to displayColHeaders
// / displayColIndices). One array per leaf column (["2024","Jan"]).
const displayColTuples = computed(() =>
  displayColIndices.value.map((ci) => colTuples.value[ci] || []),
);

// ── THE NESTED COLUMN-HEADER BAND (the column-side mirror of the row grouping) ─
// The row side groups backend rows by their OUTER tuple (tuple minus the inner
// member) and spans nothing — each row is one <tr>. The COLUMN side is the dual:
// the SAME outer-prefix grouping, but expressed as colspans across one <thead>
// row PER dimension (outer→inner). At band level L (0 = outermost), a header cell
// spans the maximal run of consecutive SURVIVING leaf columns whose tuple shares
// the same prefix tuple[0..L]. The innermost row (L = depth-1) is one cell per
// leaf column — these carry the per-leaf labels the cells align to, so they keep
// the legacy `pivot-grid__col-head` contract (text, :title, alias) verbatim.
//
// Grouping is over the SURVIVING (post-suppress) tuples in surviving order, so a
// suppressed leaf simply shortens its parent's span (or drops an outer cell whose
// every leaf was suppressed) — totals + alignment stay coherent because every
// band cell records the surviving-leaf index it starts at.
//
// Each band cell: { label, dim, member, span, leafCi, isInner, key }.
//   leafCi  — the surviving-column index (into displayColIndices) where the
//             group starts; the innermost row's leafCi is the cell column it heads.
//   span    — colspan (count of surviving leaves under this prefix).
const colBand = computed(() => {
  const tuples = displayColTuples.value;
  const depth = colBandDepth.value;
  const dims = colDimNames.value;
  // Pre-suppression empty (no result yet) → an empty band; the <thead> guards on
  // displayColHeaders.length anyway.
  if (!tuples.length) return [];

  const rows = [];
  for (let level = 0; level < depth; level += 1) {
    const cells = [];
    let start = 0;
    while (start < tuples.length) {
      // The prefix that defines this group at this level: tuple[0..level].
      const prefixKey = tupleKey(tuples[start].slice(0, level + 1));
      let end = start + 1;
      while (
        end < tuples.length &&
        tupleKey(tuples[end].slice(0, level + 1)) === prefixKey
      ) {
        end += 1;
      }
      const member = tuples[start][level];
      cells.push({
        label: member,
        dim: dims[level] ?? null,
        member,
        span: end - start,
        leafCi: start,
        isInner: level === depth - 1,
        // Unique within the band: level + the starting surviving-leaf index.
        key: `cb-${level}-${start}`,
      });
      start = end;
    }
    rows.push({ level, dim: dims[level] ?? null, cells });
  }
  return rows;
});

// Rows that contribute to a column / grand total: ONE level only, over the FULL
// surviving set (displayRows — NOT the outer-collapse-folded visibleRows), so
// folding a group NEVER changes the totals. TM1 returns a consolidation's
// rolled-up value on the consolidation's own row, so summing an EXPANDED parent
// AND its children double-counts (EXPENSE 100 + Rent 60 + Salaries 40 = 200). Two
// kinds of rollup are excluded:
//   • an EXPANDED inner consolidation — represented by its children in the set;
//   • an OUTER-PARENT group header — always a rollup of its descendant inner rows,
//     which are ALWAYS present in displayRows (outer collapse is a render-only
//     fold, it never removes rows from this set), so the parent must be excluded
//     regardless of its collapsed state to avoid double-counting.
// A collapsed inner consolidation correctly contributes its own rolled value;
// leaves always contribute. Net: sum surviving NON-parent rows that are NOT
// currently expanded.
//   After expanding EXPENSE: column total = Rent + Salaries + (every OTHER top
//   row) — and crucially NOT EXPENSE itself. The per-row rowTotal is unaffected.
const totalRows = computed(() =>
  displayRows.value.filter((r) => !r.expanded && !r.isOuterParent),
);

// Column totals (one per SURVIVING column) + grand total, over the one-level set.
// Indexed by the surviving column indices so a suppressed column contributes
// nothing and the footer aligns with the rendered header band.
const colTotals = computed(() => {
  const cols = displayColIndices.value;
  const totals = cols.map(() => ({ sum: 0, has: false }));
  for (const row of totalRows.value) {
    cols.forEach((ci, k) => {
      const n = cellNumber(row.cells[ci]);
      if (n != null) {
        totals[k].sum += n;
        totals[k].has = true;
      }
    });
  }
  return totals.map((t) => (t.has ? t.sum : null));
});

const grandTotal = computed(() => {
  const cols = displayColIndices.value;
  let sum = 0;
  let has = false;
  for (const row of totalRows.value) {
    for (const ci of cols) {
      const n = cellNumber(row.cells[ci]);
      if (n != null) {
        sum += n;
        has = true;
      }
    }
  }
  return has ? sum : null;
});

// True when at least one row is expanded — gates the "Collapse all" control.
const hasExpansions = computed(() =>
  Object.values(rowNodes).some((n) => n.expanded),
);

// Footer size badge. Counts the VISIBLE (post-outer-collapse) rows — collapsing
// a PAW group genuinely reduces how many rows there are to show, so the count
// drops with it (honest about what the current expansion/collapse state renders).
// Within the cap it reads "6 rows × 12 cols" (full visible grid shown). When the
// body is capped it reads "1,000 of 3,184 rows × 12 cols" — the rendered count vs
// the visible count, so it never misrepresents what's on screen. The TOTALS
// footer is independent of this (it always rolls up the full set). Column count
// is the full surviving column set (cols are not capped). Thousands grouped.
const gridSizeLabel = computed(() => {
  if (!result.value) return '';
  const total = visibleRows.value.length;
  const shown = renderRows.value.length;
  const c = displayColHeaders.value.length;
  if (!total && !c) return '';
  const colPart = `${c.toLocaleString()} ${c === 1 ? 'col' : 'cols'}`;
  if (isCapped.value) {
    return `${shown.toLocaleString()} of ${total.toLocaleString()} rows × ${colPart}`;
  }
  return `${total.toLocaleString()} ${total === 1 ? 'row' : 'rows'} × ${colPart}`;
});

// ── Element-cache helpers (lazy per picker) ─────────────────────────────────
function elementOptions(dim) {
  return elementCache[dim]?.options ?? [];
}
function isElementsLoading(dim) {
  return !!elementCache[dim]?.loading;
}
function elementError(dim) {
  return elementCache[dim]?.error || '';
}
function memberPlaceholder(dim) {
  if (!elementCache[dim] || !elementCache[dim].options.length) return 'No members';
  return 'Select member…';
}

function loadBtnLabel(dim) {
  if (isElementsLoading(dim)) return 'Loading members…';
  if (elementError(dim)) return 'Retry — load members';
  return 'Load members';
}

// Lazy-load a dimension's elements the first time its picker is opened. Large
// dimensions are capped to MAX_MEMBER_OPTIONS for the picker; the dropdowns are
// internally scrollable. Elements are loaded IN the dimension's active hierarchy
// (dimHierarchy[dim] || default) — after the Set Editor applies an alternate, the
// element list (and thus every seed/reseed derived from it) must come from THAT
// hierarchy, not the default. The cache records the hierarchy it was loaded under
// so a hierarchy change (applySet) refetches rather than serving stale members.
async function ensureElements(dim) {
  const hier = dimHierarchy[dim] || null;
  const cached = elementCache[dim];
  if (cached && !cached.error && cached.hierarchy === hier) return;
  elementCache[dim] = { loading: true, error: '', options: [], hierarchy: hier };
  try {
    const data = await getTm1DimensionElements(dim, hier);
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.debug(`[PivotExplorer] elements(${dim}, ${hier ?? 'default'}) raw:`, data);
    }
    let options = normaliseElements(data);
    if (options.length > MAX_MEMBER_OPTIONS) {
      options = options.slice(0, MAX_MEMBER_OPTIONS);
    }
    elementCache[dim] = { loading: false, error: '', options, hierarchy: hier };
    recordTypes(dim, options);
    seedDefaultMember(dim, options);
  } catch (error) {
    elementCache[dim] = {
      loading: false,
      error:
        error?.response?.data?.error ||
        error?.message ||
        `Could not load members for ${dim}.`,
      options: [],
      hierarchy: hier,
    };
  }
}

// Default a dimension to its top consolidation ("All_*" / "All …" / "Total*"),
// else the first element.
function topElement(options) {
  if (!options.length) return null;
  const byPrefix = options.find((o) => /^(all[_ ]|total)/i.test(o.value));
  return (byPrefix || options[0]).value;
}

// Learn member -> type for a dimension from any element/children option list.
function recordTypes(dim, options) {
  if (!options?.length) return;
  if (!memberTypes[dim]) memberTypes[dim] = {};
  for (const o of options) {
    if (o.value != null && o.type != null) memberTypes[dim][o.value] = o.type;
  }
}

function memberType(dim, name) {
  return memberTypes[dim]?.[name] ?? null;
}

// Measure-aware seed for a Filter dimension. For a trial-balance / GL cube the
// meaningful measure is the balance — "amount" — so we prefer it when present.
function pickMeasureMember(options) {
  if (!options?.length) return null;
  const amount = options.find((o) => /^amount$/i.test(o.value));
  return amount ? amount.value : null;
}

function seedDefaultMember(dim, options) {
  recordTypes(dim, options);
  if (assignments[dim] === 'filter') {
    if (!filterSelections[dim]) {
      filterSelections[dim] = pickMeasureMember(options) || topElement(options);
    }
  } else if (assignments[dim] === 'rows' || assignments[dim] === 'cols') {
    if (!memberSelections[dim] || memberSelections[dim].length === 0) {
      const top = topElement(options);
      if (top) memberSelections[dim] = [top];
    }
  }
}

// POPULATED DEFAULT (the core fix). For a Rows/Cols dim, resolve the top element
// then fetch its CHILDREN and use those as the default members — so the cube
// opens as a real matrix (account-rollups × months) rather than a 1×1 grand
// total. Falls back to [top] when the top element is a leaf.
async function seedPopulatedDefault(dim) {
  await ensureElements(dim);
  const options = elementOptions(dim);
  if (!options.length) return;
  if (assignments[dim] !== 'rows' && assignments[dim] !== 'cols') {
    seedDefaultMember(dim, options);
    return;
  }
  // Derive the top consolidation WITHIN the dim's active hierarchy. ensureElements
  // already loaded `options` from dimHierarchy[dim] (or default), so topElement
  // picks the chosen hierarchy's top — and we fetch its children in the SAME
  // hierarchy, so a reseed after an applied alternate stays consistent (P0-B).
  const hier = dimHierarchy[dim] || null;
  const top = topElement(options);
  if (!top) return;
  try {
    const data = await getTm1DimensionChildren(dim, top, hier);
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.debug(`[PivotExplorer] children(${dim}, ${top}, ${hier ?? 'default'}) raw:`, data);
    }
    const children = normaliseChildren(data);
    recordTypes(dim, children);
    if (children.length) {
      const members = children.map((c) => c.value);
      memberSelections[dim] = members;
      defaultMembers[dim] = members.slice();
      mergePickerOptions(dim, children);
      // Seed the row expansion tree for the INNERMOST row dim so the rendered
      // hierarchy starts at these top-level rollups (level 0, collapsed). The
      // tree always owns the innermost dim's member set; outer row dims fan the
      // crossjoin and don't get a tree of their own.
      if (dim === innerRowDim.value) {
        initRowTree(dim, members);
      }
      return;
    }
  } catch (error) {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.debug(`[PivotExplorer] children(${dim}, ${top}) failed:`, error);
    }
  }
  // Fallback: top element is a leaf (or children unavailable) → single-top.
  memberSelections[dim] = [top];
  defaultMembers[dim] = [top];
  if (dim === innerRowDim.value) {
    initRowTree(dim, [top]);
  }
}

// Ensure the lazy picker for a dim includes these option rows (children/drill
// results), de-duped, so selected members always resolve to a visible chip.
function mergePickerOptions(dim, extra) {
  const cache = elementCache[dim];
  const next = cache && !cache.error ? cache.options.slice() : [];
  const seen = new Set(next.map((o) => o.value));
  for (const o of extra) {
    if (!seen.has(o.value)) {
      next.push(o);
      seen.add(o.value);
    }
  }
  if (next.length > MAX_MEMBER_OPTIONS) next.length = MAX_MEMBER_OPTIONS;
  // Preserve the hierarchy the cache was loaded under (else the next
  // ensureElements would see a hierarchy mismatch and needlessly refetch).
  elementCache[dim] = {
    loading: false,
    error: '',
    options: next,
    hierarchy: cache?.hierarchy ?? dimHierarchy[dim] ?? null,
  };
}

// ── Row expansion tree (path-keyed) ─────────────────────────────────────────
// (Re)seed the tree with a set of top-level members (level 0, collapsed). At
// the top level path === member (no ancestry), so duplicate top-level members
// would still collide — but the seed comes from a single consolidation's
// children, which TM1 guarantees unique, so top-level paths are unique.
function initRowTree(dim, members) {
  for (const k of Object.keys(rowNodes)) delete rowNodes[k];
  const paths = [];
  for (const m of members) {
    const path = makePath(null, m);
    rowNodes[path] = {
      member: m,
      path,
      level: 0,
      parentPath: null,
      expanded: false,
      children: [],
    };
    paths.push(path);
  }
  rowOrder.value = paths;
  syncRowMembersToSelection(dim);
}

// Mirror the visible row tree into memberSelections[dim] so the query asks for
// exactly the members currently shown. rowOrder holds PATHS; the backend wants
// bare member NAMES, in the same order (duplicates preserved — two occurrences
// of a member under different parents send the member twice, and the backend
// returns two rows we then de-queue positionally in gridRows).
function syncRowMembersToSelection(dim) {
  memberSelections[dim] = rowOrder.value.map((p) => rowNodes[p]?.member ?? p);
}

// Expand a consolidation row in place: fetch (once) + insert children after the
// parent at level+1, then re-query. Children stay cached on the node. Keyed by
// PATH so the same member under two different parents expands independently.
// Re-entry guarded: if already expanded (or its children are already inserted),
// no-op — a fast double-click cannot duplicate children.
async function expandRow(dim, path) {
  const node = rowNodes[path];
  if (!node || node.expanded) return; // already open → no-op (re-entry guard).
  if (node.children && node.children.length) {
    // Already fetched — re-show the cached subtree (collapse had removed it).
    // Set the spinner on this branch too, then re-query.
    drilling.value = path;
    try {
      reinsertChildren(node);
      node.expanded = true;
      syncRowMembersToSelection(dim);
      await runQuery();
    } finally {
      drilling.value = '';
    }
    return;
  }
  drilling.value = path;
  try {
    // Drill in the dimension's ACTIVE hierarchy — when the Set Editor applied an
    // alternate, node.member is a principal name in that hierarchy, so its
    // children must be fetched there too (dimHierarchy[dim] || default).
    const data = await getTm1DimensionChildren(dim, node.member, dimHierarchy[dim] || null);
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.debug(`[PivotExplorer] drill children(${dim}, ${node.member}) raw:`, data);
    }
    const children = normaliseChildren(data);
    recordTypes(dim, children);
    if (!children.length) {
      node.expanded = false;
      return; // leaf — nothing to expand.
    }
    // Each child is a DISTINCT node under THIS path — so a member appearing
    // under two parents has two independent nodes (overlapping rollups).
    const childPaths = [];
    for (const child of children) {
      const childPath = makePath(node.path, child.value);
      if (!rowNodes[childPath]) {
        rowNodes[childPath] = {
          member: child.value,
          path: childPath,
          level: node.level + 1,
          parentPath: node.path,
          expanded: false,
          children: [],
        };
      }
      childPaths.push(childPath);
    }
    node.children = childPaths;
    node.expanded = true;
    insertAfter(node.path, childPaths);
    mergePickerOptions(dim, children);
    syncRowMembersToSelection(dim);
    await runQuery();
  } catch (error) {
    node.expanded = false;
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.debug(`[PivotExplorer] expand(${dim}, ${node.member}) failed:`, error);
    }
  } finally {
    drilling.value = '';
  }
}

// Collapse a row: remove ITS descendant subtree from the visible order (matched
// by path prefix, so only the descendants of THIS occurrence are removed — a
// shared member under another parent is untouched). Nodes remain registered +
// cached for fast re-expand. Then re-query.
function collapseRow(dim, path) {
  const node = rowNodes[path];
  if (!node) return;
  const toRemove = new Set();
  const stack = [...(node.children || [])];
  while (stack.length) {
    const childPath = stack.pop();
    toRemove.add(childPath);
    const child = rowNodes[childPath];
    if (child?.children?.length) stack.push(...child.children);
    if (child) child.expanded = false;
  }
  rowOrder.value = rowOrder.value.filter((p) => !toRemove.has(p));
  node.expanded = false;
  syncRowMembersToSelection(dim);
  runQuery();
}

// Re-insert a previously-collapsed node's direct children after it (their own
// sub-expansions stay collapsed — re-expanding is a fresh, shallow reveal).
// Guarded against double-insertion: skip any child path already in rowOrder.
function reinsertChildren(node) {
  if (!node?.children?.length) return;
  const present = new Set(rowOrder.value);
  const missing = node.children.filter((p) => !present.has(p));
  if (missing.length) insertAfter(node.path, missing);
}

// Insert `paths` into rowOrder immediately after `anchor` (a path). Idempotent:
// any path already present is skipped so re-entry cannot duplicate rows.
function insertAfter(anchor, paths) {
  const present = new Set(rowOrder.value);
  const toAdd = paths.filter((p) => !present.has(p));
  if (!toAdd.length) return;
  const idx = rowOrder.value.indexOf(anchor);
  const next = rowOrder.value.slice();
  const at = idx < 0 ? next.length : idx + 1;
  next.splice(at, 0, ...toAdd);
  rowOrder.value = next;
}

// ── Alias loaders (display-only labels) ──────────────────────────────────────
// Lazy-load a dimension's available aliases ONCE. When the list includes an
// alias literally named `name` and the user hasn't already chosen/cleared an
// alias for this dim, default to it (TM1/PAW convention — the `name` caption is
// the expected default display, and it makes entity/account readable with zero
// clicks). Dims with no `name` alias stay on principal. Fire-and-forget: never
// blocks the pivot render. Re-entry guarded so it fetches at most once.
async function loadDimAliases(dim) {
  if (!dim || dimAliasList[dim] || aliasListLoading[dim]) return;
  aliasListLoading[dim] = true;
  try {
    const data = await getTm1DimensionAliases(dim, dimHierarchy[dim] || null);
    const list = Array.isArray(data?.aliases) ? data.aliases.filter(Boolean) : [];
    dimAliasList[dim] = list;
    // Auto-default to `name` unless the user already made an explicit choice.
    if (!dimAliasTouched[dim] && !dimAlias[dim] && list.includes('name')) {
      setDimAlias(dim, 'name', { user: false });
    }
  } catch {
    // Alias metadata unavailable — leave the dim on principal names. Record an
    // empty list so we don't refetch in a tight loop; a cube change resets it.
    dimAliasList[dim] = [];
  } finally {
    aliasListLoading[dim] = false;
  }
}

// Set (or clear) a dimension's active display alias. Clears the dim's resolved
// label cache and bumps its alias token so any in-flight label fetch for the
// PRIOR alias is dropped, then resolves labels for whatever that dim is showing
// now. `user:true` marks the choice explicit so the auto-default never overrides
// it later. An alias of '' / null means principal names.
function setDimAlias(dim, alias, { user = true } = {}) {
  const next = alias || '';
  if (user) dimAliasTouched[dim] = true;
  if ((dimAlias[dim] || '') === next) return;
  if (next) dimAlias[dim] = next;
  else delete dimAlias[dim];
  if (aliasLabels[dim]) delete aliasLabels[dim];
  aliasSeq[dim] = (aliasSeq[dim] || 0) + 1;
  resolveShownLabels();
}

// Resolve display labels for the members CURRENTLY shown on a dimension, under
// its active alias + hierarchy. Only fetches members not already cached; drops a
// stale response if the dim's alias/hierarchy changed mid-flight (aliasSeq).
// Fire-and-forget — aliasLabels is reactive, so headers/pills re-render when the
// labels land. A dim with no active alias is a no-op (principal names show).
async function ensureAliasLabels(dim, members) {
  const alias = dimAlias[dim];
  if (!dim || !alias) return;
  const hier = dimHierarchy[dim] || null;
  const seq = aliasSeq[dim] || 0;
  const cached = aliasLabels[dim] || {};
  const want = [...new Set((members || []).filter((m) => m != null && !(m in cached)))];
  if (!want.length) return;
  try {
    const data = await getTm1ElementLabels(dim, alias, want, hier);
    // Drop the reply if the alias OR hierarchy changed while it was in flight.
    if ((dimAlias[dim] || '') !== alias || (dimHierarchy[dim] || null) !== hier) return;
    if ((aliasSeq[dim] || 0) !== seq) return;
    const labels = data?.labels || {};
    const map = aliasLabels[dim] ? { ...aliasLabels[dim] } : {};
    // Cache every requested member, falling back to its own key when the alias
    // value is blank, so we never refetch the same members in a tight loop.
    for (const m of want) map[m] = labels[m] || m;
    aliasLabels[dim] = map;
  } catch {
    // TM1 / network error — keep principal names; don't poison the cache so a
    // later relabel can retry.
  }
}

// Resolve labels for every member the grid is currently SHOWING — the displayed
// row members (one segment per row dim), EVERY segment of every displayed column
// tuple (multi-dim aliasing — architect §1.1), and each filter pill's member.
// Called whenever the display set, an alias, or a hierarchy changes. Per-dim
// no-op when that dim is on principal names.
function resolveShownLabels() {
  // Row dims: the rendered row header cells already carry their (dim, member).
  const perDim = new Map();
  const addMember = (dim, member) => {
    if (!dim || member == null) return;
    let set = perDim.get(dim);
    if (!set) {
      set = new Set();
      perDim.set(dim, set);
    }
    set.add(member);
  };
  // Only the RENDERED (capped) rows — we never show, so never relabel, rows
  // beyond MAX_RENDER_ROWS. This bounds the element-labels fan-out to the same
  // ceiling as the DOM (no fetch for members the user can't see).
  for (const row of renderRows.value) {
    for (const hc of row.headerCells || []) addMember(hc.dim, hc.member);
  }
  // Column band: alias EVERY segment of EVERY surviving column tuple, keyed by
  // that segment's dimension (architect §1.1 — multi-dim aliasing). The band
  // cells already carry their (dim, member); walk them across the full depth.
  for (const band of colBand.value) {
    for (const cell of band.cells) addMember(cell.dim, cell.member);
  }
  // Filter pills.
  for (const dim of filterDims.value) addMember(dim, filterSelections[dim]);
  for (const [dim, set] of perDim) {
    if (dimAlias[dim]) ensureAliasLabels(dim, [...set]);
  }
}

// ── Loaders ────────────────────────────────────────────────────────────────
async function loadCubes() {
  cubesLoading.value = true;
  cubesError.value = '';
  try {
    const data = await getTm1Cubes();
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.debug('[PivotExplorer] cubes raw:', data);
    }
    cubes.value = normaliseCubes(data);
    if (!cube.value) {
      cube.value = cubes.value.includes(DEFAULT_CUBE)
        ? DEFAULT_CUBE
        : cubes.value[0] ?? null;
    }
  } catch (error) {
    cubesError.value =
      error?.response?.data?.error || error?.message || 'Could not load cubes.';
  } finally {
    cubesLoading.value = false;
  }
}

async function loadDimensions(cubeName) {
  if (!cubeName) return;
  dimsLoading.value = true;
  dimsError.value = '';
  dimensions.value = [];
  try {
    const data = await getTm1CubeDimensions(cubeName);
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.debug(`[PivotExplorer] dimensions(${cubeName}) raw:`, data);
    }
    dimensions.value = normaliseDimensions(data);
    applyDefaultAssignments(dimensions.value);
    // Lazy-load each dimension's alias list (fire-and-forget — never blocks the
    // initial pivot render). When a dim has a `name` alias this auto-defaults its
    // display to it, then resolves labels for whatever ends up shown.
    for (const d of dimensions.value) loadDimAliases(d);
    await seedAllDefaults();
  } catch (error) {
    dimsError.value =
      error?.response?.data?.error ||
      error?.message ||
      `Could not load dimensions for ${cubeName}.`;
  } finally {
    dimsLoading.value = false;
  }
}

// On cube load, resolve a populated default for every assigned dimension:
// Rows/Cols → children of the top consolidation (a real grid); Filter → its
// single top member. Then auto-run so the explorer opens populated.
async function seedAllDefaults() {
  await Promise.all([
    ...rowDims.value.map((d) => seedPopulatedDefault(d)),
    ...colDims.value.map((d) => seedPopulatedDefault(d)),
    ...filterDims.value.map((d) => ensureSeeded(d)),
  ]);
  if (canRun.value) runQuery();
}

// Sensible default layout: 'account'-ish on Rows, 'month'/'period' on Columns,
// everything else on Filter. Matching is fuzzy because dimension names vary.
function applyDefaultAssignments(dims) {
  for (const k of Object.keys(assignments)) delete assignments[k];
  for (const k of Object.keys(memberSelections)) delete memberSelections[k];
  for (const k of Object.keys(dimHierarchy)) delete dimHierarchy[k];
  for (const k of Object.keys(filterSelections)) delete filterSelections[k];
  for (const k of Object.keys(elementCache)) delete elementCache[k];
  for (const k of Object.keys(memberTypes)) delete memberTypes[k];
  for (const k of Object.keys(defaultMembers)) delete defaultMembers[k];
  // Display-alias state is per-cube — clear it so a new cube re-resolves aliases
  // (and re-auto-defaults to `name`) for its own dimensions from scratch.
  for (const k of Object.keys(dimAlias)) delete dimAlias[k];
  for (const k of Object.keys(dimAliasList)) delete dimAliasList[k];
  for (const k of Object.keys(aliasLabels)) delete aliasLabels[k];
  for (const k of Object.keys(dimAliasTouched)) delete dimAliasTouched[k];
  for (const k of Object.keys(aliasSeq)) delete aliasSeq[k];
  for (const k of Object.keys(rowNodes)) delete rowNodes[k];
  rowOrder.value = [];
  collapsedRowKeys.clear(); // stale outer-collapse keys are for the prior cube.

  let rowsAssigned = false;
  let colsAssigned = false;
  for (const dim of dims) {
    const lower = dim.toLowerCase();
    if (!rowsAssigned && /account/.test(lower)) {
      assignments[dim] = 'rows';
      rowsAssigned = true;
    } else if (!colsAssigned && /(month|period|date|time)/.test(lower)) {
      assignments[dim] = 'cols';
      colsAssigned = true;
    } else {
      assignments[dim] = 'filter';
    }
  }
  // Guarantee at least one row + one col so the view is runnable out of the box.
  if (!rowsAssigned && dims.length) {
    const first = dims.find((d) => assignments[d] === 'filter') || dims[0];
    assignments[first] = 'rows';
    rowsAssigned = true;
  }
  if (!colsAssigned && dims.length) {
    const next = dims.find((d) => assignments[d] === 'filter');
    if (next) {
      assignments[next] = 'cols';
      colsAssigned = true;
    }
  }
}

// ── Run query ────────────────────────────────────────────────────────────
// Build one axis spec for a row/col dimension: { dimension, members[, hierarchy] }.
// The hierarchy key is included ONLY when the Set Editor set an explicit
// alternate (dimHierarchy[d]); on the default hierarchy it's omitted so the
// backend uses the dimension default — matching the per-axis contract.
function axisSpec(d) {
  const spec = { dimension: d, members: memberSelections[d] || [] };
  if (dimHierarchy[d]) spec.hierarchy = dimHierarchy[d];
  return spec;
}

async function runQuery() {
  if (!canRun.value) return;

  // Make sure every axis/filter dimension still has a member — load + seed any
  // empties before querying (covers "never opened a picker" and role changes).
  await Promise.all(
    [...rowDims.value, ...colDims.value, ...filterDims.value]
      .filter((d) => needsSeed(d))
      .map((d) => ensureSeeded(d)),
  );

  const payload = {
    cube: cube.value,
    rows: rowDims.value.map((d) => axisSpec(d)),
    cols: colDims.value.map((d) => axisSpec(d)),
    filters: Object.fromEntries(
      filterDims.value
        .filter((d) => filterSelections[d])
        .map((d) => [d, filterSelections[d]]),
    ),
    suppress: suppressEmpty.value,
  };

  // Abort any fetch still in flight before starting a new one — only one live.
  if (queryAbort) queryAbort.abort();
  const controller = new AbortController();
  queryAbort = controller;

  running.value = true;
  runError.value = '';
  const seq = ++querySeq;
  try {
    const data = await runTm1Query(payload, { signal: controller.signal });
    if (seq !== querySeq) return;
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.debug('[PivotExplorer] query raw:', data);
    }
    result.value = data;
  } catch (error) {
    if (seq !== querySeq) return;
    // Intentional cancel (Cancel button → controller.abort()) is NOT an error:
    // swallow it, keep the previous grid intact, show no banner. axios surfaces
    // an abort as CanceledError (code 'ERR_CANCELED'); the underlying fetch/DOM
    // signal surfaces an AbortError — handle both.
    if (isAbortError(error)) return;
    result.value = null;
    runError.value =
      error?.response?.data?.error || error?.message || 'TM1 query failed.';
  } finally {
    // Only clear loading / drop the controller ref if THIS run is still current
    // (a newer run already owns running + queryAbort otherwise).
    if (seq === querySeq) {
      running.value = false;
      if (queryAbort === controller) queryAbort = null;
    }
  }
}

// True for an intentionally-cancelled request — axios CanceledError (name
// 'CanceledError' / code 'ERR_CANCELED') or the DOM AbortError. Used to swallow
// the abort path so a deliberate Cancel never flashes an error banner.
function isAbortError(error) {
  return (
    error?.code === 'ERR_CANCELED' ||
    error?.name === 'CanceledError' ||
    error?.name === 'AbortError'
  );
}

// Cancel the in-flight pivot fetch (Cancel button). Aborts the controller — the
// runQuery catch swallows the resulting CanceledError and leaves the previous
// grid untouched — and immediately drops the busy state so the toolbar flips
// back to Refresh without waiting on the rejected promise to unwind.
function cancelQuery() {
  if (queryAbort) {
    queryAbort.abort();
    queryAbort = null;
  }
  running.value = false;
}

function needsSeed(dim) {
  if (assignments[dim] === 'filter') return !filterSelections[dim];
  return !memberSelections[dim] || memberSelections[dim].length === 0;
}

// Ensure a dimension has elements loaded AND a default member seeded for its
// CURRENT role — used right before a query.
async function ensureSeeded(dim) {
  await ensureElements(dim);
  seedDefaultMember(dim, elementOptions(dim));
}

// ── Drill (expand / collapse a row in place) ────────────────────────────────
const drilling = ref(''); // member currently being fetched (shows a spinner).

function toggleRow(row) {
  // Drill always targets the INNERMOST row dim (its member set is the tree).
  const dim = innerRowDim.value;
  if (!dim || !row.drillable || !row.path || drilling.value) return;
  if (row.expanded) collapseRow(dim, row.path);
  else expandRow(dim, row.path);
}

// Collapse every expansion back to the populated default rollups and re-run.
async function resetToDefault() {
  const dim = innerRowDim.value;
  if (dim && defaultMembers[dim]?.length) {
    initRowTree(dim, defaultMembers[dim].slice());
  }
  // Restore any OTHER row/col dims (outer row dims + cols) to their defaults too.
  for (const d of [...rowDims.value, ...colDims.value]) {
    if (d === dim) continue;
    if (defaultMembers[d]?.length) memberSelections[d] = defaultMembers[d].slice();
  }
  // Also restore every PAW outer group to expanded (clear the client-side fold).
  collapsedRowKeys.clear();
  if (canRun.value) runQuery();
}

// ── Context-pill / axis-chip interactions ───────────────────────────────────
function togglePicker(key, open, dim) {
  openPicker.value = open ? key : '';
  if (open && dim) ensureElements(dim);
}

function setFilterMember(dim, value) {
  filterSelections[dim] = value;
  openPicker.value = '';
  runQuery();
}

function toggleChipMenu(key, open) {
  openChipMenu.value = open ? key : '';
}

// Open/close a context-pill MOVE menu (the keyboard-operable equivalent of
// dragging a filter pill onto an axis well). Single-open across all pills.
function toggleCtxMenu(dim, open) {
  openCtxMenu.value = open ? dim : '';
}

// Move a filter dimension to an axis from its context-pill move menu. Closes
// the menu, then funnels through the same moveDimension reassign path.
function moveCtxDimension(dim, target) {
  openCtxMenu.value = '';
  moveDimension(dim, target);
}

// ── INLINE alias control (the first-class, always-visible picker) ─────────────
// The short label shown on the inline "· <label> ▾" affordance: the active alias
// NAME when one is set (e.g. "name", "code"), else "principal" — so the user can
// see WHICH display attribute the dim's elements are labelled under without
// opening anything (PAW shows the attribute on the dimension).
function aliasButtonLabel(dim) {
  return dimAlias[dim] || 'principal';
}

// Open/close an inline alias picker. The single `openAliasMenu` ref is keyed
// `${role}:${dim}`, so opening one alias menu closes any other alias menu by
// construction (each KMenu binds :model-value to `openAliasMenu === itsKey`).
// The OTHER floating layers (member-picker popover, move menus) are separate
// refs we deliberately do NOT cross-close here — Reka's modal roots self-dismiss
// on the outside-pointerdown that opens this one.
function toggleAliasMenu(key, open) {
  openAliasMenu.value = open ? key : '';
}

// Choose a display alias from an INLINE picker (pill or chip). Closes the inline
// menu (by key), then sets the dim's alias through the SAME setDimAlias funnel
// the legacy paths use — display-only, the pivot query is never aliased; '' =
// principal names. setDimAlias relabels the grid + pills live (plumbing is done).
function chooseAlias(key, dim, alias) {
  if (openAliasMenu.value === key) openAliasMenu.value = '';
  setDimAlias(dim, alias, { user: true });
}

// Shared reassign TAIL — the single funnel every dimension-reassign path
// (chip menu, context-pill menu, swap button, drag-drop) runs through after it
// has set the new assignment(s). It (1) resets the row drill tree, (2) re-seeds
// members for the CURRENT role of EVERY axis/filter dimension (so multi-dim
// axes are correct, not just the one(s) that moved), and (3) either re-queries
// (canRun) or, when an axis was emptied (!canRun), clears the previous result +
// drill state so the grid drops to its "needs config" empty state instead of
// leaving a stale grid that no longer matches the (now invalid) layout.
async function reseedAndRun() {
  // Reset the row tree (the primary row dimension may have changed).
  for (const k of Object.keys(rowNodes)) delete rowNodes[k];
  rowOrder.value = [];
  // Outer-collapse keys are keyed by the prior layout's outer tuples — a new
  // axis arrangement invalidates them, so clear the fold back to fully expanded.
  collapsedRowKeys.clear();

  // Re-seed members appropriately for the (possibly new) axis roles.
  await Promise.all([
    ...rowDims.value.map((d) => seedPopulatedDefault(d)),
    ...colDims.value.map((d) => seedPopulatedDefault(d)),
    ...filterDims.value.map((d) => ensureSeeded(d)),
  ]);

  if (canRun.value) {
    runQuery();
  } else {
    // An axis emptied (only-Rows or only-Cols dim moved away). runQuery would
    // early-return and leave the PREVIOUS grid rendered while the well shows
    // "none" — a populated grid that no longer matches the config. Drop the
    // stale result + drill state so the "Put at least one dimension on Rows and
    // one on Columns" empty state shows instead.
    result.value = null;
    runError.value = '';
    for (const k of Object.keys(rowNodes)) delete rowNodes[k];
    rowOrder.value = [];
  }
}

// Move a dimension between Rows / Columns / Filter from a chip menu. Sets the
// new assignment, then funnels through the shared reseed/re-query tail.
async function moveDimension(dim, target) {
  if (assignments[dim] === target) {
    openChipMenu.value = '';
    return;
  }
  assignments[dim] = target;
  openChipMenu.value = '';
  await reseedAndRun();
}

// Swap the single row dim and single column dim (toolbar button). Sets both
// assignments, then funnels through the SAME shared tail (one re-query, not
// two). Behaviour is identical to moveDimension for the single-dim case.
async function swapAxes() {
  if (!canSwap.value) return;
  const r = rowDims.value[0];
  const c = colDims.value[0];
  assignments[r] = 'cols';
  assignments[c] = 'rows';
  await reseedAndRun();
}

// ── Set Editor open / apply ──────────────────────────────────────────────────
// Open the Set Editor for an axis dimension. Closes any open chip menu first so
// the dialog doesn't open behind a floating menu. The editor reads the dim's
// current hierarchy + members via its props (bound to dimHierarchy/memberSelections).
function openSetEditor(dim) {
  openChipMenu.value = '';
  editorDim.value = dim;
  editorOpen.value = true;
}

// Apply the built set back onto the axis. Writes the chosen hierarchy + ordered
// members, rebuilds the row drill tree (the primary row dim's members may have
// changed wholesale), records the members' default for "Collapse all", and
// re-queries. The hierarchy + members are the source of truth the axis spec
// (axisSpec) now reads — runTm1Query honours per-axis hierarchy + the set order.
async function applySet({ dimension, hierarchy, members, types, alias }) {
  if (!dimension) return;
  const next = Array.isArray(members) ? members.slice() : [];
  // Did the dimension's hierarchy actually change? (null/absent === default.)
  const prevHierarchy = dimHierarchy[dimension] || null;
  const nextHierarchy = hierarchy || null;
  const hierarchyChanged = prevHierarchy !== nextHierarchy;
  // Record the explicit hierarchy (null clears it back to the default).
  if (hierarchy) dimHierarchy[dimension] = hierarchy;
  else delete dimHierarchy[dimension];

  // The element cache is keyed by hierarchy — when the hierarchy changed, drop
  // the dim's cache so any later picker/seed refetches members in the NEW
  // hierarchy rather than serving the prior hierarchy's element list.
  if (hierarchyChanged) delete elementCache[dimension];

  // Aliases (the LIST + the resolved labels) are hierarchy-scoped — a hierarchy
  // switch invalidates both. Drop the resolved labels + bump the dim's token so
  // any in-flight label fetch from the prior hierarchy is dropped, and refetch
  // the alias list in the new hierarchy.
  if (hierarchyChanged) {
    if (aliasLabels[dimension]) delete aliasLabels[dimension];
    aliasSeq[dimension] = (aliasSeq[dimension] || 0) + 1;
    delete dimAliasList[dimension];
    loadDimAliases(dimension);
  }

  // Carry through the display alias the user was looking at in the editor (the
  // SAME label the grid should now show). `alias === undefined` (older payloads)
  // leaves the current alias untouched; a string sets it; null clears to
  // principal. Marked as an explicit user choice so the auto-default never
  // overrides it. setDimAlias relabels the shown members.
  if (alias !== undefined) setDimAlias(dimension, alias, { user: true });

  // Learn the applied members' types (consolidation vs leaf) so the rendered
  // grid knows which rows are drillable — the editor surfaced these from the
  // (possibly alternate) hierarchy. recordTypes wants [{ value, type }].
  if (types && typeof types === 'object') {
    recordTypes(
      dimension,
      Object.entries(types).map(([value, type]) => ({ value, type })),
    );
  }

  memberSelections[dimension] = next;
  // The editor's members become the new "default" for this dim so Collapse all
  // returns here rather than to the original auto-seeded rollups.
  defaultMembers[dimension] = next.slice();

  // Reset the drill tree so no node retains children fetched under the PRIOR
  // hierarchy (P1-C: a cached re-expand would otherwise replay stale-hierarchy
  // children). The tree owns the INNERMOST row dim's member set: when the applied
  // dim IS the innermost row dim, re-seed the tree to its new top-level members
  // (collapsed). When an OUTER row dim's hierarchy changed, re-seed the inner
  // tree from its (unchanged) members so any stale nodes are dropped while the
  // inner drill state resets cleanly alongside the new outer fan.
  if (assignments[dimension] === 'rows') {
    if (dimension === innerRowDim.value) {
      initRowTree(dimension, next);
    } else if (hierarchyChanged) {
      const inner = innerRowDim.value;
      if (inner) initRowTree(inner, (memberSelections[inner] || []).slice());
    }
  }

  if (canRun.value) runQuery();
}

// ── Number formatting (finance: thousands-separated, negatives in red) ───────
// Locale-grouped figures; we don't force ZAR. When the backend supplies a
// `formatted` string we prefer it verbatim.
const numberFormatter = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 2,
});

// Render a normalised cell { value, formatted }. Blank for null / empty always.
// ZERO is suppress-aware (PAW parity): under Suppress Zeroes ON, a zeroish cell
// renders BLANK (PAW shows blanks, not 0.00); with suppress OFF, zero stays
// VISIBLE (the cube's stored 0.00). When showing a value we prefer the backend's
// formatted string verbatim, else thousands-format the numeric.
function formatCell(cell) {
  if (cell == null) return '';
  // Suppress ON → blank any zeroish cell (incl. a backend-formatted "0.00"),
  // BEFORE preferring the formatted string (else "0.00" would leak through).
  if (suppressEmpty.value && isCellZeroish(cell)) return '';
  if (cell.formatted != null && cell.formatted !== '') return cell.formatted;
  const v = cell.value;
  if (v === null || v === undefined || v === '') return '';
  const n = Number(v);
  if (Number.isFinite(n)) {
    // Suppress OFF → zero is visible; suppress ON never reaches here for a zero
    // (handled above).
    if (n === 0 && suppressEmpty.value) return '';
    return numberFormatter.format(n);
  }
  return String(v); // non-numeric cell (string member) — show as-is.
}

// Format a raw numeric total (column/row/grand). Blank for null. Zero is
// suppress-aware to match the cells: blank under suppress ON, visible when OFF.
function formatTotal(value) {
  if (value === null || value === undefined) return '';
  const n = Number(value);
  if (!Number.isFinite(n)) return '';
  if (n === 0 && suppressEmpty.value) return '';
  return numberFormatter.format(n);
}

// Negative figures read red (finance cost-direction convention). A cell is
// negative if its raw numeric is < 0 (falls back to parsing the formatted
// string — leading "-" or wrapping "(…)" — when only a formatted string exists).
function cellClass(cell) {
  return { 'pivot-grid__cell--neg': isNegativeCell(cell) };
}

function totalClass(value) {
  const n = Number(value);
  return { 'pivot-grid__cell--neg': Number.isFinite(n) && n < 0 };
}

function isNegativeCell(cell) {
  if (!cell) return false;
  const n = Number(cell.value);
  if (Number.isFinite(n)) return n < 0;
  const f = cell.formatted;
  if (typeof f === 'string') return /^\s*[-(]/.test(f.trim());
  return false;
}

// ── Reactions ──────────────────────────────────────────────────────────────
watch(cube, (next, prev) => {
  if (next === prev) return;
  result.value = null;
  runError.value = '';
  loadDimensions(next);
});

// Toggling "Suppress zeros" re-runs the query so the server-side NON EMPTY flag
// (payload.suppress) is re-applied; the client suppression layer then drops any
// stored-zero rows/cols NON EMPTY kept. Without this the toggle changed only the
// NEXT payload and nothing re-queried. Guarded on canRun so an unconfigured grid
// doesn't fire an early-returning query.
watch(suppressEmpty, () => {
  if (canRun.value) runQuery();
});

// Whenever the SET OF MEMBERS ON SCREEN changes — a fresh query result, a drill
// expand/collapse, a suppress toggle, an axis move, or a filter pill change —
// resolve the display labels for the newly-shown members under each dim's active
// alias. Reactive deps: the rendered rows + columns (which recompute on all of
// the above) and the filter selections. Per-dim no-op when on principal names;
// only un-cached members are fetched. `resolveShownLabels` reads the RENDERED
// (capped) rows + the current displayColHeaders, so this watcher's job is purely
// to re-trigger it on change (the returned arrays are the change signal). It does
// NOT touch the query — labels are display-only.
watch(
  // Use renderRows (the capped, on-screen set) so the dep matches what
  // resolveShownLabels actually iterates — no relabel churn for rows past the
  // cap. Include colDims (it maps col headers via colDims.value[0]);
  // displayColHeaders covers col member changes, filterSelections the pills.
  // Direct callers (setDimAlias / applySet) own alias/hierarchy-change triggers.
  () => [renderRows.value, displayColHeaders.value, colDims.value, { ...filterSelections }],
  () => resolveShownLabels(),
);

// First load.
loadCubes();
</script>

<style scoped>
.pivot {
  display: grid;
  gap: 12px;
}

/* ════════════════════════════════════════════════════════════════════════════
   1 ── TOOLBAR
   ═══════════════════════════════════════════════════════════════════════════ */
.pivot-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  padding: 8px 10px;
  border: 1px solid var(--kdl-border-subtle);
  border-radius: 8px;
  background: var(--kdl-page-bg);
}

.pivot-toolbar__cube {
  flex: 0 1 280px;
  min-width: 200px;
}

.pivot-toolbar__cube-select {
  width: 100%;
}

.pivot-toolbar__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  margin-left: auto;
}

.pivot-toolbar__btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 12px;
  border: 1px solid var(--kdl-border);
  border-radius: 6px;
  background: var(--kdl-card-bg);
  color: var(--kdl-text-secondary);
  font-family: inherit;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: border-color var(--duration-short, 150ms) var(--ease-standard, cubic-bezier(0.2, 0, 0, 1)),
              color var(--duration-short, 150ms) var(--ease-standard, cubic-bezier(0.2, 0, 0, 1));
}

.pivot-toolbar__btn:hover:not(:disabled) {
  border-color: var(--kdl-text-muted);
  color: var(--kdl-text-primary);
}

.pivot-toolbar__btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.pivot-toolbar__btn-icon {
  flex: 0 0 auto;
  color: var(--kdl-text-hint);
}

/* Cancel — replaces Refresh while a fetch is in flight. A quiet interrupt: the
   documented cost-direction / error red (same token used by .pivot-banner--error
   in this stylesheet — KDL gap, not a new colour) on border + label, so it reads
   as "stop" without shouting. Hover deepens the same red. */
.pivot-toolbar__btn--cancel {
  border-color: #dc2626;
  color: #dc2626;
}

.pivot-toolbar__btn--cancel .pivot-toolbar__btn-icon {
  color: #dc2626;
}

.pivot-toolbar__btn--cancel:hover:not(:disabled) {
  border-color: #b91c1c;
  color: #b91c1c;
}

:root[data-theme="dark"] .pivot-toolbar__btn--cancel,
:root[data-theme="dark"] .pivot-toolbar__btn--cancel .pivot-toolbar__btn-icon {
  border-color: #f87171;
  color: #f87171;
}

:root[data-theme="dark"] .pivot-toolbar__btn--cancel:hover:not(:disabled) {
  border-color: #fca5a5;
  color: #fca5a5;
}

.pivot-toolbar__busy {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 500;
  color: var(--kdl-text-secondary);
}

/* ── Thin status banners ──────────────────────────────────────────────────── */
.pivot-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  padding: 8px 12px;
  border: 1px solid var(--kdl-border-subtle);
  border-radius: 6px;
  background: var(--kdl-page-bg);
  color: var(--kdl-text-secondary);
  font-size: 13px;
}

.pivot-banner--error {
  color: #dc2626; /* danger-600 — documented cost-direction / error red (KDL gap) */
  border-color: #dc2626;
}

:root[data-theme="dark"] .pivot-banner--error {
  color: #f87171;
  border-color: #f87171;
}

/* Notice variant — the interim row-cap advisory. Not an error: a quiet accent-
   tinted notice (same accent token the dropzones use), primary text so the
   guidance is legible. All colour via KDL tokens / color-mix — no raw hex. */
.pivot-banner--notice {
  border-color: color-mix(in srgb, var(--kdl-accent) 45%, var(--kdl-border));
  background: color-mix(in srgb, var(--kdl-accent) 7%, var(--kdl-page-bg));
  color: var(--kdl-text-primary);
}

/* ════════════════════════════════════════════════════════════════════════════
   DRAG-AND-DROP — shared dimension-pivoting affordances
   Every dimension token (context pill, axis chip) is draggable; the three zones
   (Context bar, Rows well, Columns well) are drop targets. The active drop zone
   gets a tinted dashed outline; the source token dims while in flight. All
   colour comes from KDL tokens (accent / hover) via color-mix — no raw hex.
   ═══════════════════════════════════════════════════════════════════════════ */
/* A token (pill / chip) the user can pick up — but ONLY via its leading grip
   handle (.pivot-grip), which carries the grab cue + is the sole draggable
   element. The token body keeps its buttons' click cursors. */
.pivot-token {
  cursor: default;
}

/* The source token while it's being dragged — quietly recede. */
.pivot-token--dragging {
  opacity: 0.45;
}

/* A zone that accepts drops. On dragover it gains a tinted, dashed accent
   outline so the target is unmistakable. The transition is colour-only and
   respects reduced-motion (below). */
.pivot-dropzone {
  transition: border-color var(--duration-short, 150ms) var(--ease-standard, cubic-bezier(0.2, 0, 0, 1)),
              background var(--duration-short, 150ms) var(--ease-standard, cubic-bezier(0.2, 0, 0, 1));
}

.pivot-dropzone--active {
  border-style: dashed;
  border-color: var(--kdl-accent);
  background: color-mix(in srgb, var(--kdl-accent) 7%, transparent);
}

@media (prefers-reduced-motion: reduce) {
  .pivot-dropzone {
    transition: none;
  }
}

/* ════════════════════════════════════════════════════════════════════════════
   2 ── CONTEXT BAR (filter pills)
   ═══════════════════════════════════════════════════════════════════════════ */
.pivot-context {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

/* The Context bar is also a drop zone — give it the framed look the wells have
   so its dashed-on-dragover state reads as "a zone", and pad it for the outline
   to sit off the pills. */
.pivot-context.pivot-dropzone {
  padding: 6px 10px;
  border: 1px dashed transparent;
  border-radius: 6px;
}

/* A filter token: the grip handle + the member-picker pill + its move button,
   as one control. They share a hairline so they read as a single unit; only the
   leading grip initiates a drag. */
.pivot-pill-group {
  display: inline-flex;
  align-items: stretch;
}

/* The GRIP HANDLE — the sole drag-initiation surface of the token. A bare 6-dot
   glyph (not a button) so a quick mouse-drag that starts here is unambiguous.
   It is the leading segment of the grouped pill, so it rounds the leading edge.
   Subtle at rest (hint), strengthens to accent on hover so it reads as a grab
   handle. ~16px wide gives an easy hit area. */
.pivot-grip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 16px;
  height: 28px;
  border: 1px solid var(--kdl-border);
  border-right-width: 0;
  border-radius: 999px 0 0 999px;
  background: var(--kdl-card-bg);
  color: var(--kdl-text-hint);
  cursor: grab;
  transition: color var(--duration-short, 150ms) var(--ease-standard, cubic-bezier(0.2, 0, 0, 1)),
              background var(--duration-short, 150ms) var(--ease-standard, cubic-bezier(0.2, 0, 0, 1)),
              border-color var(--duration-short, 150ms) var(--ease-standard, cubic-bezier(0.2, 0, 0, 1));
}

.pivot-grip:hover {
  color: var(--kdl-accent);
  background: var(--kdl-hover-bg);
  border-color: var(--kdl-text-muted);
}

.pivot-grip:active {
  cursor: grabbing;
}

.pivot-grip:focus-visible {
  outline: 2px solid var(--kdl-accent);
  outline-offset: 1px;
}

.pivot-grip__icon {
  display: block;
}

@media (prefers-reduced-motion: reduce) {
  .pivot-grip {
    transition: none;
  }
}

.pivot-context__label {
  flex-shrink: 0;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--kdl-text-hint);
}

.pivot-context__pills {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.pivot-pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 28px;
  padding: 0 8px 0 10px;
  border: 1px solid var(--kdl-border);
  /* Middle segment of the grouped token — the grip rounds the leading edge and
     the move button the trailing edge, so the pill itself is flat-sided and the
     three read as one continuous pill with hairline dividers. */
  border-radius: 0;
  border-right-width: 0;
  background: var(--kdl-card-bg);
  color: var(--kdl-text-secondary);
  font-family: inherit;
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
  transition: border-color var(--duration-short, 150ms) var(--ease-standard, cubic-bezier(0.2, 0, 0, 1)),
              background var(--duration-short, 150ms) var(--ease-standard, cubic-bezier(0.2, 0, 0, 1));
}

.pivot-pill:hover {
  border-color: var(--kdl-text-muted);
  background: var(--kdl-hover-bg);
}

/* The trailing move-menu button — the right half of the grouped token. */
.pivot-pill__move {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 28px;
  padding: 0;
  border: 1px solid var(--kdl-border);
  border-radius: 0 999px 999px 0;
  background: var(--kdl-card-bg);
  color: var(--kdl-text-hint);
  cursor: pointer;
  transition: border-color var(--duration-short, 150ms) var(--ease-standard, cubic-bezier(0.2, 0, 0, 1)),
              background var(--duration-short, 150ms) var(--ease-standard, cubic-bezier(0.2, 0, 0, 1)),
              color var(--duration-short, 150ms) var(--ease-standard, cubic-bezier(0.2, 0, 0, 1));
}

.pivot-pill__move:hover {
  border-color: var(--kdl-text-muted);
  background: var(--kdl-hover-bg);
  color: var(--kdl-text-secondary);
}

@media (prefers-reduced-motion: reduce) {
  .pivot-pill,
  .pivot-pill__move {
    transition: none;
  }
}

.pivot-pill__dim {
  color: var(--kdl-text-muted);
  font-weight: 500;
}

.pivot-pill__sep {
  color: var(--kdl-text-hint);
}

.pivot-pill__member {
  color: var(--kdl-text-primary);
  font-weight: 600;
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pivot-pill__chevron {
  flex: 0 0 auto;
  margin-left: 1px;
  color: var(--kdl-text-hint);
}

/* The INLINE ALIAS picker trigger — a secondary segment sitting between the
   member button and the trailing move button. A flat-sided middle segment (the
   move button still rounds the trailing edge), reading SUBORDINATE to the
   member: muted text, a leading "·" hairline divider glyph, the active label,
   and a small chevron. Only rendered when the dim has aliases, so the pill
   connects straight to the move button when there are none. */
.pivot-pill__alias {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 28px;
  padding: 0 7px;
  border: 1px solid var(--kdl-border);
  border-radius: 0;
  border-right-width: 0;
  background: var(--kdl-card-bg);
  color: var(--kdl-text-hint);
  font-family: inherit;
  font-size: 11px;
  cursor: pointer;
  white-space: nowrap;
  transition: border-color var(--duration-short, 150ms) var(--ease-standard, cubic-bezier(0.2, 0, 0, 1)),
              background var(--duration-short, 150ms) var(--ease-standard, cubic-bezier(0.2, 0, 0, 1)),
              color var(--duration-short, 150ms) var(--ease-standard, cubic-bezier(0.2, 0, 0, 1));
}

.pivot-pill__alias:hover {
  border-color: var(--kdl-text-muted);
  background: var(--kdl-hover-bg);
  color: var(--kdl-text-secondary);
}

.pivot-pill__alias-sep {
  color: var(--kdl-border);
  font-weight: 700;
}

.pivot-pill__alias-name {
  color: var(--kdl-text-secondary);
  font-weight: 600;
  max-width: 90px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pivot-pill__alias-chevron {
  flex: 0 0 auto;
  color: var(--kdl-text-hint);
}

@media (prefers-reduced-motion: reduce) {
  .pivot-pill__alias {
    transition: none;
  }
}

/* Popover body (the member picker) — rendered inside teleported .kp-content. */
.pivot-picker {
  display: grid;
  gap: 8px;
  min-width: 220px;
}

.pivot-picker__title {
  margin: 0;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--kdl-text-hint);
}

.pivot-picker__control {
  width: 100%;
}

.pivot-picker__load {
  display: inline-flex;
  align-items: center;
  justify-self: start;
  gap: 6px;
  padding: 6px 10px;
  border: 1px solid var(--kdl-border);
  border-radius: 6px;
  background: var(--kdl-card-bg);
  color: var(--kdl-text-secondary);
  font-family: inherit;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
}

.pivot-picker__load:hover:not(:disabled) {
  border-color: var(--kdl-text-muted);
  color: var(--kdl-text-primary);
}

.pivot-picker__load:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.pivot-picker__error {
  margin: 0;
  font-size: 12px;
  color: #dc2626; /* danger-600 — documented error red (KDL gap) */
}

:root[data-theme="dark"] .pivot-picker__error {
  color: #f87171;
}

/* ════════════════════════════════════════════════════════════════════════════
   3 ── AXIS WELLS
   ═══════════════════════════════════════════════════════════════════════════ */
.pivot-wells {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.pivot-well {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1 1 240px;
  min-width: 0;
  padding: 6px 10px;
  border: 1px dashed var(--kdl-border);
  border-radius: 6px;
  background: var(--kdl-page-bg);
}

.pivot-well__label {
  flex-shrink: 0;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--kdl-text-hint);
}

.pivot-well__chips {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.pivot-well__empty {
  font-size: 12px;
  color: var(--kdl-text-hint);
  font-style: italic;
}

/* ════════════════════════════════════════════════════════════════════════════
   4 ── THE PIVOT GRID (hero)
   The grid is the dominant element: a tall self-scrolling viewport so the
   sticky column-header band + sticky first column engage against THIS container
   (not the page), and a wide month grid scrolls on both axes within a framed
   region. The chrome above is deliberately compact so the grid owns the space.
   ═══════════════════════════════════════════════════════════════════════════ */
.pivot-grid-wrap {
  max-height: 70vh;
  overflow: auto;
  border: 1px solid var(--kdl-border);
  border-radius: 8px;
  background: var(--kdl-card-bg);
  transition: opacity var(--duration-short, 150ms) var(--ease-standard, cubic-bezier(0.2, 0, 0, 1));
}

/* While re-querying, dim the stale grid slightly (kept legible). */
.pivot-grid-wrap--busy {
  opacity: 0.6;
}

@media (prefers-reduced-motion: reduce) {
  .pivot-grid-wrap {
    transition: none;
  }
}

.pivot-grid {
  /* Local layout tokens — widths constrain the grid so drilling (longer labels)
     and few-column slices don't reflow the whole table. Spacing scale only. */
  --pivot-rowhead-min: 220px;
  --pivot-rowhead-max: 360px;
  --pivot-num-min: 96px;
  /* Header-band row height — also the per-level cumulative sticky-top offset so a
     multi-row nested band freezes as a STACK (level L sticks at L × this) rather
     than collapsing every band row onto top:0. */
  --pivot-head-h: 34px;
  /* Total band tints — derived from the brand-navy token via color-mix (the
     house pattern, see KTable / EmptyState). The band is a real navy FILL, not
     a near-white grey, so it reads as a band distinct from the zebra. */
  --pivot-total-tint: color-mix(in srgb, var(--kdl-brand-navy) 8%, transparent);
  --pivot-total-fill: var(--kdl-brand-navy);

  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
}

.pivot-grid th,
.pivot-grid td {
  height: 32px;
  padding: 0 14px;
  border-bottom: 1px solid var(--kdl-border-subtle);
  text-align: left;
  white-space: nowrap;
}

/* Numeric columns get a sensible min-width so a few-column slice doesn't let a
   single column stretch across the viewport. Group (outer-band) cells share it so
   a single-leaf group doesn't collapse narrower than its leaf below. */
.pivot-grid__col-head,
.pivot-grid__col-group,
.pivot-grid__cell {
  min-width: var(--pivot-num-min);
}

/* ── Column-header band (frozen on vertical scroll) ───────────────────────── */
/* Each band ROW carries --band-level (0 = outermost); its cells stick at a
   cumulative top offset so a multi-row nested band freezes as a stack rather than
   collapsing onto top:0. Single-col-dim → one row at level 0 → top:0 (unchanged). */
.pivot-grid__col-band-row {
  --band-level: 0;
}

.pivot-grid thead th {
  position: sticky;
  top: calc(var(--pivot-head-h) * var(--band-level, 0));
  z-index: 2;
  height: var(--pivot-head-h);
  background: var(--kdl-page-bg);
  /* 11px uppercase header → small text, so it must clear AA 4.5:1. The muted
     token (#6B7280 on #F5F5F8 ≈ 4.3:1) fell short; secondary (#4B5563 ≈ 7:1)
     clears it. */
  color: var(--kdl-text-secondary);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  border-bottom: 1px solid var(--kdl-border);
}

.pivot-grid__col-head {
  text-align: right;
}

/* Outer (group) band cells — a year spanning its months. Centred over their span
   with a hairline divider between sibling groups so the nesting reads as merged
   header bands. The innermost band row keeps the right-aligned numeric col-head
   style above (it heads the data columns); the group rows centre instead. */
.pivot-grid__col-group {
  text-align: center;
  border-left: 1px solid var(--kdl-border-subtle);
}
.pivot-grid__col-group:first-of-type {
  border-left: none;
}

/* Corner cell — row/col intersection: highest stack, frozen on both axes. It
   rowspans the full band depth, so it stays pinned at top:0 (band level 0). */
.pivot-grid__corner {
  position: sticky;
  left: 0;
  top: 0;
  z-index: 3;
  min-width: var(--pivot-rowhead-min);
  max-width: var(--pivot-rowhead-max);
  color: var(--kdl-text-secondary);
  background: var(--kdl-page-bg);
  border-right: 1px solid var(--kdl-border);
  vertical-align: bottom;
}

/* ── Row-header column (frozen on horizontal scroll) ──────────────────────── */
.pivot-grid__row-head {
  position: sticky;
  left: 0;
  z-index: 1;
  /* Constrain the row-header column so drilling (deeper, longer labels) and
     "Collapse all" don't reflow the data columns. Overflow ellipsises (title
     carries the full label). */
  min-width: var(--pivot-rowhead-min);
  max-width: var(--pivot-rowhead-max);
  padding: 0;
  font-size: 13px;
  font-weight: 500;
  color: var(--kdl-text-primary);
  background: var(--kdl-card-bg);
  border-right: 1px solid var(--kdl-border);
}

.pivot-grid__row-head--consol {
  font-weight: 600;
}

/* OUTER-PARENT group-header rows (PAW per-level row hierarchy): bolder weight so
   each collapsible group reads as a heading over its indented descendants. The
   cohesive row wash lives on .pivot-grid__row--parent (below) so header + cells
   tint as one band. */
.pivot-grid__row-head--parent {
  font-weight: 600;
}

/* The row-header BAND: all inside the single frozen header column (so the sticky-
   left pane stays one column — no cumulative multi-column offsets). In the PAW
   nested shape each row has ONE segment — an OUTER-PARENT group header or the
   INNERMOST drill node — that flexes to fill and indents per level. The pre-
   response / no-tree fallback lays its plain (non-inner, non-parent) segments
   side-by-side as fixed-content labels with a hairline divider. */
.pivot-grid__row-head-band {
  display: flex;
  align-items: stretch;
  height: 100%;
  min-width: 0;
}

.pivot-grid__row-seg {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  padding: 0 14px;
}

/* Fallback plain segments (neither a parent nor the inner drill node): fixed to
   their content, divided by a hairline, quieter — the legacy side-by-side band. */
.pivot-grid__row-seg:not(.pivot-grid__row-seg--inner):not(.pivot-grid__row-seg--parent) {
  flex: 0 0 auto;
  max-width: 160px;
  border-right: 1px solid var(--kdl-border-subtle);
  color: var(--kdl-text-muted);
  font-weight: 500;
}

/* Hierarchy segments (the inner drill node AND outer-parent group headers): flex
   to fill, indent per level via a data-driven custom property (set inline) rather
   than inline padding — the house no-inline-style-for-design-values pattern (the
   sanctioned --row-indent exception). */
.pivot-grid__row-seg--inner,
.pivot-grid__row-seg--parent {
  flex: 1 1 auto;
  padding-left: calc(14px + var(--row-indent, 0px));
}

/* Outer-parent group header: a touch bolder + primary-toned so a group reads as a
   heading over its indented children (PAW group rows). */
.pivot-grid__row-seg--parent {
  font-weight: 600;
  color: var(--kdl-text-primary);
}

.pivot-grid__row-label {
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ── Expand / collapse twisty ─────────────────────────────────────────────── */
.pivot-grid__twisty {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--kdl-text-muted);
  cursor: pointer;
  transition: color var(--duration-short, 150ms) var(--ease-standard, cubic-bezier(0.2, 0, 0, 1)),
              background var(--duration-short, 150ms) var(--ease-standard, cubic-bezier(0.2, 0, 0, 1));
}

.pivot-grid__twisty:hover:not(:disabled) {
  color: var(--kdl-accent);
  background: var(--kdl-hover-bg);
}

.pivot-grid__twisty:disabled {
  cursor: progress;
}

.pivot-grid__twisty-icon {
  display: block;
  transition: transform var(--duration-short, 150ms) var(--ease-standard, cubic-bezier(0.2, 0, 0, 1));
}

.pivot-grid__twisty-icon--open {
  transform: rotate(90deg);
}

.pivot-grid__twisty-spacer {
  display: inline-block;
  flex-shrink: 0;
  width: 18px;
  height: 18px;
}

@media (prefers-reduced-motion: reduce) {
  .pivot-grid__twisty,
  .pivot-grid__twisty-icon {
    transition: none;
  }
}

/* ── Cells ────────────────────────────────────────────────────────────────── */
.pivot-grid__cell {
  font-size: 13px;
  text-align: right;
  color: var(--kdl-text-primary);
}

.pivot-num {
  font-variant-numeric: tabular-nums;
}

/* Negative figures read red — finance cost-direction convention. #dc2626 is the
   documented danger-600 / cost-direction hex (KDL exposes no semantic
   --kdl-danger var yet — same gap noted in CostCutRow / MetricTile). */
.pivot-grid__cell--neg {
  color: #dc2626;
}

:root[data-theme="dark"] .pivot-grid__cell--neg {
  color: #f87171;
}

/* ── Three distinguishable surfaces: zebra · hover · total ────────────────────
   Resting data cells sit on the card; even rows get a QUIET neutral zebra; row
   hover steps to a PERCEPTIBLY darker neutral. The total band (below) is a navy
   tint — a different hue entirely — so the three never read as the same grey. */
.pivot-grid tbody tr:nth-child(even) .pivot-grid__cell,
.pivot-grid tbody tr:nth-child(even) .pivot-grid__row-head {
  background: var(--kdl-hover-bg); /* quiet neutral zebra */
}

.pivot-grid tbody tr:hover .pivot-grid__cell,
.pivot-grid tbody tr:hover .pivot-grid__row-head {
  background: var(--kdl-border-subtle); /* a step darker than zebra */
}

/* Consolidation rows carry a faint navy tint so rollups read as structure. */
.pivot-grid__row--consol .pivot-grid__row-head {
  color: var(--kdl-brand-navy);
}

:root[data-theme="dark"] .pivot-grid__row--consol .pivot-grid__row-head {
  color: var(--kdl-text-primary);
}

/* OUTER-PARENT group rows: a faint neutral wash across the WHOLE band (header +
   cells) so a collapsible group reads as one heading over its indented children.
   Scoped under `.pivot-grid tbody` to out-specify the zebra rule; hover steps a
   touch darker (kept perceptible). color-mix off a neutral token — no raw colour. */
.pivot-grid tbody tr.pivot-grid__row--parent .pivot-grid__cell,
.pivot-grid tbody tr.pivot-grid__row--parent .pivot-grid__row-head {
  background: color-mix(in srgb, var(--kdl-brand-navy) 5%, var(--kdl-card-bg));
}

.pivot-grid tbody tr.pivot-grid__row--parent:hover .pivot-grid__cell,
.pivot-grid tbody tr.pivot-grid__row--parent:hover .pivot-grid__row-head {
  background: color-mix(in srgb, var(--kdl-brand-navy) 9%, var(--kdl-card-bg));
}

/* ── Totals — a genuine NAVY BAND, not grey-on-grey ───────────────────────────
   The row-total column (per-row) gets a navy TINT; the column-total footer +
   grand-total cell get a solid navy FILL with white text. Column-total and
   row-total share the navy hue so the band reads as one continuous frame around
   the data, unmistakably distinct from the neutral zebra/hover surfaces. */
.pivot-grid__total-head {
  border-left: 2px solid var(--kdl-brand-navy);
}

.pivot-grid tbody .pivot-grid__total-cell {
  border-left: 2px solid var(--kdl-brand-navy);
  font-weight: 600;
  background: var(--pivot-total-tint);
}

/* Hovering a data row must NOT lighten its total cell (the old inversion). The
   row-hover rule above would repaint the total cell neutral; re-assert a navy
   tint — a touch deeper — so hover steps the SAME direction, never lighter. */
.pivot-grid tbody tr:hover .pivot-grid__total-cell {
  background: color-mix(in srgb, var(--kdl-brand-navy) 14%, transparent);
}

/* Column-total footer row — pinned to the bottom of the scroll viewport, solid
   navy fill so it anchors the band. */
.pivot-grid__total-row th,
.pivot-grid__total-row td {
  position: sticky;
  bottom: 0;
  z-index: 2;
  border-top: 2px solid var(--kdl-brand-navy);
  border-bottom: none;
  background: var(--pivot-total-fill);
  font-weight: 700;
  color: #ffffff;
}

/* The footer's leading "Total" cell is bottom- AND left-pinned (sits in the
   frozen first column), so it needs the combined stacking of both. It keeps the
   solid navy fill, so its label reverses to white too. */
.pivot-grid__total-row .pivot-grid__total-corner {
  left: 0;
  z-index: 3;
  padding: 0 14px;
  text-align: left;
  font-size: 11px;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: #ffffff;
  background: var(--pivot-total-fill);
  border-right: 1px solid var(--kdl-brand-navy);
}

/* Grand total — the band's corner; solid navy, divider continues the frame. */
.pivot-grid__grand-total {
  border-left: 2px solid var(--kdl-brand-navy);
  background: var(--pivot-total-fill);
}

/* Negative figures inside the solid-navy footer/grand-total need a light red
   that reads on navy (the #dc2626 data-cell red is too dark on the fill). */
.pivot-grid__total-row .pivot-grid__cell--neg,
.pivot-grid__grand-total.pivot-grid__cell--neg {
  color: #fca5a5;
}

/* ════════════════════════════════════════════════════════════════════════════
   Footer — size badge, collapse-all, Show MDX
   ═══════════════════════════════════════════════════════════════════════════ */
.pivot-footer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
}

.pivot-footer__size {
  padding: 2px 8px;
  border: 1px solid var(--kdl-border);
  border-radius: 999px;
  background: var(--kdl-card-bg);
  font-size: 11px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.02em;
  color: var(--kdl-text-secondary);
  white-space: nowrap;
}

.pivot-footer__reset {
  padding: 4px 10px;
  border: 1px solid var(--kdl-border);
  border-radius: 6px;
  background: var(--kdl-card-bg);
  color: var(--kdl-text-secondary);
  font-family: inherit;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: border-color var(--duration-short, 150ms) var(--ease-standard, cubic-bezier(0.2, 0, 0, 1)),
              color var(--duration-short, 150ms) var(--ease-standard, cubic-bezier(0.2, 0, 0, 1));
}

.pivot-footer__reset:hover {
  border-color: var(--kdl-text-muted);
  color: var(--kdl-text-primary);
}

@media (prefers-reduced-motion: reduce) {
  .pivot-footer__reset {
    transition: none;
  }
}

.pivot-footer__spacer {
  flex: 1 1 0;
}

/* ── Show-MDX disclosure ──────────────────────────────────────────────────── */
.pivot-mdx__toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 2px 6px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--kdl-text-muted);
  font-family: inherit;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  cursor: pointer;
}

.pivot-mdx__toggle:hover {
  color: var(--kdl-text-primary);
}

.pivot-mdx__toggle:focus-visible {
  outline: 2px solid var(--kdl-accent);
  outline-offset: 1px;
}

.pivot-mdx__chevron {
  flex: 0 0 auto;
  color: var(--kdl-text-hint);
  transition: transform var(--duration-short, 150ms) var(--ease-standard, cubic-bezier(0.2, 0, 0, 1));
}

.pivot-mdx__chevron--open {
  transform: rotate(90deg);
}

@media (prefers-reduced-motion: reduce) {
  .pivot-mdx__chevron {
    transition: none;
  }
}

.pivot-mdx__code {
  margin: 0;
  padding: 10px 12px;
  max-height: 200px;
  overflow: auto;
  border: 1px solid var(--kdl-border-subtle);
  border-radius: 6px;
  background: var(--kdl-page-bg);
  color: var(--kdl-text-secondary);
  font-family: var(--kdl-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: 12px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}

/* ── Responsive ───────────────────────────────────────────────────────────── */
@media (max-width: 860px) {
  .pivot-toolbar__actions {
    margin-left: 0;
  }

  .pivot-grid-wrap {
    max-height: 60vh;
  }
}
</style>
