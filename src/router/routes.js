const routes = [
  {
    path: '/',
    redirect: '/app',
  },
  {
    path: '/login',
    name: 'login',
    component: () => import('pages/Login.vue'),
  },
  {
    path: '/app',
    component: () => import('layouts/MainLayout.vue'),
    meta: { requiresAuth: true },
    children: [
      {
        path: '',
        name: 'portal',
        component: () => import('pages/Dashboard.vue'),
      },
      {
        path: 'ai-agent',
        name: 'ai-agent',
        component: () => import('pages/AiAgent.vue'),
      },
      {
        path: 'pipeline',
        component: () => import('layouts/PipelineLayout.vue'),
        children: [
          {
            path: '',
            name: 'pipeline',
            redirect: { name: 'processes' },
          },
          {
            path: 'processes',
            name: 'processes',
            component: () => import('pages/Processes.vue'),
          },
          {
            path: 'data',
            name: 'data',
            component: () => import('pages/DataViewer.vue'),
          },
          {
            path: 'compare',
            name: 'compare',
            component: () => import('pages/Comparison.vue'),
          },
          {
            path: 'xero-connect',
            name: 'xero-connect',
            component: () => import('pages/XeroConnect.vue'),
          },
          {
            path: 'investec/holdings',
            name: 'investec-holdings',
            component: () => import('pages/InvestecHoldings.vue'),
          },
          {
            path: 'investec/transactions',
            name: 'investec-transactions',
            component: () => import('pages/InvestecTransactions.vue'),
          },
          {
            path: 'investec/share-codes',
            name: 'investec-share-codes',
            component: () => import('pages/InvestecShareCodes.vue'),
          },
          {
            path: 'investec/account',
            name: 'investec-account',
            component: () => import('pages/InvestecAccount.vue'),
          },
          {
            path: 'financial-investments',
            name: 'financial-investments',
            component: () => import('pages/FinancialInvestments.vue'),
          },
          {
            path: 'dividend-forecast',
            name: 'dividend-forecast',
            component: () => import('pages/DividendForecast.vue'),
          },
          {
            path: 'planning-analytics',
            name: 'planning-analytics',
            component: () => import('pages/PlanningAnalytics.vue'),
          },
        ],
      },
      {
        path: 'setup',
        component: () => import('layouts/SetupLayout.vue'),
        children: [
          {
            path: '',
            name: 'setup',
            redirect: { name: 'credentials' },
          },
          {
            path: 'credentials',
            name: 'credentials',
            component: () => import('pages/Credentials.vue'),
          },
          {
            path: 'ai-agent',
            name: 'ai-agent-setup',
            component: () => import('pages/AiAgentSetup.vue'),
          },
          {
            path: 'monitor',
            name: 'agent-monitor',
            component: () => import('pages/AgentMonitor.vue'),
          },
        ],
      },
    ],
  },
  {
    path: '/:catchAll(.*)*',
    component: () => import('pages/Error404.vue'),
  },
];

export default routes;
