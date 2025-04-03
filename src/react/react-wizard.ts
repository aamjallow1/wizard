/* eslint-disable max-lines */

import chalk from 'chalk';
import {
  abort,
  askForAIConsent,
  confirmContinueIfNoOrDirtyGitRepo,
  ensurePackageIsInstalled,
  getOrAskForProjectData,
  getPackageDotJson,
  getPackageManager,
  installPackage,
  isUsingTypeScript,
  printWelcome,
  runPrettierIfInstalled,
} from '../utils/clack-utils';
import { getPackageVersion, hasPackageInstalled } from '../utils/package-json';
import clack from '../utils/clack';
import { Integration, ISSUES_URL } from '../lib/constants';
import { getReactDocumentation } from './docs';
import { analytics } from '../utils/analytics';
import { addOrUpdateEnvironmentVariables } from '../utils/environment';
import {
  generateFileChangesForIntegration,
  getFilesToChange,
  getRelevantFilesForIntegration,
} from '../utils/file-utils';
import type { WizardOptions } from '../utils/types';
import { askForCloudRegion } from '../utils/clack-utils';
import fg from 'fast-glob';

export async function runReactWizard(options: WizardOptions): Promise<void> {
  printWelcome({
    wizardName: 'PostHog React Wizard',
  });

  const aiConsent = await askForAIConsent(options);

  if (!aiConsent) {
    await abort(
      'The React wizard requires AI to get setup right now. Please view the docs to setup React manually instead: https://posthog.com/docs/libraries/react',
      0,
    );
  }

  const cloudRegion = options.cloudRegion ?? (await askForCloudRegion());

  const typeScriptDetected = isUsingTypeScript(options);

  await confirmContinueIfNoOrDirtyGitRepo(options);

  const packageJson = await getPackageDotJson(options);

  await ensurePackageIsInstalled(packageJson, 'react', 'React');

  const reactVersion = getPackageVersion('react', packageJson);

  if (reactVersion) {
    analytics.setTag('react-version', reactVersion);
  }

  const { projectApiKey, wizardHash, host } = await getOrAskForProjectData({
    ...options,
    cloudRegion,
  });

  const sdkAlreadyInstalled = hasPackageInstalled('posthog-js', packageJson);

  analytics.setTag('sdk-already-installed', sdkAlreadyInstalled);

  const { packageManager: packageManagerFromInstallStep } =
    await installPackage({
      packageName: 'posthog-js',
      packageNameDisplayLabel: 'posthog-js',
      alreadyInstalled: !!packageJson?.dependencies?.['posthog-js'],
      forceInstall: options.forceInstall,
      askBeforeUpdating: false,
      installDir: options.installDir,
      integration: Integration.react,
    });

  const relevantFiles = await getRelevantFilesForIntegration({
    installDir: options.installDir,
    integration: Integration.react,
  });

  const envVarPrefix = await detectEnvVarPrefix(options);

  const installationDocumentation = getReactDocumentation({
    host,
    language: typeScriptDetected ? 'typescript' : 'javascript',
    envVarPrefix,
  });

  clack.log.info(`Reviewing PostHog documentation for React`);

  const filesToChange = await getFilesToChange({
    integration: Integration.react,
    relevantFiles,
    documentation: installationDocumentation,
    wizardHash,
    cloudRegion,
  });

  await generateFileChangesForIntegration({
    integration: Integration.react,
    filesToChange,
    wizardHash,
    installDir: options.installDir,
    documentation: installationDocumentation,
    cloudRegion,
  });

  await addOrUpdateEnvironmentVariables({
    variables: {
      [envVarPrefix + 'POSTHOG_KEY']: projectApiKey,
    },
    installDir: options.installDir,
    integration: Integration.react,
  });

  const packageManagerForOutro =
    packageManagerFromInstallStep ?? (await getPackageManager(options));

  await runPrettierIfInstalled({
    installDir: options.installDir,
    integration: Integration.react,
  });

  clack.outro(`
${chalk.green('Successfully installed PostHog!')} ${`\n\n${aiConsent
      ? `Note: This uses experimental AI to setup your project. It might have got it wrong, pleaes check!\n`
      : ``
    }You should validate your setup by (re)starting your dev environment (e.g. ${chalk.cyan(
      `${packageManagerForOutro.runScriptCommand} dev`,
    )})`}

${chalk.dim(`If you encounter any issues, let us know here: ${ISSUES_URL}`)}`);

  await analytics.shutdown('success');
}


export async function detectEnvVarPrefix(
  options: WizardOptions,
): Promise<string> {
  const packageJson = await getPackageDotJson(options);

  const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
  const has = (name: string) => name in deps
  const hasAnyFile = async (patterns: string[]) => {
    const matches = await fg(patterns, {
      cwd: options.installDir,
      absolute: false,
      onlyFiles: true,
      ignore: ['**/node_modules/**'],
    })
    return matches.length > 0
  }

  // --- Next.js
  if (
    has('next') ||
    (await hasAnyFile(['**/next.config.{js,ts,mjs,cjs}']))
  ) {
    return 'NEXT_PUBLIC_'
  }

  // --- Create React App
  if (
    has('react-scripts') ||
    has('create-react-app') ||
    (await hasAnyFile(['**/config-overrides.js']))
  ) {
    return 'REACT_APP_'
  }

  // --- Vite (vanilla, TanStack, Solid, etc.)
  // Note: Vite does not need PUBLIC_ but we use it to follow the docs, to improve the chances of an LLM getting it right.
  if (
    has('vite') ||
    (await hasAnyFile(['**/vite.config.{js,ts,mjs,cjs}']))
  ) {
    return 'VITE_PUBLIC_'
  }

  // --- SvelteKit
  if (
    has('@sveltejs/kit') ||
    (await hasAnyFile(['**/svelte.config.{js,ts}']))
  ) {
    return 'PUBLIC_'
  }

  // --- TanStack Start (uses Vite)
  if (
    has('@tanstack/start') ||
    (await hasAnyFile(['**/tanstack.config.{js,ts}']))
  ) {
    return 'VITE_PUBLIC_'
  }

  // --- SolidStart (uses Vite)
  if (
    has('solid-start') ||
    (await hasAnyFile(['**/solid.config.{js,ts}']))
  ) {
    return 'VITE_PUBLIC_'
  }

  // --- Astro
  if (
    has('astro') ||
    (await hasAnyFile(['**/astro.config.{js,ts,mjs}']))
  ) {
    return 'PUBLIC_'
  }

  // We default to Vite if we can't detect a specific framework, since it's the most commonly used.
  return 'VITE_PUBLIC_'
}