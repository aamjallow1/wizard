import * as fs from 'fs';
import * as path from 'path';
import { getDefaultServerConfig } from './defaults';
import { merge } from 'lodash';

export abstract class MCPClient {
  name: string;
  abstract getConfigPath(): Promise<string>;
  abstract isServerInstalled(): Promise<boolean>;
  abstract addServer(apiKey: string): Promise<{ success: boolean }>;
  abstract removeServer(): Promise<{ success: boolean }>;
  abstract isClientSupported(): Promise<boolean>;
}

export abstract class DefaultMCPClient extends MCPClient {
  name = 'Default';

  constructor() {
    super();
  }
  async isServerInstalled(): Promise<boolean> {
    try {
      const configPath = await this.getConfigPath();

      if (!fs.existsSync(configPath)) {
        return false;
      }

      const configContent = await fs.promises.readFile(configPath, 'utf8');
      const config = JSON.parse(configContent);

      return 'mcpServers' in config && 'posthog' in config.mcpServers;
    } catch {
      return false;
    }
  }

  async addServer(apiKey: string): Promise<{ success: boolean }> {
    try {
      const configPath = await this.getConfigPath();
      const configDir = path.dirname(configPath);

      await fs.promises.mkdir(configDir, { recursive: true });

      const newServerConfig = {
        mcpServers: {
          posthog: getDefaultServerConfig(apiKey),
        },
      };

      let existingConfig = {};

      if (fs.existsSync(configPath)) {
        const existingContent = await fs.promises.readFile(configPath, 'utf8');
        existingConfig = JSON.parse(existingContent);
      }

      const mergedConfig = merge({}, existingConfig, newServerConfig);

      await fs.promises.writeFile(
        configPath,
        JSON.stringify(mergedConfig, null, 2),
        'utf8',
      );

      return { success: true };
    } catch {
      //
    }
    return { success: false };
  }

  async removeServer(): Promise<{ success: boolean }> {
    try {
      const configPath = await this.getConfigPath();

      if (!fs.existsSync(configPath)) {
        return { success: false };
      }

      const configContent = await fs.promises.readFile(configPath, 'utf8');
      const config = JSON.parse(configContent);

      if ('mcpServers' in config && 'posthog' in config.mcpServers) {
        delete config.mcpServers.posthog;

        await fs.promises.writeFile(
          configPath,
          JSON.stringify(config, null, 2),
          'utf8',
        );

        return { success: true };
      }
    } catch {
      //
    }

    return { success: false };
  }
}
