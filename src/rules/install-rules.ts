import * as fs from 'fs';
import chalk from 'chalk';
import path from 'path';
import { Integration } from '../lib/constants';
import { analytics } from '../utils/analytics';
import clack from '../utils/clack';

export const installRules = async (docsPath: string, installDir: string) => {
  // Add rules file if in Cursor environment
  if (process.env.CURSOR_TRACE_ID) {
    const docsDir = path.join(installDir, '.cursor', 'rules');
    await fs.promises.mkdir(docsDir, { recursive: true });

    // Read both rule files
    const nextRules = await fs.promises.readFile(
      docsPath,
      'utf8'
    );
    const universalRules = await fs.promises.readFile(
      path.join(__dirname, 'universal.md'),
      'utf8'
    );

    // Replace {universal} placeholder with universal rules content
    const combinedRules = nextRules.replace('{universal}', universalRules);

    // Write the combined rules
    await fs.promises.writeFile(
      path.join(docsDir, 'posthog-integration.mdc'),
      combinedRules,
      'utf8'
    );

    analytics.capture('wizard interaction', {
      action: 'add Cursor rules',
      integration: Integration.nextjs,
    });

    clack.log.info(
      `Copied documentation file to ${chalk.bold.cyan(docsDir)}`,
    );
  }
}