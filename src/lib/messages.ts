import chalk from 'chalk';
import type { CloudRegion, WizardOptions } from '../utils/types';
import { getCloudUrlFromRegion } from '../utils/urls';
import type { PackageManager } from '../utils/package-manager';
import { ISSUES_URL, Integration } from './constants';
import { INTEGRATION_CONFIG } from './config';

export const getPRDescription = ({
  integration,
  addedEditorRules,
}: {
  integration: Integration;
  addedEditorRules: boolean;
}) => {
  const integrationConfig = INTEGRATION_CONFIG[integration];

  return `This PR adds an integration for PostHog.

  The following changes were made:
  ${integrationConfig.defaultChanges}
  ${addedEditorRules ? `• Added Cursor rules for PostHog\n` : ''}
  
  
  Note: This used the ${
    integrationConfig.name
  } wizard to setup PostHog, this is still in alpha and like all AI, might have got it wrong. Please check the installation carefully!
  
  Learn more about PostHog + ${integrationConfig.name}: ${
    integrationConfig.docsUrl
  }`;
};

export const getOutroMessage = ({
  options,
  integration,
  cloudRegion,
  addedEditorRules,
  packageManager,
  envFileChanged,
  uploadedEnvVars,
  prUrl,
}: {
  options: WizardOptions;
  integration: Integration;
  cloudRegion: CloudRegion;
  addedEditorRules: boolean;
  packageManager?: PackageManager;
  envFileChanged?: string;
  prUrl?: string;
  uploadedEnvVars: string[];
}) => {
  const continueUrl = options.signup
    ? `${getCloudUrlFromRegion(cloudRegion)}/products?source=wizard`
    : undefined;

  const integrationConfig = INTEGRATION_CONFIG[integration];

  const changes = [
    ...(addedEditorRules ? `Added Cursor rules for PostHog` : ''),
    ...(prUrl ? `Created a PR for your changes: ${chalk.cyan(prUrl)}` : ''),
    ...(envFileChanged
      ? `Added your Project API key to your ${envFileChanged} file`
      : ''),
    ...uploadedEnvVars.map(
      (envVar) => `Uploaded ${envVar} to your hosting provider`,
    ),
  ];

  const nextSteps = [
    ...(uploadedEnvVars.length === 0
      ? `Upload your Project API key to your hosting provider`
      : ''),
    ...(!prUrl ? `Create a PR for your changes` : ''),
  ];

  return `
${chalk.green('Successfully installed PostHog!')}  
  
${chalk.cyan('Changes made:')}
${integrationConfig.defaultChanges}
${changes.map((change) => `• ${change}`).join('\n')}

${chalk.yellow('Next steps:')}
${integrationConfig.nextSteps}
${nextSteps.map((step) => `• ${step}`).join('\n')}
Learn more about PostHog + ${integrationConfig.name}: ${chalk.cyan(
    integrationConfig.docsUrl,
  )}
${continueUrl ? `\nContinue onboarding: ${chalk.cyan(continueUrl)}\n` : ``}
Note: This uses experimental AI to setup your project. It might have got it wrong, please check!

You should validate your setup by (re)starting your dev environment${
    packageManager
      ? ` (e.g. ${chalk.cyan(`${packageManager.runScriptCommand} dev`)}).`
      : `.`
  }

${chalk.dim(`If you encounter any issues, let us know here: ${ISSUES_URL}`)}`;
};
