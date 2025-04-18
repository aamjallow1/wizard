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
FILE: The entrypoint for the app code, it will already exist in the project and should not be created.
LOCATION: Usually app/_layout.${language === 'typescript' ? 'tsx' : 'jsx'}, App.${language === 'typescript' ? 'tsx' : 'jsx'}, index.${language === 'typescript' ? 'ts' : 'js'} or something similar. You should look at the file structure of the project to find the correct location.
==============================
Changes:
- Add the PostHogProvider to the root of the app in the provider tree. If other providers are already present, add it in a suitable location.

Example (with the correct API key and host):
--------------------------------------------------
import { PostHogProvider } from 'posthog-react-native'
...

export function MyApp() {
    return (
        <PostHogProvider apiKey="${projectApiKey}" options={{
            host: '${host}', 
            enableSessionReplay: true,
        }} autocapture>
         ...
        </PostHogProvider>
    )
}
--------------------------------------------------`;
};
