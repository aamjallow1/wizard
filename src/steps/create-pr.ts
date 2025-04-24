import chalk from 'chalk';
import type { Integration } from '../lib/constants';
import { traceStep } from '../telemetry';
import { analytics } from '../utils/analytics';
import clack from '../utils/clack';
import { abortIfCancelled, isInGitRepo } from '../utils/clack-utils';
import * as childProcess from 'node:child_process';
import { getPRDescription } from '../lib/messages';

export const PR_CONFIG = {
  defaultBranchName: 'posthog-integration',
  defaultTitle: 'feat: add PostHog integration',
};

async function getCurrentBranch(installDir: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    childProcess.exec(
      `git rev-parse --abbrev-ref HEAD`,
      { cwd: installDir },
      (err, stdout, stderr) => {
        if (err) {
          reject(new Error(`Failed to detect current branch: ${stderr}`));
        } else {
          resolve(stdout.trim());
        }
      },
    );
  });
}

interface CreatePRStepOptions {
  installDir: string;
  integration: Integration;
  addedEditorRules: boolean;
}

export async function createPRStep({
  installDir,
  integration,
  addedEditorRules,
}: CreatePRStepOptions): Promise<string | undefined> {
  return traceStep('create-pr', async () => {
    if (!isInGitRepo()) {
      clack.log.warn('Not in a git repository. Cannot create a pull request.');
      return;
    }

    let baseBranch: string;
    try {
      baseBranch = await getCurrentBranch(installDir);
    } catch (error: unknown) {
      analytics.capture('wizard interaction', {
        action: 'failed to get current branch',
        error: error instanceof Error ? error?.message : 'Unknown error',
        integration,
      });
      return;
    }

    // if (!['main', 'master'].includes(baseBranch)) {
    //   clack.log.info(
    //     `Current branch is "${baseBranch}". Skipping PR creation since we're not on "main" or "master".`,
    //   );
    //   return;
    // }

    try {
      await new Promise<void>((resolve, reject) => {
        childProcess.exec(
          'gh auth status',
          { cwd: installDir },
          (err, _stdout, stderr) => {
            if (err) {
              reject(new Error(stderr || 'Not authenticated with GitHub CLI'));
            } else {
              resolve();
            }
          },
        );
      });
    } catch {
      analytics.capture('wizard interaction', {
        action: 'not logged into github',
        error: 'Not authenticated with GitHub CLI',
        integration,
      });
      return;
    }

    const newBranch = PR_CONFIG.defaultBranchName;
    try {
      await new Promise<void>((resolve, reject) => {
        childProcess.exec(
          `git rev-parse --verify ${newBranch}`,
          { cwd: installDir },
          (err) => {
            if (!err) {
              reject(new Error(`Branch '${newBranch}' already exists.`));
            } else {
              resolve();
            }
          },
        );
      });
    } catch (_error: unknown) {
      analytics.capture('wizard interaction', {
        action: 'branch already exists',
        error: _error instanceof Error ? _error?.message : 'Unknown error',
        integration,
      });
      return;
    }

    const prTitle = PR_CONFIG.defaultTitle;
    const prDescription = getPRDescription({
      integration,
      addedEditorRules,
    });

    const createPR = await abortIfCancelled(
      clack.select({
        message: 'Would you like to create a PR automatically?',
        initialValue: true,
        options: [
          {
            value: true,
            label: 'Yes',
            hint: 'We will create a PR for you',
          },
          {
            value: false,
            label: 'No',
            hint: 'You can create a PR manually later',
          },
        ],
      }),
    );

    if (!createPR) {
      clack.log.info('Skipping PR creation');
      return;
    }

    // Create a new branch
    try {
      await new Promise<void>((resolve, reject) => {
        childProcess.exec(
          `git checkout -b ${newBranch}`,
          { cwd: installDir },
          (err, stdout, stderr) => {
            if (err) {
              reject(
                new Error(`Failed to create branch '${newBranch}': ${stderr}`),
              );
            } else {
              resolve();
            }
          },
        );
      });
    } catch (createBranchError: unknown) {
      analytics.capture('wizard interaction', {
        action: 'failed to create branch',
        error:
          createBranchError instanceof Error
            ? createBranchError?.message
            : 'Unknown error',
        integration,
      });
      return;
    }

    // Stage and commit changes
    const commitSpinner = clack.spinner();
    commitSpinner.start('Staging and committing changes...');
    try {
      await new Promise<void>((resolve, reject) => {
        childProcess.exec(
          `git add . && git commit -m "${prTitle}"`,
          { cwd: installDir },
          (err, stdout, stderr) => {
            if (err) {
              reject(new Error(`Failed to commit changes: ${stderr}`));
            } else {
              resolve();
            }
          },
        );
      });
    } catch (commitError: unknown) {
      commitSpinner.stop('Failed to commit changes.');
      analytics.capture('wizard interaction', {
        action: 'failed to commit changes',
        error:
          commitError instanceof Error ? commitError?.message : 'Unknown error',
        integration,
      });
      return;
    }
    commitSpinner.stop('Changes committed successfully.');

    // Push the branch to remote
    const pushSpinner = clack.spinner();
    pushSpinner.start('Pushing branch to remote...');
    try {
      await new Promise<void>((resolve, reject) => {
        childProcess.exec(
          `git push -u origin ${newBranch}`,
          { cwd: installDir },
          (err, _stdout, stderr) => {
            if (err) {
              reject(new Error(`Failed to push branch: ${stderr}`));
            } else {
              resolve();
            }
          },
        );
      });
    } catch (pushError: unknown) {
      pushSpinner.stop('Failed to push branch.');
      analytics.capture('wizard interaction', {
        action: 'failed to push branch',
        error:
          pushError instanceof Error ? pushError?.message : 'Unknown error',
        integration,
      });
      return;
    }
    pushSpinner.stop('Branch pushed successfully.');

    const prSpinner = clack.spinner();
    prSpinner.start(
      `Creating a PR on branch '${newBranch}' with base '${baseBranch}'...`,
    );

    let result = '';

    try {
      await new Promise<void>((resolve, reject) => {
        childProcess.exec(
          `gh pr create --base ${baseBranch} --head ${newBranch} --title "${prTitle}" --body "${prDescription}"`,
          { cwd: installDir },
          (err, stdout, stderr) => {
            if (err) {
              reject(new Error(`Failed to create PR: ${stderr}`));
            } else {
              try {
                result = stdout;
                resolve();
              } catch (parseError) {
                reject(new Error('Failed to parse PR URL from response'));
              }
            }
          },
        );
      });
      prSpinner.stop(
        `Successfully created PR! 🎉 You can review it here: ${chalk.cyan(
          result,
        )}`,
      );
    } catch (prError: unknown) {
      prSpinner.stop(`Failed to create PR on branch '${newBranch}'.`);
      analytics.capture('wizard interaction', {
        action: 'failed to create pr',
        error: prError instanceof Error ? prError?.message : 'Unknown error',
        integration,
      });
      return;
    }

    analytics.capture('wizard interaction', {
      action: 'created pr',
      branch: newBranch,
      base_branch: baseBranch,
      integration,
    });

    return result;
  });
}
