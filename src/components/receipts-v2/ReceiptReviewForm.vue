<template>
  <form class="rrf" @submit.prevent="editable && $emit('save')">
    <div class="rrf__intro">
      <div>
        <h3 class="rrf__title">Receipt information</h3>
        <p class="rrf__help">
          {{ editable ? 'Correct anything the receipt scan missed.' : 'Review the AI extraction, then edit only if something is incorrect.' }}
        </p>
      </div>
      <div class="rrf__header-actions">
        <StatusPill
          :tone="errorCount ? 'warning' : 'success'"
          :label="errorCount ? `${errorCount} required field${errorCount === 1 ? '' : 's'} missing` : 'Ready to confirm'"
          size="sm"
        />
        <button
          v-if="!editable"
          type="button"
          class="btn btn-ghost btn-sm"
          @click="$emit('edit')"
        >
          Edit information
        </button>
        <button
          v-else
          type="button"
          class="btn btn-ghost btn-sm"
          @click="$emit('cancel')"
        >
          Cancel
        </button>
      </div>
    </div>

    <div class="rrf__grid">
      <label class="rrf__field rrf__field--wide">
        <span>Supplier *</span>
        <input
          :value="modelValue.supplier"
          type="text"
          autocomplete="off"
          :readonly="!editable"
          :aria-invalid="!!errors.supplier"
          @input="set('supplier', $event.target.value)"
        />
        <small v-if="errors.supplier" class="rrf__error">{{ errors.supplier }}</small>
      </label>

      <label class="rrf__field">
        <span>Invoice / receipt number</span>
        <input
          :value="modelValue.invoice_number"
          type="text"
          autocomplete="off"
          :readonly="!editable"
          @input="set('invoice_number', $event.target.value)"
        />
      </label>

      <label class="rrf__field">
        <span>Receipt date *</span>
        <input
          :value="modelValue.receipt_date"
          type="date"
          :readonly="!editable"
          :aria-invalid="!!errors.receipt_date"
          @input="set('receipt_date', $event.target.value)"
        />
        <small v-if="errors.receipt_date" class="rrf__error">{{ errors.receipt_date }}</small>
      </label>

      <label class="rrf__field">
        <span>Due date</span>
        <input
          :value="modelValue.due_date"
          type="date"
          :readonly="!editable"
          @input="set('due_date', $event.target.value)"
        />
      </label>

      <label class="rrf__field">
        <span>Payment method</span>
        <input
          :value="modelValue.payment_method"
          type="text"
          autocomplete="off"
          :readonly="!editable"
          @input="set('payment_method', $event.target.value)"
        />
      </label>

      <label class="rrf__field rrf__field--wide">
        <span>Description</span>
        <textarea
          :value="modelValue.description"
          rows="2"
          :readonly="!editable"
          @input="set('description', $event.target.value)"
        />
      </label>

      <label class="rrf__field">
        <span>Category</span>
        <input
          :value="modelValue.category"
          type="text"
          autocomplete="off"
          :readonly="!editable"
          @input="set('category', $event.target.value)"
        />
      </label>

      <label class="rrf__field">
        <span>Xero account code</span>
        <input
          :value="modelValue.account_code"
          type="text"
          autocomplete="off"
          :readonly="!editable"
          @input="set('account_code', $event.target.value)"
        />
      </label>

      <label class="rrf__field rrf__field--wide">
        <span>Xero account name</span>
        <input
          :value="modelValue.account_name"
          type="text"
          autocomplete="off"
          :readonly="!editable"
          @input="set('account_name', $event.target.value)"
        />
      </label>

      <label class="rrf__field">
        <span>Subtotal</span>
        <input
          :value="modelValue.subtotal"
          type="number"
          min="0"
          step="0.01"
          inputmode="decimal"
          :readonly="!editable"
          :aria-invalid="!!errors.subtotal"
          @input="set('subtotal', $event.target.value)"
        />
        <small v-if="errors.subtotal" class="rrf__error">{{ errors.subtotal }}</small>
      </label>

      <label class="rrf__field">
        <span>VAT</span>
        <input
          :value="modelValue.vat"
          type="number"
          min="0"
          step="0.01"
          inputmode="decimal"
          :readonly="!editable"
          :aria-invalid="!!errors.vat"
          @input="set('vat', $event.target.value)"
        />
        <small v-if="errors.vat" class="rrf__error">{{ errors.vat }}</small>
      </label>

      <label class="rrf__field">
        <span>Total *</span>
        <input
          :value="modelValue.total"
          type="number"
          min="0"
          step="0.01"
          inputmode="decimal"
          :readonly="!editable"
          :aria-invalid="!!errors.total"
          @input="set('total', $event.target.value)"
        />
        <small v-if="errors.total" class="rrf__error">{{ errors.total }}</small>
      </label>

      <label class="rrf__field">
        <span>Tax rate</span>
        <input
          :value="modelValue.tax_rate"
          type="text"
          autocomplete="off"
          placeholder="e.g. 15% VAT"
          :readonly="!editable"
          @input="set('tax_rate', $event.target.value)"
        />
      </label>

      <label class="rrf__field">
        <span>Tracking 1</span>
        <input
          :value="modelValue.tracking_1"
          type="text"
          autocomplete="off"
          :readonly="!editable"
          @input="set('tracking_1', $event.target.value)"
        />
      </label>

      <label class="rrf__field">
        <span>Tracking 2</span>
        <input
          :value="modelValue.tracking_2"
          type="text"
          autocomplete="off"
          :readonly="!editable"
          @input="set('tracking_2', $event.target.value)"
        />
      </label>
    </div>

    <section class="rrf__lines" aria-labelledby="receipt-lines-heading">
      <div class="rrf__lines-heading">
        <div>
          <h4 id="receipt-lines-heading">Line items</h4>
          <p>Add detail now so a future Xero draft bill can be prepared accurately.</p>
        </div>
        <button v-if="editable" type="button" class="btn btn-ghost btn-sm" @click="addLine">Add line</button>
      </div>

      <div v-if="!modelValue.line_items?.length" class="rrf__empty-lines">
        No line items extracted. Add one if the receipt needs item-level coding.
      </div>

      <div
        v-for="(line, index) in modelValue.line_items || []"
        :key="index"
        class="rrf__line"
      >
        <label class="rrf__field rrf__field--line-description">
          <span>Description</span>
          <input
            :value="line.description"
            type="text"
            :readonly="!editable"
            @input="setLine(index, 'description', $event.target.value)"
          />
        </label>
        <label class="rrf__field">
          <span>Amount</span>
          <input
            :value="line.amount"
            type="number"
            min="0"
            step="0.01"
            inputmode="decimal"
            :readonly="!editable"
            @input="setLine(index, 'amount', $event.target.value)"
          />
        </label>
        <label class="rrf__field">
          <span>Account</span>
          <input
            :value="line.account_code"
            type="text"
            :readonly="!editable"
            @input="setLine(index, 'account_code', $event.target.value)"
          />
        </label>
        <label class="rrf__field">
          <span>Tax</span>
          <input
            :value="line.tax_rate"
            type="text"
            :readonly="!editable"
            @input="setLine(index, 'tax_rate', $event.target.value)"
          />
        </label>
        <button
          type="button"
          class="btn btn-ghost btn-xs rrf__remove"
          :aria-label="`Remove line ${index + 1}`"
          v-if="editable"
          @click="removeLine(index)"
        >
          Remove
        </button>
      </div>
    </section>

    <div v-if="editable" class="rrf__actions">
      <p>Correction drafts are saved in this browser only. Xero is not changed.</p>
      <div>
        <button type="button" class="btn btn-ghost btn-sm" @click="$emit('reset')">Reset from AI</button>
        <button type="submit" class="btn btn-primary btn-sm">Save changes</button>
      </div>
    </div>
  </form>
</template>

<script setup>
import { computed } from 'vue';
import StatusPill from '../klikk/StatusPill.vue';
import { validateCorrectionDraft } from '../../utils/receiptsV2';

const props = defineProps({
  modelValue: { type: Object, required: true },
  editable: { type: Boolean, default: false },
});

const emit = defineEmits(['update:modelValue', 'edit', 'cancel', 'save', 'reset']);

const errors = computed(() => validateCorrectionDraft(props.modelValue));
const errorCount = computed(() => Object.keys(errors.value).length);

function set(key, value) {
  if (!props.editable) return;
  emit('update:modelValue', { ...props.modelValue, [key]: value });
}

function setLine(index, key, value) {
  if (!props.editable) return;
  const lines = [...(props.modelValue.line_items || [])];
  lines[index] = { ...lines[index], [key]: value };
  emit('update:modelValue', { ...props.modelValue, line_items: lines });
}

function addLine() {
  if (!props.editable) return;
  const lines = [...(props.modelValue.line_items || [])];
  lines.push({ description: '', amount: '', account_code: '', tax_rate: '' });
  emit('update:modelValue', { ...props.modelValue, line_items: lines });
}

function removeLine(index) {
  if (!props.editable) return;
  const lines = [...(props.modelValue.line_items || [])];
  lines.splice(index, 1);
  emit('update:modelValue', { ...props.modelValue, line_items: lines });
}
</script>

<style scoped>
.rrf { display: flex; flex-direction: column; gap: 18px; container-type: inline-size; }
.rrf__intro,
.rrf__lines-heading,
.rrf__actions { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
.rrf__intro { flex-wrap: wrap; }
.rrf__header-actions { display: flex; align-items: center; justify-content: flex-end; gap: 8px; flex-wrap: wrap; }
.rrf__title,
.rrf__lines h4 { margin: 0; font-size: 14px; color: var(--kdl-text-primary); }
.rrf__help,
.rrf__lines p,
.rrf__actions p { margin: 3px 0 0; font-size: 12px; color: var(--kdl-text-muted); }
.rrf__grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.rrf__field { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.rrf__field--wide { grid-column: 1 / -1; }
.rrf__field > span { font-size: 11px; font-weight: 600; color: var(--kdl-text-secondary); }
.rrf__field input,
.rrf__field textarea {
  width: 100%; min-width: 0; box-sizing: border-box; padding: 8px 10px;
  border: 1px solid var(--kdl-border); border-radius: 7px;
  background: var(--kdl-card-bg); color: var(--kdl-text-primary); font: inherit; font-size: 13px;
}
.rrf__field input:focus-visible,
.rrf__field textarea:focus-visible { outline: 2px solid var(--kdl-accent); outline-offset: -1px; }
.rrf__field input[readonly],
.rrf__field textarea[readonly] {
  border-color: transparent;
  background: var(--kdl-surface-sunken, var(--kdl-hover-bg));
  cursor: default;
}
.rrf__field input[aria-invalid="true"] { border-color: var(--kdl-danger, #c2414b); }
.rrf__error { color: var(--kdl-danger, #c2414b); font-size: 11px; }
.rrf__lines { padding-top: 14px; border-top: 1px solid var(--kdl-border); }
.rrf__empty-lines { margin-top: 10px; padding: 12px; border: 1px dashed var(--kdl-border); border-radius: 8px; color: var(--kdl-text-muted); font-size: 12px; }
.rrf__line { display: grid; grid-template-columns: minmax(180px, 2fr) 110px 100px 100px auto; gap: 8px; align-items: end; margin-top: 10px; }
.rrf__remove { margin-bottom: 1px; }
.rrf__actions { align-items: center; padding-top: 14px; border-top: 1px solid var(--kdl-border); }
.rrf__actions > div { display: flex; gap: 8px; flex-shrink: 0; }
@container (max-width: 620px) {
  .rrf__line { grid-template-columns: 1fr 1fr; }
  .rrf__field--line-description { grid-column: 1 / -1; }
  .rrf__actions { flex-direction: column; align-items: flex-start; }
}
@media (max-width: 760px) {
  .rrf__grid { grid-template-columns: 1fr; }
  .rrf__field--wide { grid-column: auto; }
  .rrf__line { grid-template-columns: 1fr 1fr; }
  .rrf__field--line-description { grid-column: 1 / -1; }
  .rrf__intro,
  .rrf__actions { flex-direction: column; }
  .rrf__header-actions { width: 100%; justify-content: space-between; }
}
</style>
