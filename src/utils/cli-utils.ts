import chalk from 'chalk';
import { spawn } from 'child_process';
import clack from './clack';


export const runCommandInteractively = async (
  command: string,
  args: string[] = [],
  options: { cwd?: string; env?: NodeJS.ProcessEnv } = {}
): Promise<void> => {
  clack.log.info(`\n🔧 Running: ${chalk.bold(chalk.cyan(`${command} ${args.join(' ')}`))}\n`);

  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, {
      stdio: 'inherit',
      cwd: options.cwd || process.cwd(),
      env: { ...process.env, ...options.env },
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Command failed with exit code ${code}`));
      }
    });
  });
};