import z from 'zod';

export const DefaultMCPClientConfig = z
  .object({
    mcpServers: z.record(
      z.string(),
      z.object({
        command: z.string().optional(),
        args: z.array(z.string()).optional(),
        env: z.record(z.string(), z.string()).optional(),
      }),
    ),
  })
  .passthrough();

type MCPServerType = 'sse' | 'streamable-http';

export const getDefaultServerConfig = (
  apiKey: string,
  type: MCPServerType,
) => ({
  command: 'npx',
  args: [
    '-y',
    'mcp-remote@latest',
    `https://mcp.posthog.com/${type === 'sse' ? 'sse' : 'mcp'}`,
    '--header',
    `Authorization:\${POSTHOG_AUTH_HEADER}`,
  ],
  env: {
    POSTHOG_AUTH_HEADER: `Bearer ${apiKey}`,
  },
});
