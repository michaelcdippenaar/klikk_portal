import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';

const ROOT = new URL('../../../../', import.meta.url);
const kselectVue = readFileSync(
  fileURLToPath(new URL('src/components/klikk/KSelect.vue', ROOT)),
  'utf-8',
);

describe('KSelect chevron rotation', () => {
  it('rotates only the chevron SVG when the dropdown is open', () => {
    expect(kselectVue).toContain('class="kselect-chevron-icon"');
    expect(kselectVue).toContain('.kselect-trigger[data-state="open"] .kselect-chevron-icon');
  });

  it('does not rotate the SelectIcon wrapper that can affect the selected value', () => {
    expect(kselectVue).not.toContain(':global(.kselect-trigger[data-state="open"]) .kselect-chevron');
  });
});
