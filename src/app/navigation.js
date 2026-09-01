/**
 * Canonical application navigation registry.
 *
 * The header, operations drawer, and command palette all consume this file so
 * route labels and destinations cannot silently drift apart as modules grow.
 */

export const PRIMARY_NAV_ITEMS = [
  {
    name: 'portal',
    label: 'Overview',
    to: { name: 'portal' },
    commandLabel: 'Go to Overview',
    commandIcon: 'home',
    keywords: ['home', 'portal', 'overview'],
    activeNames: ['portal', 'close-overview-preview'],
  },
  {
    name: 'processes',
    label: 'Money',
    to: { name: 'processes' },
    commandLabel: 'Go to Money',
    commandIcon: 'refresh-cw',
    keywords: ['money', 'bank', 'transactions', 'operations'],
    activeNames: ['processes', 'data', 'compare', 'investec-account', 'investec-transactions'],
    hasMenu: true,
  },
  {
    name: 'audit-procedures',
    label: 'Close',
    to: { name: 'audit-procedures' },
    commandLabel: 'Go to Close',
    commandIcon: 'check-circle',
    keywords: ['close', 'month end', 'year end', 'sign off'],
    activeNames: ['audit-procedures'],
    hasMenu: true,
  },
  {
    name: 'reporting',
    label: 'Reporting',
    to: { name: 'reporting' },
    commandLabel: 'Go to Reporting',
    commandIcon: 'line-chart',
    keywords: ['reporting', 'reports', 'dashboard', 'business reports'],
    activeNames: ['reporting', 'planning-analytics'],
    hasMenu: true,
  },
  {
    name: 'audit-receipts-v2',
    label: 'Audit',
    to: { name: 'audit-receipts-v2' },
    commandLabel: 'Go to Audit',
    commandIcon: 'search-check',
    keywords: ['audit', 'findings', 'receipts', 'evidence'],
    activeNames: ['audit-findings', 'audit-receipts', 'audit-receipts-v2', 'audit-comments'],
    hasMenu: true,
  },
  {
    name: 'financial-investments-strategy',
    label: 'Investments',
    to: { name: 'financial-investments-strategy' },
    commandLabel: 'Go to Investments',
    commandIcon: 'trending-up',
    keywords: ['investments', 'stocks', 'holdings', 'dividends'],
    activeNames: ['financial-investments-strategy', 'financial-investments', 'dividend-forecast', 'investec-holdings'],
    hasMenu: true,
  },
];

export const OPERATION_NAV_GROUPS = [
  {
    key: 'xero',
    label: 'Xero',
    items: [
      { name: 'processes', label: 'Processes', lucide: 'play-circle', keywords: ['run', 'sync'] },
      { name: 'data', label: 'Data Viewer', lucide: 'table', keywords: ['table', 'transactions'] },
      { name: 'compare', label: 'Comparison', lucide: 'git-compare', keywords: ['compare', 'reports'] },
    ],
  },
  {
    key: 'investec',
    label: 'Investec',
    items: [
      { name: 'investec-holdings', label: 'Share holdings', lucide: 'pie-chart', keywords: ['shares'] },
      { name: 'investec-transactions', label: 'Share transactions', lucide: 'list', keywords: ['trades'] },
      { name: 'investec-share-codes', label: 'Share codes', lucide: 'tag', keywords: ['tickers', 'symbols'] },
      { name: 'investec-account', label: 'Account', lucide: 'landmark', keywords: ['balance'] },
    ],
  },
  {
    key: 'investments',
    label: 'Financial Investments',
    items: [
      { name: 'financial-investments-strategy', label: 'Dashboard', lucide: 'layout-dashboard', keywords: ['strategy'] },
      { name: 'financial-investments', label: 'Stocks', lucide: 'trending-up', keywords: ['portfolio', 'holdings'] },
      { name: 'dividend-forecast', label: 'Dividend Forecast', lucide: 'dollar-sign', keywords: ['income', 'forecast'] },
    ],
  },
  {
    key: 'pa',
    label: 'Planning Analytics',
    items: [
      { name: 'planning-analytics', label: 'Pipeline', lucide: 'bar-chart-2', keywords: ['tm1', 'planning'] },
    ],
  },
  {
    key: 'audit',
    label: 'Audit',
    items: [
      { name: 'audit-procedures', label: 'Audit Procedures', lucide: 'clipboard-check', keywords: ['year end', 'close'] },
      { name: 'audit-findings', label: 'Findings', lucide: 'search-check', keywords: ['exceptions', 'review'] },
      { name: 'audit-receipts', label: 'Receipts', lucide: 'receipt', keywords: ['evidence', 'xero'] },
      { name: 'audit-receipts-v2', label: 'Receipts V2', lucide: 'receipt', keywords: ['evidence', 'xero', 'review'] },
      { name: 'audit-comments', label: 'Cell Comments', lucide: 'message-square', keywords: ['notes', 'spreadsheet'] },
    ],
  },
  {
    key: 'pricing',
    label: 'Pricing',
    items: [
      { name: 'pricelist', label: 'Price List', lucide: 'tag', keywords: ['prices', 'products'] },
    ],
  },
];

export const SECONDARY_NAV_ITEMS = [
  {
    name: 'ai-agent',
    label: 'AI Agent',
    commandLabel: 'Go to AI Agent',
    commandIcon: 'bot',
    keywords: ['ai', 'agent', 'assistant', 'llm'],
  },
];

export function createNavigationCommands(router) {
  const primaryCommands = PRIMARY_NAV_ITEMS.map((item) => ({
    id: `nav-primary-${item.name}`,
    label: item.commandLabel,
    category: 'Navigate',
    icon: item.commandIcon,
    keywords: item.keywords,
    routeName: item.name,
  }));

  const operationCommands = OPERATION_NAV_GROUPS.flatMap((group) =>
    group.items.map((item) => ({
      id: `nav-${item.name}`,
      label: `${group.label} — ${item.label}`,
      category: 'Navigate',
      icon: item.lucide,
      keywords: [group.label.toLowerCase(), item.label.toLowerCase(), ...(item.keywords || [])],
      routeName: item.name,
    })),
  );

  const secondaryCommands = SECONDARY_NAV_ITEMS.map((item) => ({
    id: `nav-${item.name}`,
    label: item.commandLabel,
    category: 'Navigate',
    icon: item.commandIcon,
    keywords: item.keywords,
    routeName: item.name,
  }));

  return [...primaryCommands, ...operationCommands, ...secondaryCommands]
    .filter((command) => router.hasRoute(command.routeName))
    .map(({ routeName, ...command }) => ({
      ...command,
      perform: () => router.push({ name: routeName }),
    }));
}
