import * as fs from 'fs';
import chalk from 'chalk';
import path from 'path';
import { Integration } from '../lib/constants';
import { analytics } from '../utils/analytics';
import clack from '../utils/clack';
import { traceStep } from '../telemetry';

type InstallRulesOptions = {
  installDir: string;
  rulesName: string;
  integration: Integration;
};

export const installRules = async ({
  installDir,
  rulesName,
  integration,
}: InstallRulesOptions) => {
  // Add rules file if in Cursor environment
  if (process.env.CURSOR_TRACE_ID) {
    return traceStep('install-rules', async () => {
      const docsDir = path.join(installDir, '.cursor', 'rules');

      await fs.promises.mkdir(docsDir, { recursive: true });

      const frameworkRules = await fs.promises.readFile(
        path.join(__dirname, rulesName),
        'utf8',
      );
      const universalRulesPath = path.join(__dirname, 'universal.md');

      const universalRules = await fs.promises.readFile(
        universalRulesPath,
        'utf8',
      );

      // Replace {universal} placeholder with universal rules content
      const combinedRules = frameworkRules.replace('{universal}', universalRules);
      const targetPath = path.join(docsDir, 'posthog-integration.mdc');

      // Write the combined rules
      await fs.promises.writeFile(targetPath, combinedRules, 'utf8');

      analytics.capture('wizard interaction', {
        action: 'added cursor rules',
        integration,
      });

      clack.log.info(`Added Cursor rules to ${chalk.bold.cyan(docsDir)}`);
    });
  }
};
