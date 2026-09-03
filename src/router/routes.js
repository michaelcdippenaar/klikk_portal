const routes = [
  {
    path: '/',
    redirect: '/app',
  },
  {
    path: '/login',
    name: 'login',
    component: () => import('@/pages/Login.vue'),
  },
  {
    // Outside the app shell on purpose: an account holding a temporary
    // password gets 403 on every other endpoint, so a nav full of dead
    // routes would be worse than no nav.
    path: '/change-password',
    name: 'change-password',
    component: () => import('@/pages/ChangePassword.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/app',
    component: () => import('@/layouts/MainLayout.vue'),
    meta: { requiresAuth: true },
    children: [
      {
        path: '',
        name: 'portal',
        component: () => import('@/pages/Dashboard.vue'),
      },
      {
        path: 'ai-agent',
        name: 'ai-agent',
        component: () => import('@/pages/AiAgent.vue'),
      },
      {
        path: 'reporting',
        name: 'reporting',
        component: () => import('@/pages/Reporting.vue'),
      },
      {
        path: 'pipeline',
        component: () => import('@/layouts/PipelineLayout.vue'),
        children: [
          {
            path: '',
            name: 'pipeline',
            redirect: { name: 'processes' },
          },
          {
            path: 'processes',
            name: 'processes',
            component: () => import('@/pages/Processes.vue'),
          },
          {
            path: 'data',
            name: 'data',
            component: () => import('@/pages/DataViewer.vue'),
          },
          {
            path: 'compare',
            name: 'compare',
            component: () => import('@/pages/Comparison.vue'),
          },
          {
            // Moved to Setup -> Xero (/app/setup/credentials?tab=xero).
            // Redirect keeps old bookmarks and links working.
            path: 'xero-connect',
            redirect: (to) => ({
              name: 'credentials',
              query: { ...to.query, tab: 'xero' },
            }),
          },
          {
            path: 'investec/holdings',
            name: 'investec-holdings',
            component: () => import('@/pages/InvestecHoldings.vue'),
          },
          {
            path: 'investec/transactions',
            name: 'investec-transactions',
            component: () => import('@/pages/InvestecTransactions.vue'),
          },
          {
            path: 'investec/share-codes',
            name: 'investec-share-codes',
            component: () => import('@/pages/InvestecShareCodes.vue'),
          },
          {
            path: 'investec/account',
            name: 'investec-account',
            component: () => import('@/pages/InvestecAccount.vue'),
          },
          {
            path: 'financial-investments',
            name: 'financial-investments',
            component: () => import('@/pages/FinancialInvestments.vue'),
          },
          {
            path: 'dividend-forecast',
            name: 'dividend-forecast',
            component: () => import('@/pages/DividendForecast.vue'),
          },
          {
            path: 'financial-investments/strategy',
            name: 'financial-investments-strategy',
            component: () => import('@/pages/FinancialInvestmentStrategy.vue'),
          },
          {
            path: 'planning-analytics',
            name: 'planning-analytics',
            component: () => import('@/pages/PlanningAnalytics.vue'),
          },
          {
            path: 'audit/procedures',
            name: 'audit-procedures',
            component: () => import('@/pages/AuditProcedures.vue'),
          },
          {
            path: 'audit/findings',
            name: 'audit-findings',
            component: () => import('@/pages/AuditFindings.vue'),
          },
          {
            path: 'audit/receipts',
            name: 'audit-receipts',
            component: () => import('@/pages/AuditReceipts.vue'),
          },
          {
            path: 'audit/receipts-v2',
            name: 'audit-receipts-v2',
            component: () => import('@/pages/AuditReceiptsV2.vue'),
          },
          {
            path: 'audit/comments',
            name: 'audit-comments',
            component: () => import('@/pages/AuditComments.vue'),
          },
          {
            path: 'pricelist',
            name: 'pricelist',
            component: () => import('@/pages/Pricelist.vue'),
          },
        ],
      },
      {
        path: 'setup',
        component: () => import('@/layouts/SetupLayout.vue'),
        children: [
          {
            path: '',
            name: 'setup',
            redirect: { name: 'credentials' },
          },
          {
            path: 'credentials',
            name: 'credentials',
            component: () => import('@/pages/Credentials.vue'),
          },
          {
            // Xero connect/authorize lives as a tab on the Credentials page.
            // This alias makes /app/setup/xero open that tab directly.
            path: 'xero',
            redirect: (to) => ({
              name: 'credentials',
              query: { ...to.query, tab: 'xero' },
            }),
          },
          {
            path: 'ai-agent',
            name: 'ai-agent-setup',
            component: () => import('@/pages/AiAgentSetup.vue'),
          },
          {
            path: 'monitor',
            name: 'agent-monitor',
            component: () => import('@/pages/AgentMonitor.vue'),
          },
        ],
      },
    ],
  },
  // DEV ONLY — Klikk design language primitive preview. Not linked in app nav.
  // Accessible at http://localhost:9000/_klikk-preview during development.
  {
    path: '/_klikk-preview',
    name: 'klikk-preview',
    component: () => import('@/pages/KlikkPreview.vue'),
  },
  {
    // Xero OAuth callback landing URL. The backend redirects the browser here
    // (FRONTEND_URL/xero-connect?status=...) after handling /xero/callback/.
    // Forward to the Setup > Xero tab, preserving the OAuth query params.
    path: '/xero-connect',
    redirect: (to) => ({
      name: 'credentials',
      query: { ...to.query, tab: 'xero' },
    }),
  },
  {
    path: '/:catchAll(.*)*',
    component: () => import('@/pages/Error404.vue'),
  },
];

export default routes;
