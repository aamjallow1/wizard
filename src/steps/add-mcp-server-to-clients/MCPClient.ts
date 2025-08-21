import * as fs from 'fs';
import * as path from 'path';
import * as jsonc from 'jsonc-parser';
import { getDefaultServerConfig } from './defaults';

export abstract class MCPClient {
  name: string;
  abstract getConfigPath(): Promise<string>;
  abstract getServerPropertyName(): string;
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

  getServerPropertyName(): string {
    return 'mcpServers';
  }

  customizeServerConfig(baseConfig: any): any {
    return baseConfig;
  }

  async isServerInstalled(): Promise<boolean> {
    try {
      const configPath = await this.getConfigPath();

      if (!fs.existsSync(configPath)) {
        return false;
      }

      const configContent = await fs.promises.readFile(configPath, 'utf8');
      const config = jsonc.parse(configContent) as Record<string, any>;
      const serverPropertyName = this.getServerPropertyName();
      return (
        serverPropertyName in config && 'posthog' in config[serverPropertyName]
      );
    } catch {
      return false;
    }
  }

  async addServer(apiKey: string): Promise<{ success: boolean }> {
    return this._addServerType(apiKey, 'sse');
  }

  async _addServerType(
    apiKey: string,
    type: 'sse' | 'streamable-http',
  ): Promise<{ success: boolean }> {
    try {
      const configPath = await this.getConfigPath();
      const configDir = path.dirname(configPath);

      await fs.promises.mkdir(configDir, { recursive: true });

      const serverPropertyName = this.getServerPropertyName();
      let configContent = '';
      let existingConfig = {};

      if (fs.existsSync(configPath)) {
        configContent = await fs.promises.readFile(configPath, 'utf8');
        existingConfig = jsonc.parse(configContent) || {};
      }

      const baseConfig = getDefaultServerConfig(apiKey, type);
      const newServerConfig = this.customizeServerConfig(baseConfig);
      const typedConfig = existingConfig as Record<string, any>;
      if (!typedConfig[serverPropertyName]) {
        typedConfig[serverPropertyName] = {};
      }
      typedConfig[serverPropertyName].posthog = newServerConfig;

      const edits = jsonc.modify(
        configContent,
        [serverPropertyName, 'posthog'],
        newServerConfig,
        {
          formattingOptions: {
            tabSize: 2,
            insertSpaces: true,
          },
        },
      );

      const modifiedContent = jsonc.applyEdits(configContent, edits);

      await fs.promises.writeFile(configPath, modifiedContent, 'utf8');

      return { success: true };
    } catch {
      return { success: false };
    }
  }

  async removeServer(): Promise<{ success: boolean }> {
    try {
      const configPath = await this.getConfigPath();

      if (!fs.existsSync(configPath)) {
        return { success: false };
      }

      const configContent = await fs.promises.readFile(configPath, 'utf8');
      const config = jsonc.parse(configContent) as Record<string, any>;
      const serverPropertyName = this.getServerPropertyName();

      if (
        serverPropertyName in config &&
        'posthog' in config[serverPropertyName]
      ) {
        const edits = jsonc.modify(
          configContent,
          [serverPropertyName, 'posthog'],
          undefined,
          {
            formattingOptions: {
              tabSize: 2,
              insertSpaces: true,
            },
          },
        );

        const modifiedContent = jsonc.applyEdits(configContent, edits);

        await fs.promises.writeFile(configPath, modifiedContent, 'utf8');

        return { success: true };
      }
    } catch {
      //
    }

    return { success: false };
  }
}
