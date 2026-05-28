import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const source = readFileSync(resolve(__dirname, '../FinancialLineChart.vue'), 'utf-8');

describe('FinancialLineChart drag measurement', () => {
  it('supports dragging between two chart points to show percent movement', () => {
    expect(source).toContain('pointerdown');
    expect(source).toContain('pointermove');
    expect(source).toContain('pointerup');
    expect(source).toContain('dragMeasurePlugin');
    expect(source).toContain('formatMeasurePercent');
    expect(source).toContain('closeAt(dragMeasure.startIndex)');
    expect(source).toContain('closeAt(dragMeasure.endIndex)');
  });

  it('renders prominent buy markers and sell markers on the price chart', () => {
    expect(source).toContain("datasetId: 'buy-markers'");
    expect(source).toContain("datasetId: 'sell-markers'");
    expect(source).toContain('pointRotation: 180');
    expect(source).toContain('isTradeMarkerType');
    expect(source).toContain('style.borderWidth');
    expect(source).toContain('style.hitRadius');
  });
});
