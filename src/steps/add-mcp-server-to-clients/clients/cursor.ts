import { MCPClient } from '../MCPClient';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';

interface MCPConfig {
  mcpServers: Record<
    string,
    {
      command: string;
      args: string[];
      env?: Record<string, string>;
    }
  >;
}

export class CursorMCPClient extends MCPClient {
  name = 'Cursor';
  private getConfigPath(): string {
    return path.join(os.homedir(), '.cursor', 'mcp.json');
  }

  async isClientInstalled(): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        const platform = os.platform();

        if (platform === 'darwin') {
          // macOS: Check if Cursor.app exists in Applications
          const cursorAppPath = '/Applications/Cursor.app';
          if (fs.existsSync(cursorAppPath)) {
            return true;
          }

          // Also check if cursor command is available in PATH
          try {
            execSync('which cursor', { stdio: 'ignore' });
            resolve(true);
          } catch {
            // cursor command not found
            resolve(false);
          }
        } else if (platform === 'win32') {
          // Windows: Check common installation paths
          const possiblePaths = [
            path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'cursor'),
            path.join(os.homedir(), 'AppData', 'Local', 'cursor'),
            'C:\\Program Files\\Cursor',
            'C:\\Program Files (x86)\\Cursor',
          ];

          for (const cursorPath of possiblePaths) {
            if (fs.existsSync(cursorPath)) {
              resolve(true);
            }
          }

          // Also try to run cursor command
          try {
            execSync('where cursor', { stdio: 'ignore' });
            resolve(true);
          } catch {
            // cursor command not found
            resolve(false);
          }
        }

        resolve(false);
      } catch {
        resolve(false);
      }
    });
  }

  async isServerInstalled(): Promise<boolean> {
    try {
      const configPath = this.getConfigPath();

      if (!fs.existsSync(configPath)) {
        return false;
      }

      const configContent = await fs.promises.readFile(configPath, 'utf8');
      const config: MCPConfig = JSON.parse(configContent);

      return 'posthog' in (config.mcpServers || {});
    } catch {
      return false;
    }
  }

  async addServer(apiKey: string): Promise<void> {
    const configPath = this.getConfigPath();
    const configDir = path.dirname(configPath);

    await fs.promises.mkdir(configDir, { recursive: true });

    let config: MCPConfig = { mcpServers: {} };

    if (fs.existsSync(configPath)) {
      try {
        const existingContent = await fs.promises.readFile(configPath, 'utf8');
        config = JSON.parse(existingContent);
      } catch {
        config = { mcpServers: {} };
      }
    }

    config.mcpServers.posthog = {
      command: 'npx',
      args: [
        '-y',
        'mcp-remote@latest',
        'https://mcp.posthog.com/sse',
        '--header',
        `Authorization:\${POSTHOG_API_TOKEN}`,
      ],
      env: {
        POSTHOG_API_TOKEN: `Bearer ${apiKey}`,
      },
    };

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
      const config: MCPConfig = JSON.parse(configContent);

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
