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
import { getVueDocumentation } from './docs';
import { analytics } from '../utils/analytics';
import {
  addOrUpdateEnvironmentVariables,
  detectEnvVarPrefix,
} from '../utils/environment';
import {
  generateFileChangesForIntegration,
  getFilesToChange,
  getRelevantFilesForIntegration,
} from '../utils/file-utils';
import type { WizardOptions } from '../utils/types';
import { askForCloudRegion } from '../utils/clack-utils';
import { addEditorRules } from '../utils/rules/add-editor-rules';

export async function runVueWizard(options: WizardOptions): Promise<void> {
  printWelcome({
    wizardName: 'PostHog Vue Wizard',
  });

  const aiConsent = await askForAIConsent(options);

  if (!aiConsent) {
    await abort(
      'The Vue wizard requires AI to get setup right now. Please view the docs to setup Vue manually instead: https://posthog.com/docs/libraries/vue',
      0,
    );
  }

  const cloudRegion = options.cloudRegion ?? (await askForCloudRegion());

  const typeScriptDetected = isUsingTypeScript(options);

  await confirmContinueIfNoOrDirtyGitRepo(options);

  const packageJson = await getPackageDotJson(options);

  await ensurePackageIsInstalled(packageJson, 'vue', 'Vue');

  const vueVersion = getPackageVersion('vue', packageJson);

  if (vueVersion && Number(vueVersion) < 3) {
    await abort(
      'The Vue wizard requires Vue 3. Please refer to the documentation for setting up a Vue 2 project: https://posthog.com/docs/libraries/vue',
      0,
    );
  }

  if (vueVersion) {
    analytics.setTag('vue-version', vueVersion);
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
      integration: Integration.vue,
    });

  const relevantFiles = await getRelevantFilesForIntegration({
    installDir: options.installDir,
    integration: Integration.vue,
  });

  const envVarPrefix = await detectEnvVarPrefix(options);

  const installationDocumentation = getVueDocumentation({
    host,
    language: typeScriptDetected ? 'typescript' : 'javascript',
    envVarPrefix,
  });

  clack.log.info(`Reviewing PostHog documentation for Vue`);

  const filesToChange = await getFilesToChange({
    integration: Integration.vue,
    relevantFiles,
    documentation: installationDocumentation,
    wizardHash,
    cloudRegion,
  });

  await generateFileChangesForIntegration({
    integration: Integration.vue,
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
    integration: Integration.vue,
  });

  const packageManagerForOutro =
    packageManagerFromInstallStep ?? (await getPackageManager(options));

  await runPrettierIfInstalled({
    installDir: options.installDir,
    integration: Integration.vue,
  });

  await addEditorRules({
    installDir: options.installDir,
    rulesName: 'vue-rules.md',
    integration: Integration.vue,
    default: options.default,
  });

  clack.outro(`
${chalk.green('Successfully installed PostHog!')} ${`\n\n${
    aiConsent
      ? `Note: This uses experimental AI to setup your project. It might have got it wrong, pleaes check!\n`
      : ``
  }You should validate your setup by (re)starting your dev environment (e.g. ${chalk.cyan(
    `${packageManagerForOutro.runScriptCommand} dev`,
  )})`}

${chalk.dim(`If you encounter any issues, let us know here: ${ISSUES_URL}`)}`);

  await analytics.shutdown('success');
}
