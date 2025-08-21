import z from 'zod';
import * as path from 'path';
import * as os from 'os';
import { DefaultMCPClient } from '../MCPClient';

export const VisualStudioCodeMCPConfig = z
  .object({
    servers: z.record(
      z.string(),
      z.object({
        command: z.string().optional(),
        args: z.array(z.string()).optional(),
        env: z.record(z.string(), z.string()).optional(),
      }),
    ),
  })
  .passthrough();

export type VisualStudioCodeMCPConfig = z.infer<
  typeof VisualStudioCodeMCPConfig
>;

export class VisualStudioCodeClient extends DefaultMCPClient {
  name = 'Visual Studio Code';

  getServerPropertyName(): string {
    return 'servers';
  }

  async isClientSupported(): Promise<boolean> {
    return Promise.resolve(
      process.platform === 'darwin' ||
        process.platform === 'win32' ||
        process.platform === 'linux',
    );
  }

  async getConfigPath(): Promise<string> {
    const homeDir = os.homedir();
    const isWindows = process.platform === 'win32';
    const isMac = process.platform === 'darwin';
    const isLinux = process.platform === 'linux';

    if (isMac) {
      return Promise.resolve(
        path.join(
          homeDir,
          'Library',
          'Application Support',
          'Code',
          'User',
          'mcp.json',
        ),
      );
    }

    if (isWindows) {
      return Promise.resolve(
        path.join(process.env.APPDATA || '', 'Code', 'User', 'mcp.json'),
      );
    }

    if (isLinux) {
      return Promise.resolve(
        path.join(homeDir, '.config', 'Code', 'User', 'mcp.json'),
      );
    }

    throw new Error(`Unsupported platform: ${process.platform}`);
  }
}
