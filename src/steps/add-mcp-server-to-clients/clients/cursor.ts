import { MCPClient } from '../MCPClient';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { DefaultMCPClientConfig, getDefaultServerConfig } from '../defaults';
import { z } from 'zod';

export const CursorMCPConfig = DefaultMCPClientConfig;

export type CursorMCPConfig = z.infer<typeof DefaultMCPClientConfig>;

export class CursorMCPClient extends MCPClient {
  name = 'Cursor';

  constructor() {
    super();
  }

  private getConfigPath(): string {
    return path.join(os.homedir(), '.cursor', 'mcp.json');
  }

  async isServerInstalled(): Promise<boolean> {
    try {
      const configPath = this.getConfigPath();

      if (!fs.existsSync(configPath)) {
        return false;
      }

      const configContent = await fs.promises.readFile(configPath, 'utf8');
      const config = CursorMCPConfig.parse(JSON.parse(configContent));

      return 'posthog' in config.mcpServers;
    } catch {
      return false;
    }
  }

  async addServer(apiKey: string): Promise<void> {
    const configPath = this.getConfigPath();
    const configDir = path.dirname(configPath);

    await fs.promises.mkdir(configDir, { recursive: true });

    let config: CursorMCPConfig = { mcpServers: {} };

    if (fs.existsSync(configPath)) {
      try {
        const existingContent = await fs.promises.readFile(configPath, 'utf8');
        config = CursorMCPConfig.parse(JSON.parse(existingContent));
      } catch {
        config = { mcpServers: {} };
      }
    }

    config.mcpServers.posthog = getDefaultServerConfig(apiKey);

    await fs.promises.writeFile(
      configPath,
      JSON.stringify(config, null, 2),
      'utf8',
    );
  }

  async removeServer(): Promise<void> {
    const configPath = this.getConfigPath();

    if (!fs.existsSync(configPath)) {
      return;
    }

    try {
      const configContent = await fs.promises.readFile(configPath, 'utf8');
      const config = CursorMCPConfig.parse(JSON.parse(configContent));

      if (config.mcpServers && 'posthog' in config.mcpServers) {
        delete config.mcpServers.posthog;

        await fs.promises.writeFile(
          configPath,
          JSON.stringify(config, null, 2),
          'utf8',
        );
      }
    } catch {
      // If we can't read or parse the config, there's nothing to remove
    }
  }
}
