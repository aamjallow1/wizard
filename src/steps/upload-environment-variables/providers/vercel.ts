import { execSync, spawn, spawnSync } from 'child_process';
import { EnvironmentProvider } from '../EnvironmentProvider';
import * as fs from 'fs';
import * as path from 'path';
import type { WizardOptions } from '../../../utils/types';
import { runCommandInteractively } from '../../../utils/cli-utils';

export class VercelEnvironmentProvider extends EnvironmentProvider {
  name = 'Vercel';

  constructor(options: WizardOptions) {
    super(options);
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async detect(): Promise<boolean> {
    return (
      this.hasVercelCli() && this.isProjectLinked() && this.isAuthenticated()
    );
  }

  hasDotVercelDir(): boolean {
    const dotVercelDir = path.join(this.options.installDir, '.vercel');
    return fs.existsSync(dotVercelDir);
  }

  hasVercelCli(): boolean {
    try {
      execSync('vercel --version', { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }

  get environments(): string[] {
    return ['production'];
  }

  get dotEnvPath(): string {
    return path.join(this.options.installDir, '.env');
  }

  isProjectLinked(): boolean {
    return fs.existsSync(
      path.join(this.options.installDir, '.vercel', 'project.json'),
    );
  }

  isAuthenticated(): boolean {
    const result = spawnSync('vercel', ['whoami'], {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'], // suppress prompts
      env: {
        ...process.env,
        FORCE_COLOR: '0', // avoid ANSI formatting
        CI: '1', // hint to CLI that it's a non-interactive env
      },
    });

    const output = (result.stdout + result.stderr).toLowerCase();

    if (
      output.includes('log in to vercel') ||
      output.includes('vercel login') ||
      result.status !== 0
    ) {
      return false;
    }

    return true;
  }

  async linkProject(): Promise<void> {
    await runCommandInteractively('vercel link', undefined, {
      cwd: this.options.installDir,
    });
  }

  async uploadEnvVars(vars: Record<string, string>): Promise<void> {
    for (const [key, value] of Object.entries(vars)) {
      for (const environment of this.environments) {
        await new Promise<void>((resolve, reject) => {
          const proc = spawn(
            'vercel',
            ['env', 'add', key, environment, '--force'],
            {
              stdio: ['pipe', 'inherit', 'inherit'],
            },
          );
          proc.stdin.write(value + '\n');
          proc.stdin.end();
          proc.on('close', (code) =>
            code === 0
              ? resolve()
              : reject(new Error(`Failed to upload ${key}`)),
          );
        });
      }
    }
  }
}
