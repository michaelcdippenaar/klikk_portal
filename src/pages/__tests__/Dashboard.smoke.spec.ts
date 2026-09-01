import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const PAGE_PATH = resolve(__dirname, '../Dashboard.vue');
const MONTH_PATH = resolve(__dirname, '../../components/close-overview/MonthCloseStrip.vue');
const FINANCIAL_YEAR_PATH = resolve(__dirname, '../../components/close-overview/FinancialYearSelector.vue');
const STAGE_PATH = resolve(__dirname, '../../components/close-overview/CloseStageNav.vue');
const WORK_TABLE_PATH = resolve(__dirname, '../../components/close-overview/CloseWorkTable.vue');
const INGEST_WIDGETS_PATH = resolve(__dirname, '../../components/close-overview/IngestSourceWidgets.vue');
const RECONCILE_WIDGETS_PATH = resolve(__dirname, '../../components/close-overview/ReconciliationControlGrid.vue');
const SOURCE_PATH = resolve(__dirname, '../../components/close-overview/SourceFreshnessPopover.vue');
const COMMENTS_PATH = resolve(__dirname, '../../components/close-overview/CloseCubeComments.vue');
const EXCEPTIONS_PATH = resolve(__dirname, '../../components/close-overview/CloseExceptionsPanel.vue');
const DETAIL_PATH = resolve(__dirname, '../../components/overview/OverviewDetailPanel.vue');
const LAYOUT_PATH = resolve(__dirname, '../../layouts/MainLayout.vue');
const STYLES_PATH = resolve(__dirname, '../../css/close-overview.css');
const OVERVIEW_STYLES_PATH = resolve(__dirname, '../../css/overview-workspace.css');
const STORE_PATH = resolve(__dirname, '../../stores/overview.js');
const REPORTING_PAGE_PATH = resolve(__dirname, '../Reporting.vue');
const REPORTING_KPI_PATH = resolve(__dirname, '../../components/reporting/PerformanceKpiReport.vue');
const REPORTING_KPI_STORE_PATH = resolve(__dirname, '../../stores/reportingKpis.js');

const pageSource = readFileSync(PAGE_PATH, 'utf-8');
const monthSource = readFileSync(MONTH_PATH, 'utf-8');
const financialYearSource = readFileSync(FINANCIAL_YEAR_PATH, 'utf-8');
const stageSource = readFileSync(STAGE_PATH, 'utf-8');
const workTableSource = readFileSync(WORK_TABLE_PATH, 'utf-8');
const ingestWidgetsSource = readFileSync(INGEST_WIDGETS_PATH, 'utf-8');
const reconcileWidgetsSource = readFileSync(RECONCILE_WIDGETS_PATH, 'utf-8');
const sourcePanelSource = readFileSync(SOURCE_PATH, 'utf-8');
const commentsSource = readFileSync(COMMENTS_PATH, 'utf-8');
const exceptionsSource = readFileSync(EXCEPTIONS_PATH, 'utf-8');
const detailSource = readFileSync(DETAIL_PATH, 'utf-8');
const layoutSource = readFileSync(LAYOUT_PATH, 'utf-8');
const closeOverviewStyles = readFileSync(STYLES_PATH, 'utf-8');
const overviewStyles = readFileSync(OVERVIEW_STYLES_PATH, 'utf-8');
const storeSource = readFileSync(STORE_PATH, 'utf-8');
const reportingPageSource = readFileSync(REPORTING_PAGE_PATH, 'utf-8');
const reportingKpiSource = readFileSync(REPORTING_KPI_PATH, 'utf-8');
const reportingKpiStoreSource = readFileSync(REPORTING_KPI_STORE_PATH, 'utf-8');

describe('Dashboard — month-led close overview', () => {
  it('orchestrates modular close overview components', () => {
    expect(pageSource).toContain('MonthCloseStrip');
    expect(pageSource).toContain('FinancialYearSelector');
    expect(pageSource).toContain('CloseStageNav');
    expect(pageSource).toContain('CloseWorkTable');
    expect(pageSource).toContain('IngestSourceWidgets');
    expect(pageSource).toContain('ReconciliationControlGrid');
    expect(pageSource).toContain('OverviewDetailPanel');
    expect(pageSource).toContain('CloseCubeComments');
    expect(pageSource).toContain('CloseExceptionsPanel');
    expect(pageSource).not.toContain('OverviewViewNav');
    expect(pageSource).not.toContain('OverviewKpiRail');
    expect(layoutSource).toContain('SourceFreshnessPopover');
    expect(pageSource).toContain('useOverviewStore');
    expect(pageSource).toContain('storeToRefs');
  });

  it('keeps the July completion state and all close stages', () => {
    expect(storeSource).toContain("{ key: 'jul', label: 'Jul', progress: 72 }");
    expect(storeSource).toContain("{ key: 'ingest', label: 'Ingest', progress: 100, state: 'complete', tone: 'success' }");
    expect(storeSource).toContain("{ key: 'reconcile', label: 'Reconcile', progress: 65, state: 'warning', tone: 'info' }");
    expect(storeSource).toContain("{ key: 'review', label: 'Review', progress: 40, state: 'warning', tone: 'warning' }");
    expect(storeSource).toContain("{ key: 'signoff', label: 'Sign off', progress: 0, state: 'pending', tone: 'pending' }");
    expect(closeOverviewStyles).toContain('.close-stage--info { --kdl-close-stage-color: var(--kdl-status-info); }');
    expect(closeOverviewStyles).toContain('.close-stage--warning { --kdl-close-stage-color: var(--kdl-status-warning); }');
  });

  it('routes individual receipt work to Receipts V2', () => {
    expect(storeSource).toContain("routeName: 'audit-receipts-v2'");
    expect(storeSource).toContain("id: 'receipt-office-crew'");
    expect(storeSource).toContain("category: 'receipt'");
  });

  it('keeps Overview as one workspace and moves KPI reporting into Reporting', () => {
    expect(pageSource).not.toContain('Close readiness');
    expect(pageSource).not.toContain('Performance KPIs');
    expect(storeSource).toContain('Assigned review work');
    expect(storeSource).toContain('cubeComments');
    expect(storeSource).toContain('selectedDetail');
    expect(reportingPageSource).toContain("id: 'performance-kpis'");
    expect(reportingPageSource).toContain('PerformanceKpiReport');
    expect(reportingKpiStoreSource).toContain('performanceKpis');
  });

  it('keeps progress visuals separate from accessible progress labels', () => {
    expect(monthSource).toContain('aria-label="`${month.label} close, ${month.progress}% complete`"');
    expect(monthSource).not.toContain('<style');
    expect(closeOverviewStyles).toContain('--kdl-size-progress-ring: 16px');
    expect(closeOverviewStyles).toContain('width: var(--kdl-size-progress-ring)');
    expect(monthSource).toContain('month-strip__progress--${month.progress}');
    expect(closeOverviewStyles).toContain('.month-strip__progress--72');
  });

  it('keeps component visual rules in the global token stylesheet', () => {
    for (const componentSource of [pageSource, monthSource, financialYearSource, stageSource, workTableSource, ingestWidgetsSource, reconcileWidgetsSource, sourcePanelSource, commentsSource, exceptionsSource, detailSource, reportingKpiSource]) {
      expect(componentSource).not.toContain('<style');
      expect(componentSource).not.toMatch(/style=/);
    }
    expect(closeOverviewStyles).toContain('.close-overview-page');
    expect(closeOverviewStyles).toContain('.ingest-work__table');
    expect(overviewStyles).toContain('.source-freshness-trigger');
    expect(overviewStyles).toContain('.overview-detail-panel');
    expect(overviewStyles).toContain('.close-comments');
    expect(overviewStyles).toContain('.close-exceptions');
    expect(overviewStyles).toContain('.overview-table');
  });

  it('opens contextual detail without reserving a permanent Overview rail', () => {
    expect(pageSource).toContain("@open=\"selectDetail('work', $event)\"");
    expect(pageSource).toContain("@open=\"selectDetail('comment', $event)\"");
    expect(pageSource).toContain("@open=\"selectDetail('exception', $event)\"");
    expect(pageSource).toContain("'close-overview-page--detail-open': selectedDetail");
    expect(closeOverviewStyles).toContain('.close-overview-page--detail-open');
    expect(detailSource).toContain('Close detail panel');
  });

  it('exposes each stage as an interactive current-step control', () => {
    expect(stageSource).toContain("aria-current=\"stage.key === modelValue ? 'step' : undefined\"");
    expect(stageSource).toContain("$emit('update:modelValue', stage.key)");
  });

  it('keeps close stages above the task queue', () => {
    expect(pageSource).not.toContain('close-overview-page__workspace');
    expect(pageSource.indexOf('CloseStageNav')).toBeLessThan(pageSource.indexOf('CloseWorkTable'));
    expect(closeOverviewStyles).toContain('.close-stages { display: grid');
  });

  it('keeps the month control at its intrinsic tokenised width', () => {
    expect(pageSource).toContain('close-overview-page__periods');
    expect(closeOverviewStyles).toContain('.close-overview-page__periods { display: grid;');
    expect(closeOverviewStyles).toContain('.month-strip { display: grid; width: max-content');
    expect(closeOverviewStyles).toContain('margin-inline: auto');
    expect(closeOverviewStyles).toContain('grid-template-columns: var(--kdl-close-month-all-width) repeat(12, var(--kdl-close-month-cell-min-width))');
  });

  it('keeps financial-year context inside Overview rather than the global header', () => {
    expect(pageSource).toContain('FinancialYearSelector');
    expect(pageSource).toContain(':years="financialYears"');
    expect(financialYearSource).toContain('aria-label="Financial year"');
    expect(storeSource).toContain('const selectedFinancialYear = ref(initialFinancialYear())');
    expect(storeSource).toContain("const financialYears = ref(['FY 2026', 'FY 2025'])");
    expect(financialYearSource).toContain('KTooltip');
    expect(financialYearSource).toContain('close-period-year__control--missing');
    expect(layoutSource).not.toContain('kdl-fy-control');
  });

  it('shows an account menu beside Overview source freshness', () => {
    expect(layoutSource).toContain('<SourceFreshnessPopover');
    expect(layoutSource).toContain('class="kdl-user-trigger"');
    expect(layoutSource).toContain(':aria-label="`User menu — ${userEmail}`"');
    expect(layoutSource).not.toContain('.kdl-main-layout--overview .kdl-user-trigger');
  });

  it('keeps preview demo navigation read-only at both shell and workbench boundaries', () => {
    expect(layoutSource).toContain('@click.capture="guardDemoNavigation"');
    expect(layoutSource).toContain('if (!dataStore.selectedTenant || dataStore.isDemo) return []');
    expect(layoutSource).toContain('allowDemoFallback: previewEnabled');
    expect(pageSource).toContain('if (dataStore.isDemo)');
    expect(pageSource).toContain('Demo data is read-only');
  });

  it('uses stage-specific accountability language in the shared work table', () => {
    expect(workTableSource).toContain('{{ reviewerLabel }}');
    expect(pageSource).toContain("reconcile: 'Verifier'");
    expect(pageSource).toContain("review: 'Reviewer'");
    expect(pageSource).toContain("signoff: 'Approver'");
  });

  it('keeps every work row structurally consistent', () => {
    expect(workTableSource).not.toContain('item.next');
    expect(workTableSource).not.toContain('item.evidence');
    expect(workTableSource).toContain('close-work__action-cell');
    expect(detailSource).toContain('selection.item.evidence');
  });

  it('uses a dedicated ingest source table and contextual operational routes', () => {
    expect(pageSource).toContain("v-if=\"selectedStage === 'ingest'\"");
    expect(ingestWidgetsSource).toContain('Last update');
    expect(ingestWidgetsSource).toContain('Validation');
    expect(ingestWidgetsSource).toContain('attentionCount');
    expect(ingestWidgetsSource).toContain('source jobs need attention');
    expect(ingestWidgetsSource).toContain('xeroLogo');
    expect(ingestWidgetsSource).toContain('investecLogo');
    expect(ingestWidgetsSource).toContain('ibmPlanningAnalyticsLogo');
    expect(ingestWidgetsSource).toContain('whatsappLogo');
    expect(storeSource).toContain("id: 'ingest-xero'");
    expect(storeSource).toContain("vendor: 'xero'");
    expect(storeSource).toContain("routeName: 'processes'");
    expect(storeSource).toContain("routeName: 'investec-holdings'");
    expect(storeSource).toContain("routeName: 'investec-transactions'");
    expect(storeSource).toContain("mode: 'Read only'");
    expect(detailSource).toContain("selection.item.category === 'ingest'");
    expect(detailSource).toContain('v-if="selection.item.routeName"');
    expect(detailSource).toContain('overview-detail-panel__unavailable');
  });

  it('pairs source colour with visible status text', () => {
    expect(sourcePanelSource).toContain("source.state === 'current' ? 'Current' : 'Attention'");
    expect(sourcePanelSource).toContain('Source freshness');
  });

  it('uses the larger global typography token for primary navigation', () => {
    expect(layoutSource).toContain('font-size: var(--kdl-font-size-section)');
  });
});
