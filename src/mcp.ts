import chalk from 'chalk';
import {
  addMCPServerToClientsStep,
  removeMCPServerFromClientsStep,
} from './steps/add-mcp-server-to-clients';
import clack from './utils/clack';
import { abort, askForCloudRegion } from './utils/clack-utils';
import type { CloudRegion } from './utils/types';
import opn from 'opn';
import { getCloudUrlFromRegion } from './utils/urls';
import { sleep } from './lib/helper-functions';

export const runMCPInstall = async (options: {
  signup: boolean;
  region?: CloudRegion;
}) => {
  clack.intro('Installing the PostHog MCP server.');

  await addMCPServerToClientsStep({
    cloudRegion: options.region,
  });

  clack.outro(`${chalk.green(
    'You might need to restart your MCP clients to see the changes.',
  )}

Get started with some prompts like:

  - What feature flags do I have active?
  - Add a new feature flag for our homepage redesign
  - What are my most common errors?
`);
};

export const runMCPRemove = async () => {
  const results = await removeMCPServerFromClientsStep({});

  if (results.length === 0) {
    clack.outro(`No PostHog MCP servers found to remove.`);
    return;
  }

  clack.outro(`PostHog MCP server removed from:
  ${results.map((c) => `- ${c}`).join('\n  ')}
  
  ${chalk.green(
    'You might need to restart your MCP clients to see the changes.',
  )}`);
};

export const getPersonalApiKey = async (options: {
  region?: CloudRegion;
}): Promise<string> => {
  const cloudRegion = options.region ?? (await askForCloudRegion());

  const cloudUrl = getCloudUrlFromRegion(cloudRegion);

  const urlToOpen = `${cloudUrl}/settings/user-api-keys?preset=mcp_server`;

  const spinner = clack.spinner();
  spinner.start(
    `Opening your project settings so you can get a Personal API key...`,
  );

  await sleep(1500);

  spinner.stop();

  clack.log.info(
    `If it didn't open automatically, open the following URL in your browser to get a Personal API key:\n\n${chalk.cyan(
      urlToOpen,
    )}`,
  );

  opn(urlToOpen, { wait: false }).catch(() => {
    // opn throws in environments that don't have a browser (e.g. remote shells) so we just noop here
  });

  const personalApiKey = await clack.password({
    message: 'Paste in your Personal API key:',
    validate(value) {
      if (value.length === 0) return `Value is required!`;

      if (!value.startsWith('phx_')) {
        return `That doesn't look right, are you sure you copied the right key? It should start with 'phx_'`;
      }
    },
  });

  if (!personalApiKey) {
    await abort('Unable to proceed without a personal API key.');
    return '';
  }

  return personalApiKey as string;
};
