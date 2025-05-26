import {
  addMCPServerToClientsStep,
  removeMCPServerFromClientsStep,
} from './steps/add-mcp-server-to-clients';
import clack from './utils/clack';
import {
  abort,
  askForCloudRegion,
  getOrAskForProjectData,
} from './utils/clack-utils';
import type { CloudRegion } from './utils/types';

export const runMCPInstall = async (options: {
  signup: boolean;
  region?: CloudRegion;
}) => {
  clack.intro('Installing the PostHog MCP server.');

  const cloudRegion = options.region ?? (await askForCloudRegion());

  const { personalApiKey = 'helloworld' } = await getOrAskForProjectData({
    signup: options.signup,
    cloudRegion,
  });

  if (!personalApiKey) {
    await abort('Unable to create a personal API key.');
  }

  await addMCPServerToClientsStep(personalApiKey, {});

  clack.outro(`PostHog MCP server installed successfully.\n\nGet started by asking some prompts like:

  - What feature flags do I have active?
  - Add a new feature flag for our homepage redesign
  - What are my most common errors?
  `);
};

export const runMCPRemove = async () => {
  await removeMCPServerFromClientsStep({});
};
