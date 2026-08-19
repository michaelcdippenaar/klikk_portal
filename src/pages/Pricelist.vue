<template>
  <AppPage>
    <PageHeader
      title="Price List"
      subtitle="Klikk event-gear rate card — ex VAT, ZAR. Prices are effective-dated; changes never touch Xero."
    >
      <template #actions>
        <button class="btn btn-ghost btn-sm" :disabled="loading" @click="load">
          <!-- Lucide refresh-cw -->
          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="mr-1"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
          Refresh
        </button>
        <button class="btn btn-ghost btn-sm" :disabled="exporting" @click="exportCsv">
          <!-- Lucide download -->
          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="mr-1"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          {{ exporting ? 'Exporting…' : 'Export CSV' }}
        </button>
      </template>
    </PageHeader>

    <KAlert
      v-if="error"
      :key="`err-${error}`"
      variant="error"
      :title="error"
      class="mb-4"
      dismissible
    />

    <KAlert
      v-if="notice"
      :key="`ok-${notice}`"
      variant="success"
      :body="notice"
      class="mb-4"
      dismissible
    />

    <KTabs
      v-model="activeTab"
      :tabs="TABS"
      aria-label="Price list sections"
      class="mb-4"
    />

    <!-- ══════════════════════════════ TAB: items ══════════════════════════ -->
    <template v-if="activeTab === 'items'">
      <FilterBar class="mb-3">
        <KSelect
          v-model="categoryFilter"
          label="Category"
          :options="categoryOptions"
          class="flex-1 min-w-48"
        />
        <KInput
          v-model="search"
          label="Search"
          placeholder="Code, name, description…"
          clearable
          :debounce="200"
          class="flex-1 min-w-56"
        />
        <KSelect
          v-model="customerFilter"
          label="Customer"
          :options="customerOptions"
          class="flex-1 min-w-56"
        />
        <div class="pl-filter-toggle">
          <KCheckbox v-model="activeOnly" label="Active only" />
        </div>
      </FilterBar>

      <div class="pl-count-row mb-2">
        <span class="text-sm text-muted">
          Showing {{ items.length }} of {{ totalCount }} items
        </span>
        <KBadge :label="`Effective ${effectiveDate}`" tone="accent" size="sm" />
        <KBadge
          v-if="selectedCustomerName"
          :label="`Trade: ${selectedCustomerName}`"
          tone="default"
          size="sm"
        />
      </div>

      <SectionCard>
        <EmptyState
          v-if="!loading && items.length === 0"
          title="No items match"
          body="Clear the category, search or customer filter — or untick “Active only” — to see the full rate card."
        />
        <KTable
          v-else
          :columns="itemColumns"
          :data="items"
          :loading="loading"
          dense
          pagination="client"
          :pageSize="25"
          :pageSizeOptions="[25, 50, 100]"
        >
          <template #cell-code="{ value }">
            <code class="pl-code">{{ value }}</code>
          </template>

          <template #cell-qty_owned="{ value }">
            <span :class="value == null ? 'text-muted' : ''">{{ value ?? '—' }}</span>
          </template>

          <template #cell-current_price="{ value }">
            <span class="pl-money" :class="value == null ? 'text-muted' : ''">{{ formatZar(value) }}</span>
          </template>

          <template #cell-customer_price="{ value, row }">
            <span class="pl-money" :class="value == null ? 'text-muted' : ''">{{ formatZar(value) }}</span>
            <StatusPill
              v-if="value != null && row.customer_price_type && row.customer_price_type !== 'LIST'"
              :tone="priceTypeTone(row.customer_price_type)"
              :label="row.customer_price_type"
              size="sm"
              class="ml-1"
            />
          </template>

          <template #cell-last_changed="{ value }">
            <span :class="value ? '' : 'text-muted'">{{ formatDate(value) }}</span>
          </template>

          <template #cell-actions="{ row }">
            <div class="pl-row-actions">
              <button class="btn btn-ghost btn-xs" @click.stop="openHistory(row)">History</button>
              <button class="btn btn-ghost btn-xs" @click.stop="openSetPrice(row)">Set price</button>
            </div>
          </template>
        </KTable>
      </SectionCard>
    </template>

    <!-- ══════════════════════════════ TAB: quote ══════════════════════════ -->
    <template v-else>
      <SectionCard
        title="Quote builder"
        description="Prices the lines against the rate card at the chosen date. Nothing is saved."
      >
        <div class="pl-quote-controls">
          <KSelect
            v-model="quote.customer"
            label="Customer"
            :options="customerOptions"
            class="pl-quote-control pl-quote-control--wide"
          />
          <KInput
            v-model="quote.date"
            label="Date"
            type="date"
            class="pl-quote-control"
          />
          <KInput
            v-model="quote.discount_pct"
            label="Discount %"
            type="number"
            class="pl-quote-control"
          />
          <KInput
            v-model="quote.vat_rate"
            label="VAT rate (0.15 = 15%)"
            type="number"
            class="pl-quote-control"
          />
        </div>

        <div class="pl-lines">
          <div class="pl-lines__head">
            <span class="pl-lines__heading">Lines</span>
            <button class="btn btn-ghost btn-sm" type="button" @click="addLine">
              <!-- Lucide plus -->
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="mr-1"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Add line
            </button>
          </div>

          <div
            v-for="(line, idx) in quote.lines"
            :key="line.key"
            class="pl-line"
          >
            <KSelect
              v-model="line.code"
              :label="idx === 0 ? 'Item' : null"
              :options="itemOptions"
              placeholder="Choose an item…"
              :aria-label="idx === 0 ? null : `Item for line ${idx + 1}`"
              class="pl-line__item"
            />
            <KInput
              v-model="line.qty"
              :label="idx === 0 ? 'Qty' : null"
              type="number"
              class="pl-line__num"
            />
            <KInput
              v-model="line.days"
              :label="idx === 0 ? 'Days' : null"
              type="number"
              class="pl-line__num"
            />
            <button
              class="btn btn-ghost btn-xs pl-line__remove"
              :class="{ 'pl-line__remove--labelled': idx === 0 }"
              type="button"
              :disabled="quote.lines.length === 1"
              :aria-label="`Remove line ${idx + 1}`"
              @click="removeLine(idx)"
            >
              Remove
            </button>
          </div>
        </div>

        <div class="pl-quote-actions">
          <button
            class="btn btn-primary btn-sm"
            type="button"
            :disabled="quoting || !hasPriceableLines"
            @click="priceIt"
          >
            {{ quoting ? 'Pricing…' : 'Price it' }}
          </button>
          <span v-if="!hasPriceableLines" class="text-micro">Pick at least one item to price.</span>
        </div>

        <KAlert
          v-if="quoteError"
          :key="`qerr-${quoteError}`"
          variant="error"
          :title="quoteError"
          class="mt-4"
          dismissible
        />

        <div v-if="quoteResult" class="pl-result">
          <KAlert
            v-if="quoteResult.warnings && quoteResult.warnings.length"
            variant="warning"
            title="Warnings"
            class="mb-3"
          >
            <ul class="pl-warnings">
              <li v-for="(w, i) in quoteResult.warnings" :key="i">{{ w }}</li>
            </ul>
          </KAlert>

          <div class="pl-result__head">
            <div class="pl-result__meta">
              <span>
                {{ quoteResult.customer_name || 'List price (no customer)' }}
                · {{ formatDate(quoteResult.date) }}
              </span>
              <span class="text-micro">
                VAT {{ formatPct(quoteResult.vat_rate) }}% · discount {{ formatPct(Number(quoteResult.discount_pct) / 100) }}%
              </span>
            </div>
            <div class="pl-result__actions">
              <button class="btn btn-ghost btn-sm" type="button" @click="copyQuote">
                {{ copied ? 'Copied' : 'Copy' }}
              </button>
              <button class="btn btn-ghost btn-sm" type="button" @click="downloadQuoteCsv">
                Download CSV
              </button>
            </div>
          </div>

          <KTable
            :columns="quoteColumns"
            :data="quoteResult.lines"
            dense
            pagination="none"
          >
            <template #cell-code="{ value }">
              <code class="pl-code">{{ value }}</code>
            </template>
            <template #cell-name="{ value, row }">
              <span>{{ value }}</span>
              <span v-if="row.priced === false" class="pl-unpriced">not priced</span>
            </template>
            <template #cell-unit_price="{ value, row }">
              <span class="pl-money" :class="row.priced === false ? 'text-muted' : ''">{{ formatZar(value) }}</span>
            </template>
            <template #cell-line_total="{ value, row }">
              <span class="pl-money" :class="row.priced === false ? 'text-muted' : ''">{{ formatZar(value) }}</span>
            </template>
          </KTable>

          <dl class="pl-totals">
            <div class="pl-totals__row">
              <dt>Subtotal</dt>
              <dd class="pl-money">{{ formatZar(quoteResult.subtotal) }}</dd>
            </div>
            <div class="pl-totals__row">
              <dt>Discount</dt>
              <dd class="pl-money">{{ formatZar(quoteResult.discount) }}</dd>
            </div>
            <div class="pl-totals__row">
              <dt>Ex VAT</dt>
              <dd class="pl-money">{{ formatZar(quoteResult.ex_vat) }}</dd>
            </div>
            <div class="pl-totals__row">
              <dt>VAT</dt>
              <dd class="pl-money">{{ formatZar(quoteResult.vat) }}</dd>
            </div>
            <div class="pl-totals__row pl-totals__row--grand">
              <dt>Incl VAT</dt>
              <dd class="pl-money">{{ formatZar(quoteResult.incl_vat) }}</dd>
            </div>
          </dl>
        </div>

        <EmptyState
          v-else-if="!quoting"
          title="No quote yet"
          body="Add lines, pick a customer and date, then press “Price it”."
        />
      </SectionCard>
    </template>

    <!-- ══════════════════════════════ History dialog ══════════════════════ -->
    <KDialog
      v-model="historyOpen"
      :title="historyItem ? `${historyItem.code} — ${historyItem.name}` : ''"
      description="Price history, newest first"
      size="lg"
    >
      <KAlert
        v-if="historyError"
        variant="error"
        :title="historyError"
        class="mb-3"
      />
      <div v-if="historyLoading" class="pl-dialog-loading">
        <KSpinner size="md" tone="accent" />
      </div>
      <EmptyState
        v-else-if="!historyError && history.length === 0"
        title="No price rows"
        body="This item has no price history yet — use “Set price” to add one."
      />
      <KTable
        v-else-if="!historyError"
        :columns="historyColumns"
        :data="history"
        dense
        pagination="none"
      >
        <template #cell-valid_from="{ value, row }">
          <span>{{ formatDate(value) }}</span>
          <span class="text-muted"> → </span>
          <span :class="row.valid_to ? '' : 'pl-current'">{{ row.valid_to ? formatDate(row.valid_to) : 'current' }}</span>
        </template>
        <template #cell-price="{ value }">
          <span class="pl-money">{{ formatZar(value) }}</span>
        </template>
        <template #cell-price_type="{ value }">
          <StatusPill :tone="priceTypeTone(value)" :label="String(value || 'LIST')" size="sm" />
        </template>
        <template #cell-customer_name="{ value }">
          <span :class="value ? '' : 'text-muted'">{{ value || 'Everyone' }}</span>
        </template>
        <template #cell-set_by="{ value }">
          <span :class="value ? '' : 'text-muted'">{{ value || '—' }}</span>
        </template>
        <template #cell-note="{ value }">
          <span :class="value ? '' : 'text-muted'">{{ value || '—' }}</span>
        </template>
      </KTable>
    </KDialog>

    <!-- ══════════════════════════════ Set-price dialog ════════════════════ -->
    <KDialog
      v-model="setOpen"
      :title="setItem ? `Set price — ${setItem.code}` : 'Set price'"
      :description="setItem ? `${setItem.name} · current list ${formatZar(setItem.current_price)}` : ''"
      size="md"
    >
      <form class="pl-form" @submit.prevent="submitPrice">
        <KAlert
          v-if="setError"
          :key="`serr-${setError}`"
          variant="error"
          :title="setError"
          class="mb-2"
        />
        <!--
          type="text" + inputmode="decimal", NOT type="number": KInput coerces a number field
          with Number(), and Number('') === 0, so clearing the field would emit 0 and let an
          empty box be saved as R 0.00 on the rate card. Keeping it text preserves '' so
          setFormValid can refuse it. (Fixing the coercion in KInput itself would change every
          numeric field in the console — out of scope here.)
        -->
        <KInput
          v-model="setForm.price"
          label="Price (ex VAT, ZAR)"
          type="text"
          inputmode="decimal"
          prefix="R"
          placeholder="0.00"
        />
        <KInput
          v-model="setForm.valid_from"
          label="Valid from"
          type="date"
        />
        <KSelect
          v-model="setForm.price_type"
          label="Price type"
          :options="PRICE_TYPE_OPTIONS"
        />
        <KSelect
          v-model="setForm.customer"
          label="Customer"
          :options="customerOptions"
        />
        <KAlert
          v-if="setForm.price_type !== 'LIST' && setForm.customer === NO_CUSTOMER"
          variant="warning"
          :body="`A ${setForm.price_type} price with no customer applies to everyone. Pick a customer unless that is intended.`"
        />
        <KInput
          v-model="setForm.note"
          label="Note"
          placeholder="Why this price changed (optional)"
        />
      </form>
      <template #footer>
        <button class="btn btn-ghost btn-sm" type="button" :disabled="setSubmitting" @click="setOpen = false">
          Cancel
        </button>
        <button
          class="btn btn-primary btn-sm"
          type="button"
          :disabled="setSubmitting || !setFormValid"
          @click="submitPrice"
        >
          {{ setSubmitting ? 'Saving…' : 'Save price' }}
        </button>
      </template>
    </KDialog>
  </AppPage>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  getPriceListItems,
  getPriceHistory,
  setPrice,
  buildQuote,
  downloadExport,
} from '../api/pricelist';
import AppPage from '../components/shell/AppPage.vue';
import PageHeader from '../components/klikk/PageHeader.vue';
import SectionCard from '../components/klikk/SectionCard.vue';
import EmptyState from '../components/klikk/EmptyState.vue';
import FilterBar from '../components/klikk/FilterBar.vue';
import KAlert from '../components/klikk/KAlert.vue';
import KBadge from '../components/klikk/KBadge.vue';
import KCheckbox from '../components/klikk/KCheckbox.vue';
import KDialog from '../components/klikk/KDialog.vue';
import KInput from '../components/klikk/KInput.vue';
import KSelect from '../components/klikk/KSelect.vue';
import KSpinner from '../components/klikk/KSpinner.vue';
import KTable from '../components/klikk/KTable.vue';
import KTabs from '../components/klikk/KTabs.vue';
import StatusPill from '../components/klikk/StatusPill.vue';

// ── Constants ────────────────────────────────────────────────────────────────

const ALL = '__all__';
const NO_CUSTOMER = '__none__';

/**
 * Xero contacts_id for AURRAS GROUP (PTY) LTD — the only trade customer with
 * its own price list in v1. A proper customer picker (search over Xero
 * contacts) is a follow-up; until then this is the single option.
 */
const AURRAS_ID = '1f4a93c8-b49a-46da-a7fc-25bafd5fb2b9';

const CUSTOMER_OPTIONS = [
  { value: NO_CUSTOMER, label: 'List price (no customer)' },
  { value: AURRAS_ID, label: 'AURRAS GROUP (PTY) LTD' },
];

const PRICE_TYPE_OPTIONS = [
  { value: 'LIST', label: 'LIST' },
  { value: 'TRADE', label: 'TRADE' },
  { value: 'SPECIAL', label: 'SPECIAL' },
];

const VALID_TABS = ['items', 'quote'];
const TABS = [
  { name: 'items', label: 'Rate card' },
  { name: 'quote', label: 'Quote builder' },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function normaliseTab(slug) {
  return VALID_TABS.includes(slug) ? slug : 'items';
}

function todayIso() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Single money formatter — used everywhere money is shown.
 *
 * en-ZA to match the rest of the console (FinancialInvestmentStrategy, DividendForecast),
 * so amounts read "R 1 400,00" — SA convention, space group, comma decimal.
 *
 * The isFinite guard is load-bearing: the API sends money as strings, and a non-numeric one
 * (a legacy row, a hand-edited value, 'TBC') would otherwise render as the literal "R NaN"
 * on the rate card. Anything unparseable degrades to the em-dash placeholder instead.
 */
function formatZar(value) {
  if (value == null || value === '') return '—';
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return 'R ' + n.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Percentage for display. `Number('0.14') * 100` is 14.000000000000002 in IEEE-754 — that tail
 * was rendering verbatim next to the quote totals. Round to at most 2 decimals.
 */
function formatPct(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '0';
  return String(Math.round(n * 1e4) / 1e2);
}

function formatDate(value) {
  if (!value) return '—';
  return String(value).slice(0, 10);
}

function priceTypeTone(type) {
  const t = String(type || '').toUpperCase();
  if (t === 'TRADE') return 'info';
  if (t === 'SPECIAL') return 'warning';
  return 'neutral';
}

function apiErrorMessage(err, fallback) {
  return err?.response?.data?.detail || err?.response?.data?.error || err?.message || fallback;
}

function customerOrNull(value) {
  return value && value !== NO_CUSTOMER ? value : null;
}

function customerLabel(value) {
  const found = CUSTOMER_OPTIONS.find((o) => o.value === value);
  return found && value !== NO_CUSTOMER ? found.label : null;
}

function csvEscape(v) {
  const s = v == null ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// ── Tabs (?tab= synced) ───────────────────────────────────────────────────────

// KTabs (urlSync, default on) writes ?tab= via router.replace on click and
// emits the normalised slug; we mirror the whitelist here so a stale / bogus
// ?tab= in the URL (or a back/forward navigation) always lands on a valid tab.
const route = useRoute();
const router = useRouter();
const activeTab = ref(normaliseTab(route.query.tab));

watch(
  () => route.query.tab,
  (slug) => {
    const n = normaliseTab(slug);
    if (n !== activeTab.value) activeTab.value = n;
    if (slug && slug !== n) {
      // Bogus ?tab= — rewrite to the normalised value without stacking history.
      router.replace({ query: { ...route.query, tab: n } });
    }
  },
  // immediate: a bogus ?tab= present in the URL at FIRST load (a stale bookmark, a hand-typed
  // link) must be normalised too — without this the page shows the right tab but leaves
  // ?tab=bogus in the address bar, which then gets copied and shared.
  { immediate: true },
);

// ── Items tab state ───────────────────────────────────────────────────────────

const items = ref([]);
const totalCount = ref(0);
const categories = ref([]);
const loading = ref(false);
const error = ref(null);
const notice = ref(null);
const exporting = ref(false);

const categoryFilter = ref(ALL);
const search = ref('');
const customerFilter = ref(NO_CUSTOMER);
const activeOnly = ref(true);

const effectiveDate = computed(() => todayIso());
const selectedCustomerName = computed(() => customerLabel(customerFilter.value));
const customerOptions = CUSTOMER_OPTIONS;

const categoryOptions = computed(() => [
  { value: ALL, label: 'All categories' },
  ...categories.value.map((c) => ({ value: c, label: c })),
]);

const itemColumns = computed(() => {
  const cols = [
    { accessorKey: 'code', header: 'Code', enableSorting: true },
    { accessorKey: 'name', header: 'Name', enableSorting: true },
    { accessorKey: 'category', header: 'Category', enableSorting: true },
    { accessorKey: 'unit', header: 'Unit', enableSorting: true },
    { accessorKey: 'qty_owned', header: 'Qty', enableSorting: true, meta: { align: 'right', width: '70px' } },
    { accessorKey: 'current_price', header: 'List price', enableSorting: true, meta: { align: 'right' } },
  ];
  if (customerOrNull(customerFilter.value)) {
    cols.push({
      accessorKey: 'customer_price',
      header: 'Trade (Aurras)',
      enableSorting: true,
      meta: { align: 'right' },
    });
  }
  cols.push(
    { accessorKey: 'last_changed', header: 'Last changed', enableSorting: true },
    { id: 'actions', header: '', enableSorting: false, meta: { width: '170px' } },
  );
  return cols;
});

function listParams() {
  return {
    category: categoryFilter.value === ALL ? undefined : categoryFilter.value,
    active: activeOnly.value ? 'true' : undefined,
    q: search.value.trim() || undefined,
    customer: customerOrNull(customerFilter.value) || undefined,
  };
}

async function load() {
  loading.value = true;
  error.value = null;
  try {
    const data = await getPriceListItems(listParams());
    items.value = Array.isArray(data?.items) ? data.items : [];
    totalCount.value = Number.isFinite(data?.count) ? data.count : items.value.length;
    if (Array.isArray(data?.categories) && data.categories.length) {
      categories.value = [...data.categories].sort();
    } else if (!categories.value.length) {
      categories.value = [...new Set(items.value.map((i) => i.category).filter(Boolean))].sort();
    }
  } catch (err) {
    items.value = [];
    totalCount.value = 0;
    error.value = apiErrorMessage(err, 'Could not load the price list.');
    console.error(err);
  } finally {
    loading.value = false;
  }
}

watch([categoryFilter, search, customerFilter, activeOnly], load);

async function exportCsv() {
  exporting.value = true;
  error.value = null;
  try {
    await downloadExport({
      customer: customerOrNull(customerFilter.value) || undefined,
      active: activeOnly.value ? 'true' : undefined,
    });
  } catch (err) {
    error.value = apiErrorMessage(err, 'CSV export failed.');
    console.error(err);
  } finally {
    exporting.value = false;
  }
}

// ── Catalogue for the quote-line picker (all active items, unfiltered) ───────

const catalog = ref([]);
const catalogError = ref(null);

async function loadCatalog() {
  catalogError.value = null;
  try {
    const data = await getPriceListItems({ active: 'true' });
    catalog.value = Array.isArray(data?.items) ? data.items : [];
  } catch (err) {
    catalogError.value = apiErrorMessage(err, 'Could not load the item catalogue.');
    console.error(err);
  }
}

const itemOptions = computed(() => {
  const source = catalog.value.length ? catalog.value : items.value;
  return source.map((i) => ({ value: i.code, label: `${i.code} — ${i.name}` }));
});

// ── History dialog ────────────────────────────────────────────────────────────

const historyOpen = ref(false);
const historyItem = ref(null);
const history = ref([]);
const historyLoading = ref(false);
const historyError = ref(null);

const historyColumns = [
  { accessorKey: 'valid_from', header: 'Valid', enableSorting: false },
  { accessorKey: 'price', header: 'Price', enableSorting: false, meta: { align: 'right' } },
  { accessorKey: 'price_type', header: 'Type', enableSorting: false },
  { accessorKey: 'customer_name', header: 'Customer', enableSorting: false },
  { accessorKey: 'set_by', header: 'Set by', enableSorting: false },
  { accessorKey: 'note', header: 'Note', enableSorting: false },
];

async function openHistory(row) {
  historyItem.value = row;
  history.value = [];
  historyError.value = null;
  historyOpen.value = true;
  historyLoading.value = true;
  try {
    const data = await getPriceHistory(row.code);
    history.value = Array.isArray(data?.prices) ? data.prices : [];
  } catch (err) {
    historyError.value = apiErrorMessage(err, 'Could not load price history.');
    console.error(err);
  } finally {
    historyLoading.value = false;
  }
}

// ── Set-price dialog ──────────────────────────────────────────────────────────

const setOpen = ref(false);
const setItem = ref(null);
const setSubmitting = ref(false);
const setError = ref(null);
const setForm = reactive({
  price: '',
  valid_from: todayIso(),
  price_type: 'LIST',
  customer: NO_CUSTOMER,
  note: '',
});

const setFormValid = computed(() => {
  // String(...).trim() so a whitespace-only box is refused too — Number(' ') is 0, which would
  // otherwise sail through as a valid R 0.00.
  const raw = String(setForm.price ?? '').trim();
  const p = Number(raw);
  return raw !== '' && Number.isFinite(p) && p >= 0 && !!setForm.valid_from;
});

function openSetPrice(row) {
  setItem.value = row;
  setError.value = null;
  // Kept as a STRING (the field is type="text"); the API sends 2-dp strings anyway.
  setForm.price = row.current_price != null ? String(row.current_price) : '';
  setForm.valid_from = todayIso();
  setForm.price_type = 'LIST';
  setForm.customer = customerFilter.value;
  setForm.note = '';
  setOpen.value = true;
}

async function submitPrice() {
  if (!setItem.value || setSubmitting.value || !setFormValid.value) return;
  setSubmitting.value = true;
  setError.value = null;
  const code = setItem.value.code;
  try {
    const data = await setPrice(code, {
      price: Number(setForm.price).toFixed(2),
      valid_from: setForm.valid_from,
      price_type: setForm.price_type,
      customer: customerOrNull(setForm.customer),
      note: setForm.note.trim() || undefined,
      set_by: 'mc',
    });
    const saved = data?.price || {};
    let msg = `${code} — ${setForm.price_type} price ${formatZar(saved.price ?? setForm.price)} from ${formatDate(saved.valid_from ?? setForm.valid_from)}.`;
    if (data?.closed_previous) {
      const prev = data.closed_previous;
      msg += ` Closed the previous ${prev.price_type || ''} row (${formatZar(prev.price)}, from ${formatDate(prev.valid_from)}) at valid_to ${formatDate(prev.valid_to)}.`;
    }
    notice.value = msg;
    setOpen.value = false;
    await load();
  } catch (err) {
    setError.value = apiErrorMessage(err, 'Could not save the price.');
    console.error(err);
  } finally {
    setSubmitting.value = false;
  }
}

// ── Quote builder ─────────────────────────────────────────────────────────────

let lineSeq = 0;
function newLine() {
  lineSeq += 1;
  return { key: lineSeq, code: null, qty: 1, days: 1 };
}

const quote = reactive({
  customer: NO_CUSTOMER,
  date: todayIso(),
  discount_pct: 0,
  vat_rate: 0.15,
  lines: [newLine()],
});
const quoting = ref(false);
const quoteError = ref(null);
const quoteResult = ref(null);
const copied = ref(false);
let copiedTimer = null;

const quoteColumns = [
  { accessorKey: 'code', header: 'Code', enableSorting: false },
  { accessorKey: 'name', header: 'Name', enableSorting: false },
  { accessorKey: 'qty', header: 'Qty', enableSorting: false, meta: { align: 'right', width: '70px' } },
  { accessorKey: 'days', header: 'Days', enableSorting: false, meta: { align: 'right', width: '70px' } },
  { accessorKey: 'unit_price', header: 'Unit price', enableSorting: false, meta: { align: 'right' } },
  { accessorKey: 'line_total', header: 'Line total', enableSorting: false, meta: { align: 'right' } },
];

const hasPriceableLines = computed(() => quote.lines.some((l) => !!l.code));

function addLine() {
  quote.lines.push(newLine());
}

function removeLine(idx) {
  if (quote.lines.length === 1) return;
  quote.lines.splice(idx, 1);
}

async function priceIt() {
  if (quoting.value || !hasPriceableLines.value) return;
  quoting.value = true;
  quoteError.value = null;
  try {
    const body = {
      lines: quote.lines
        .filter((l) => !!l.code)
        .map((l) => ({ code: l.code, qty: Number(l.qty) || 0, days: Number(l.days) || 0 })),
      customer: customerOrNull(quote.customer),
      date: quote.date || undefined,
      discount_pct: Number(quote.discount_pct) || 0,
      vat_rate: Number(quote.vat_rate),
    };
    const data = await buildQuote(body);
    quoteResult.value = { ...data, lines: Array.isArray(data?.lines) ? data.lines : [], warnings: data?.warnings || [] };
  } catch (err) {
    quoteError.value = apiErrorMessage(err, 'Could not price the quote.');
    console.error(err);
  } finally {
    quoting.value = false;
  }
}

function quoteAsText() {
  const q = quoteResult.value;
  if (!q) return '';
  const out = [];
  out.push(`Klikk quote — ${q.customer_name || 'List price'} — ${formatDate(q.date)}`);
  out.push('All amounts ZAR, ex VAT unless stated.');
  out.push('');
  for (const l of q.lines) {
    const flag = l.priced === false ? ' (not priced)' : '';
    out.push(`${l.code}  ${l.name}  x${l.qty} x ${l.days}d  @ ${formatZar(l.unit_price)}  = ${formatZar(l.line_total)}${flag}`);
  }
  out.push('');
  out.push(`Subtotal  ${formatZar(q.subtotal)}`);
  out.push(`Discount  ${formatZar(q.discount)}`);
  out.push(`Ex VAT    ${formatZar(q.ex_vat)}`);
  out.push(`VAT       ${formatZar(q.vat)}`);
  out.push(`Incl VAT  ${formatZar(q.incl_vat)}`);
  if (q.warnings && q.warnings.length) {
    out.push('');
    out.push('Warnings:');
    for (const w of q.warnings) out.push(`- ${w}`);
  }
  return out.join('\n');
}

function flashCopied() {
  copied.value = true;
  if (copiedTimer) clearTimeout(copiedTimer);
  copiedTimer = setTimeout(() => { copied.value = false; }, 1800);
}

async function copyQuote() {
  const text = quoteAsText();
  if (!text) return;
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      // Fallback: offscreen textarea + execCommand. Positioning set via the JS
      // style API (runtime-only element, never rendered from the template).
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.setAttribute('aria-hidden', 'true');
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    flashCopied();
  } catch (err) {
    quoteError.value = 'Could not copy the quote to the clipboard.';
    console.error(err);
  }
}

function downloadQuoteCsv() {
  const q = quoteResult.value;
  if (!q) return;
  const rows = [
    ['code', 'name', 'unit', 'category', 'qty', 'days', 'unit_price', 'price_type', 'priced', 'line_total', 'valid_from', 'note'],
    ...q.lines.map((l) => [
      l.code, l.name, l.unit, l.category, l.qty, l.days, l.unit_price, l.price_type,
      l.priced === false ? 'no' : 'yes', l.line_total, l.valid_from, l.note,
    ]),
    [],
    ['subtotal', q.subtotal],
    ['discount', q.discount],
    ['ex_vat', q.ex_vat],
    ['vat', q.vat],
    ['incl_vat', q.incl_vat],
  ];
  const csv = rows.map((r) => r.map(csvEscape).join(',')).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `klikk_quote_${formatDate(q.date) || todayIso()}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

onMounted(() => {
  load();
  loadCatalog();
});
</script>

<style scoped>
.pl-count-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.pl-filter-toggle {
  display: flex;
  align-items: flex-end;
  min-height: 40px;
  padding-bottom: 6px;
}

.pl-code {
  font-family: var(--kdl-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: 12px;
  font-weight: 600;
}

.pl-money {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.pl-row-actions {
  display: flex;
  justify-content: flex-end;
  gap: 4px;
}

.pl-current {
  color: var(--kdl-accent);
  font-weight: 600;
}

.pl-dialog-loading {
  display: flex;
  justify-content: center;
  padding: 32px 0;
}

.pl-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* ── Quote builder ─────────────────────────────────────────────────────── */

.pl-quote-controls {
  display: flex;
  flex-wrap: wrap;
  gap: 12px 16px;
  margin-bottom: 16px;
}

.pl-quote-control {
  flex: 1 1 140px;
  min-width: 140px;
}

.pl-quote-control--wide {
  flex-basis: 240px;
  min-width: 240px;
}

.pl-lines {
  border-top: 1px solid var(--kdl-border-subtle, var(--kdl-border));
  padding-top: 12px;
}

.pl-lines__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.pl-lines__heading {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--kdl-text-secondary);
}

.pl-line {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 8px 12px;
  margin-bottom: 8px;
}

.pl-line__item {
  flex: 1 1 280px;
  min-width: 240px;
}

.pl-line__num {
  flex: 0 0 96px;
}

.pl-line__remove {
  margin-bottom: 4px;
}

.pl-quote-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--kdl-border-subtle, var(--kdl-border));
}

.pl-result {
  margin-top: 16px;
}

.pl-result__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px 16px;
  margin-bottom: 8px;
}

.pl-result__meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 13px;
}

.pl-result__actions {
  display: flex;
  gap: 4px;
}

.pl-warnings {
  margin: 0;
  padding-left: 18px;
  font-size: 13px;
  line-height: 1.5;
}

.pl-unpriced {
  margin-left: 6px;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--kdl-text-hint);
}

.pl-totals {
  margin: 12px 0 0 auto;
  max-width: 320px;
  font-size: 13px;
}

.pl-totals__row {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding: 4px 0;
}

.pl-totals__row dt {
  color: var(--kdl-text-secondary);
}

.pl-totals__row--grand {
  margin-top: 4px;
  padding-top: 8px;
  border-top: 1px solid var(--kdl-border);
  font-weight: 600;
  color: var(--kdl-text-primary);
}
</style>
