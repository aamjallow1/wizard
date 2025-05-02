import { execSync, spawn, spawnSync } from 'child_process';
import { EnvironmentProvider } from '../EnvironmentProvider';
import * as fs from 'fs';
import * as path from 'path';
import type { WizardOptions } from '../../../utils/types';
import { runCommandInteractively } from '../../../utils/cli-utils';
import clack from '../../../utils/clack';
import chalk from 'chalk';

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
    return ['production', 'preview', 'development'];
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

  async uploadEnvironmentVariable(
    key: string,
    value: string,
    environment: string,
  ): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const proc = spawn('vercel', ['env', 'add', key, environment], {
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stderr = '';
      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      proc.stdin.write(value + '\n');
      proc.stdin.end();

      proc.on('close', (code) => {
        if (
          stderr.includes('already exists') ||
          stderr.includes('already been added') ||
          stderr.includes('vercel env rm')
        ) {
          reject(
            new Error(
              `❌ Environment variable ${chalk.cyan(key)} already exists in ${
                this.name
              }. Please upload it manually.`,
            ),
          );
        } else if (code === 0) {
          resolve();
        } else {
          reject(
            new Error(
              `❌ Failed to upload environment variable ${chalk.cyan(key)} to ${
                this.name
              }. Please upload it manually.`,
            ),
          );
        }
      });
    });
  }

  async uploadEnvVars(
    vars: Record<string, string>,
  ): Promise<Record<string, boolean>> {
    const results: Record<string, boolean> = {};

    for (const [key, value] of Object.entries(vars)) {
      const spinner = clack.spinner();

      spinner.start(`Uploading ${chalk.cyan(key)} to ${this.name}...`);
      await Promise.all(
        this.environments.map((environment) =>
          this.uploadEnvironmentVariable(key, value, environment),
        ),
      )
        .then(() => {
          spinner.stop(`✅ Uploaded ${chalk.cyan(key)} to ${this.name}`);
          results[key] = true;
        })
        .catch((err) => {
          spinner.stop(
            err instanceof Error
              ? err.message
              : `❌ Failed to upload environment variables to ${this.name}. Please upload it manually.`,
          );
          results[key] = false;
        });
    }

    return results;
  }
}
