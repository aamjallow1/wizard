import type { Integration } from '../../lib/constants';
import { traceStep } from '../../telemetry';
import { analytics } from '../../utils/analytics';
import clack from '../../utils/clack';
import { abortIfCancelled } from '../../utils/clack-utils';
import { MCPClient } from './MCPClient';
import { CursorMCPClient } from './clients/cursor';

export const addMCPServerToClientsStep = async (
  apiKey: string,
  {
    integration,
  }: {
    integration: Integration;
  },
): Promise<string[]> => {
  const clients: MCPClient[] = [new CursorMCPClient()];

  const installedClients: MCPClient[] = [];
  const clientsToAdd: MCPClient[] = [];

  for (const client of clients) {
    if (await client.isClientInstalled()) {
      installedClients.push(client);

      const isServerInstalled = await client.isServerInstalled();
      if (!isServerInstalled) {
        clientsToAdd.push(client);
      }
    }
  }

  if (installedClients.length === 0) {
    analytics.capture('wizard interaction', {
      action: 'no mcp clients found',
      integration,
    });
    return [];
  }

  analytics.setTag(
    'installed-mcp-clients',
    installedClients.map((c) => c.constructor.name).join(','),
  );

  if (clientsToAdd.length === 0) {
    clack.log.info(
      'PostHog MCP server is already configured for all installed clients.',
    );
    analytics.capture('wizard interaction', {
      action: 'mcp servers already configured',
      clients: installedClients.map((c) => c.constructor.name),
      integration,
    });
    return installedClients.map((c) => c.constructor.name);
  }

  const results = await traceStep('adding mcp servers', async () => {
    const addedClients: string[] = [];

    for (const client of clientsToAdd) {
      try {
        await client.addServer(apiKey);
        addedClients.push(client.constructor.name);
        clack.log.success(
          `Added PostHog MCP server to ${client.constructor.name.replace(
            'MCPClient',
            '',
          )}`,
        );
      } catch (error) {
        clack.log.error(
          `Failed to add PostHog MCP server to ${client.constructor.name.replace(
            'MCPClient',
            '',
          )}: ${error.message}`,
        );
      }
    }

    return addedClients;
  });

  analytics.capture('wizard interaction', {
    action: 'added mcp servers',
    clients: results,
    integration,
  });

  return results;
};

export const removeMCPServerFromClientsStep = async ({
  integration,
}: {
  integration: Integration;
}): Promise<string[]> => {
  const clients: MCPClient[] = [new CursorMCPClient()];

  const clientsWithServer: MCPClient[] = [];

  for (const client of clients) {
    if (
      (await client.isClientInstalled()) &&
      (await client.isServerInstalled())
    ) {
      clientsWithServer.push(client);
    }
  }

  if (clientsWithServer.length === 0) {
    clack.log.info('No PostHog MCP servers found to remove.');
    analytics.capture('wizard interaction', {
      action: 'no mcp servers to remove',
      integration,
    });
    return [];
  }

  const clientNames = clientsWithServer.map((c) => c.name).join(', ');

  const removeServers: boolean = await abortIfCancelled(
    clack.select({
      message: `Found the PostHog MCP server in ${clientsWithServer.length} clients (${clientNames}). Would you like to remove it?`,
      options: [
        {
          value: true,
          label: 'Yes',
          hint: `Remove PostHog MCP server`,
        },
        {
          value: false,
          label: 'No',
          hint: 'Keep the MCP server configuration',
        },
      ],
    }),
    integration,
  );

  if (!removeServers) {
    analytics.capture('wizard interaction', {
      action: 'declined to remove mcp servers',
      clients: clientsWithServer.map((c) => c.constructor.name),
      integration,
    });
    return [];
  }

  const results = await traceStep('removing mcp servers', async () => {
    const removedClients: string[] = [];

    for (const client of clientsWithServer) {
      try {
        await client.removeServer();
        removedClients.push(client.constructor.name);
        clack.log.success(
          `Removed PostHog MCP server from ${client.constructor.name.replace(
            'MCPClient',
            '',
          )}`,
        );
      } catch (error) {
        clack.log.error(
          `Failed to remove PostHog MCP server from ${client.constructor.name.replace(
            'MCPClient',
            '',
          )}: ${error.message}`,
        );
      }
    }

    return removedClients;
  });

  analytics.capture('wizard interaction', {
    action: 'removed mcp servers',
    clients: results,
    integration,
  });

  return results;
};
