export const getVueDocumentation = ({
  host,
  language,
  envVarPrefix,
}: {
  host: string;
  language: 'typescript' | 'javascript';
  envVarPrefix: string;
}) => {
  const apiKeyText =
    envVarPrefix === 'VITE_PUBLIC_'
      ? 'import.meta.env.VITE_PUBLIC_POSTHOG_KEY'
      : `process.env.${envVarPrefix}POSTHOG_KEY`;

  return `
==============================
FILE: src/composables/usePosthog.${language === 'typescript' ? 'ts' : 'js'}
LOCATION: New composable hook for PostHog
==============================
Changes:
- Create a reusable PostHog hook.

Example:
--------------------------------------------------
import posthog from 'posthog-js'

export function usePostHog() {
  posthog.init(${apiKeyText}, {
    api_host: '${host}',
    capture_pageview: false,
    debug: ${
      envVarPrefix === 'VITE_PUBLIC_'
        ? 'import.meta.env.MODE === "development"'
        : 'process.env.NODE_ENV === "development"'
    },
  })

  return {
    posthog,
  }
}
--------------------------------------------------

==============================
FILE: src/router/index.${language === 'typescript' ? 'ts' : 'js'}
LOCATION: Main router setup
==============================
Changes:
- Import and initialize PostHog composable.
- Add pageview and pageleave tracking.

Example:
--------------------------------------------------
import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import { usePostHog } from '@/composables/usePostHog'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: 'home', component: HomeView },
    { path: '/about', name: 'about', component: () => import('../views/AboutView.vue') },
  ],
})

const { posthog } = usePostHog()

router.beforeEach((to, from) => {
  if (from.path !== to.path) {
    posthog.capture('$pageleave')
  }
})

router.afterEach((to) => {
  posthog.capture('$pageview')
})

export default router
--------------------------------------------------
`;
};
