import * as fs from 'fs';
import chalk from 'chalk';
import path from 'path';
import { Integration } from '../../lib/constants';
import { analytics } from '../analytics';
import clack from '../clack';
import { traceStep } from '../../telemetry';

type AddEditorRulesOptions = {
  installDir: string;
  rulesName: string;
  integration: Integration;
};

export const addEditorRules = async ({
  installDir,
  rulesName,
  integration,
}: AddEditorRulesOptions) => {
  // Add rules file if in Cursor environment
  if (process.env.CURSOR_TRACE_ID) {
    return traceStep('add-editor-rules', async () => {
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
      const combinedRules = frameworkRules.replace(
        '{universal}',
        universalRules,
      );
      const targetPath = path.join(docsDir, 'posthog-integration.mdc');

      // Write the combined rules
      await fs.promises.writeFile(targetPath, combinedRules, 'utf8');

      analytics.capture('wizard interaction', {
        action: 'added editor rules',
        integration,
      });

      clack.log.info(`Added editor rules to ${chalk.bold.cyan(docsDir)}`);
    });
  }
};
