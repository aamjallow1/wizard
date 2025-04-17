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
FILE: src/plugins/posthog.${language === 'typescript' ? 'ts' : 'js'}
LOCATION: Vue plugin setup for PostHog
==============================
Changes:
- Create a Vue plugin to initialize PostHog and expose it globally.

Example:
--------------------------------------------------
import posthog from 'posthog-js'
import type { App } from 'vue'

export default {
  install(app: App) {
    posthog.init(${apiKeyText}, {
      api_host: '${host}',
      capture_pageview: false,
      debug: ${
        envVarPrefix === 'VITE_PUBLIC_'
          ? 'import.meta.env.MODE === "development"'
          : 'process.env.NODE_ENV === "development"'
      },
    })

    app.config.globalProperties.$posthog = posthog
  }
}
--------------------------------------------------

==============================
FILE: src/main.${language === 'typescript' ? 'ts' : 'js'}
LOCATION: App entry point
==============================
Changes:
- Import and register the PostHog plugin with the Vue app.

Example:
--------------------------------------------------
import { createApp } from 'vue'
import App from './App.vue'
import posthogPlugin from './plugins/posthog'

const app = createApp(App)
app.use(posthogPlugin)
app.mount('#app')
--------------------------------------------------
`;
};
