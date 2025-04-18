export const getReactNativeDocumentation = ({
  language,
  host,
  projectApiKey,
}: {
  language: 'typescript' | 'javascript';
  host: string;
  projectApiKey: string;
}) => {

  return `
==============================
FILE: {index / App}.${language === 'typescript' ? 'ts' : 'js'}
LOCATION: Wherever the root of the app is
==============================
Changes:
- Add the PostHogProvider to the root of the app in the provider tree.

Example (with the correct API key and host):
--------------------------------------------------
import { PostHogProvider } from 'posthog-react-native'
...

export function MyApp() {
    return (
        <PostHogProvider apiKey="${projectApiKey}" options={{
            host: '${host}', 
        }} autocapture>
         ...
        </PostHogProvider>
    )
}
--------------------------------------------------`;
};
