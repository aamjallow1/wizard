import {
  abort,
  getOrAskForProjectData,
  askForCloudRegion,
  getPackageDotJson,
} from '../utils/clack-utils';
import clack from '../utils/clack';
import { WizardOptions } from '../utils/types';
import * as fs from 'fs/promises';
import * as path from 'path';
import chalk from 'chalk';
import { query } from '../utils/query';
import { z } from 'zod';
import { getAllFilesInProject, updateFile } from '../utils/file-utils';
import { getPackageVersion, hasPackageInstalled } from '../utils/package-json';
import * as semver from 'semver';
import { enableDebugLogs, debug } from '../utils/debug';

// Schema for file selection from AI
const FileSelectionSchema = z.object({
  files: z.array(z.string()).max(10),
});

// Schema for enhanced file with events
const EnhancedFileSchema = z.object({
  filePath: z.string(),
  content: z.string(),
  events: z.array(
    z.object({
      name: z.string(),
      description: z.string(),
    }),
  ),
});

export async function runEventSetupWizard(
  options: WizardOptions,
): Promise<void> {
  if (options.debug) {
    enableDebugLogs();
  }

  clack.intro(
    `Let's do a first pass on PostHog event tracking for your project.
    
    We'll start by analyzing your project structure, then choose up to ten files to enhance. Use git to discard any events you're not happy with.

    This will give you a starting point, then you can add any events that we missed.
    `,
  );

  const cloudRegion = options.cloudRegion ?? (await askForCloudRegion());

  const { wizardHash } = await getOrAskForProjectData({
    ...options,
    cloudRegion,
  });

  // Check if this is a Next.js 15.3+ project with instrumentation-client
  const packageJson = await getPackageDotJson(options);
  const isNextJs = hasPackageInstalled('next', packageJson);

  if (!isNextJs) {
    return abort('This feature is only available for Next.js projects.');
  }

  const nextVersion = getPackageVersion('next', packageJson);
  const isNext15_3Plus = nextVersion && semver.gte(nextVersion, '15.3.0');

  if (!isNext15_3Plus) {
    return abort('This feature requires Next.js 15.3.0 or higher.');
  }

  // Check for instrumentation-client file
  const allFiles = await getAllFilesInProject(options.installDir);
  const instrumentationFiles = allFiles.filter(
    (f) =>
      f.includes('instrumentation') &&
      (f.endsWith('.ts') || f.endsWith('.js')) &&
      (f.includes('client') || f.includes('Client')),
  );

  if (instrumentationFiles.length === 0) {
    return abort(
      'No instrumentation-client file found. Please set up Next.js instrumentation first.',
    );
  }

  // Get the project file tree
  const s = clack.spinner();
  s.start('Analyzing your project structure');

  const projectFiles = await getAllFilesInProject(options.installDir);
  const relativeFiles = projectFiles
    .map((f) => path.relative(options.installDir, f))
    .filter((f) => {
      // Exclude instrumentation files and next.config
      const isInstrumentation =
        f.includes('instrumentation') &&
        (f.endsWith('.ts') || f.endsWith('.js'));
      const isNextConfig = f.startsWith('next.config.') || f === 'next.config';
      return !isInstrumentation && !isNextConfig;
    });

  debug('Total files found:', projectFiles.length);
  debug('Files after filtering:', relativeFiles.length);
  s.stop('Project structure analyzed');

  // Check if server-side PostHog helper exists
  const posthogHelperJsPath = path.join(
    options.installDir,
    'app',
    'posthog.js',
  );
  const posthogHelperTsPath = path.join(
    options.installDir,
    'app',
    'posthog.ts',
  );
  const hasPosthogHelper =
    (await fs
      .access(posthogHelperJsPath)
      .then(() => true)
      .catch(() => false)) ||
    (await fs
      .access(posthogHelperTsPath)
      .then(() => true)
      .catch(() => false));

  if (!hasPosthogHelper) {
    s.start('Creating server-side PostHog helper...');

    // Check if project uses TypeScript
    const tsConfigPath = path.join(options.installDir, 'tsconfig.json');
    const isTypeScript = await fs
      .access(tsConfigPath)
      .then(() => true)
      .catch(() => false);

    const helperContent = isTypeScript
      ? `// app/posthog.ts
import { PostHog } from 'posthog-node'

export default function PostHogClient(): PostHog {
  const posthogClient = new PostHog(
    process.env.NEXT_PUBLIC_POSTHOG_KEY!,
    {
      host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
      flushAt: 1,
      flushInterval: 0
    }
  )
  return posthogClient
}
`
      : `// app/posthog.js
import { PostHog } from 'posthog-node'

export default function PostHogClient() {
  const posthogClient = new PostHog(
    process.env.NEXT_PUBLIC_POSTHOG_KEY,
    {
      host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
      flushAt: 1,
      flushInterval: 0
    }
  )
  return posthogClient
}
`;

    try {
      // Ensure app directory exists
      const appDir = path.join(options.installDir, 'app');
      await fs.mkdir(appDir, { recursive: true });

      // Write the helper file
      const targetPath = isTypeScript
        ? posthogHelperTsPath
        : posthogHelperJsPath;
      await fs.writeFile(targetPath, helperContent);
      s.stop(
        `Created server-side PostHog helper at app/posthog.${isTypeScript ? 'ts' : 'js'
        }`,
      );
    } catch (error) {
      s.stop('Failed to create server-side PostHog helper');
      debug('Error creating PostHog helper:', error);
    }
  }

  // Send file tree to AI to get 10 most useful files
  s.start('Selecting some files to enhance with events...');

  const fileSelectionPrompt = `Given this Next.js 15.3+ project structure and package.json, select the 10 most useful files for adding PostHog analytics events. Focus on:
  - User interaction points (buttons, forms, navigation)
  - Key user flows (auth, checkout, main features)
  - Business-critical paths
  - Files that represent important user actions
  
  Package.json:
  ${JSON.stringify(packageJson, null, 2)}
  
  Project files:
  ${relativeFiles.join('\n')}
  
  Return exactly 10 file paths that would benefit most from analytics tracking.`;

  let selectedFiles: string[] = [];
  try {
    const response = await query({
      message: fileSelectionPrompt,
      model: 'gemini-2.5-flash',
      region: cloudRegion,
      schema: FileSelectionSchema,
      wizardHash,
    });
    selectedFiles = response.files;
    s.stop(`Selected ${selectedFiles.length} files for event tracking`);
  } catch (error) {
    s.stop('Failed to select files');
    return abort('Could not analyze project structure. Please try again.');
  }

  // Read the selected files and enhance them with events
  clack.log.info('Files selected for event tracking:');
  selectedFiles.forEach((file, index) => {
    clack.log.info(`  ${index + 1}. ${file}`);
  });

  const enhancedFiles: Array<{
    filePath: string;
    events: Array<{ name: string; description: string }>;
  }> = [];

  clack.log.info(
    "\nEnhancing files with event tracking. Changes will be applied as they come in. Use your git interface to review new events. Feel free to toss anything you don't like...",
  );

  for (const filePath of selectedFiles) {
    const fileSpinner = clack.spinner();
    fileSpinner.start(`Analyzing ${filePath}`);

    try {
      const fullPath = path.join(options.installDir, filePath);
      const fileContent = await fs.readFile(fullPath, 'utf8');

      // Determine if this is client or server code
      const isAPIRoute =
        filePath.includes('/api/') ||
        filePath.includes('route.ts') ||
        filePath.includes('route.js');

      const hasServerActions = fileContent.includes('"use server"');

      const isServerOnlyFile =
        isAPIRoute ||
        // Server-only imports without any JSX
        (!fileContent.includes('return (') &&
          !fileContent.includes('return(') &&
          fileContent.includes('import ') &&
          (fileContent.includes('next/headers') ||
            fileContent.includes('next/cache') ||
            fileContent.includes('@/lib/db') ||
            fileContent.includes('prisma') ||
            fileContent.includes('server-only')));

      const hasClientFeatures =
        fileContent.includes('"use client"') ||
        fileContent.includes('useState') ||
        fileContent.includes('useEffect') ||
        fileContent.includes('useContext') ||
        fileContent.includes('useReducer') ||
        fileContent.includes('useCallback') ||
        fileContent.includes('useMemo') ||
        fileContent.includes('onClick') ||
        fileContent.includes('onChange') ||
        fileContent.includes('onSubmit');

      // Mixed files (RSC with server actions) should be treated as needing client-side tracking
      // Pure API routes or server-only files get server-side tracking
      const isClientCode =
        !isServerOnlyFile &&
        (hasClientFeatures ||
          fileContent.includes('return (') ||
          fileContent.includes('return('));

      const enhancePrompt = `You are enhancing a REAL production ${isClientCode ? 'client-side' : 'server-side'
        } Next.js file with PostHog analytics. This is NOT an example or tutorial - add events to the ACTUAL code provided.

      CRITICAL INSTRUCTIONS:
      - This is a REAL file from a production codebase
      - DO NOT add placeholder comments like "// In a real app..." or "// This is an example..."
      - DO NOT modify the existing business logic or add simulation code
      - DO NOT add any tutorial-style comments
      - ONLY add PostHog event tracking to the existing, real functionality
      
      FORBIDDEN - NEVER DO THESE:
      - NEVER add 'use client' or 'use server' directives at the top of the file, or in functions
      - NEVER use useEffect to track page views or component renders
      - NEVER track events like "page_viewed", "form_viewed", "component_rendered", "flow_started", "page_opened" etc
      - NEVER track that someone simply arrived at or viewed a page
      - NEVER change the file's existing client/server architecture
      - NEVER add events on component mount or render - only on actual user interactions
      
      Technical Rules:
      ${isClientCode
          ? `- This file ${hasServerActions
            ? 'contains server actions but is primarily a client component file'
            : 'is a client-side file'
          }
      - For UI components and client-side code: Import from "posthog-js" and use the existing posthog instance
      - ${hasServerActions
            ? 'For server actions marked with "use server": Import PostHogClient from "@/app/posthog" and use it within those functions only'
            : ''
          }
      - Focus on tracking user interactions in the UI components`
          : `- This is a server-only file (API route or server utility)
      - Import the PostHog helper from "@/app/posthog" using: import PostHogClient from "@/app/posthog"
      - Create a PostHog instance at the start of your server functions using: const posthog = PostHogClient()
      - Remember to call posthog.shutdown() after capturing events to ensure they are sent`
        }
      - Add 1-2 high-value events that track the ACTUAL user actions in this file
      - Use descriptive event names (lowercase-hyphenated) based on what the code ACTUALLY does
      - Include properties that capture REAL data from the existing code
      - Do not change the formatting of the file; only add events
      - Do not set timestamps on events; PostHog will do this automatically
      - Always return the entire file content, not just the changes
      - NEVER add events that correspond to page views; PostHog tracks these automatically
      - NEVER INSERT "use client" or "use server" directives
      ${!isClientCode
          ? '- For server-side code, capture events within async functions and remember to call shutdown() after'
          : ''
        }
      
      File path: ${filePath}
      File content:
      ${fileContent}
      
      IMPORTANT: If this file only renders UI without any user interactions (no buttons, forms, or actions), 
      or if the only possible events would be pageview-like (e.g., "form-viewed", "page-opened", "flow-started"),
      then SKIP THIS FILE by returning the original content unchanged. We only want to track actual user actions,
      not that someone looked at a page.
      
      Return the enhanced file with PostHog tracking added to the EXISTING functionality. List the events you added.`;

      const response = await query({
        message: enhancePrompt,
        model: 'gemini-2.5-pro',
        region: cloudRegion,
        schema: EnhancedFileSchema,
        wizardHash,
      });

      // Apply changes immediately
      if (response.content !== fileContent) {
        await updateFile(
          {
            filePath,
            oldContent: fileContent,
            newContent: response.content,
          },
          options,
        );

        enhancedFiles.push({
          filePath,
          events: response.events,
        });

        fileSpinner.stop(
          `✓ Enhanced ${filePath} with ${response.events.length} events`,
        );
      } else {
        fileSpinner.stop(`No changes needed for ${filePath}`);
      }
    } catch (error) {
      fileSpinner.stop(`✗ Failed to enhance ${filePath}`);
      debug('Error enhancing file:', error);
    }
  }

  // Generate event tracking report
  const generateMarkdown = () => {
    let md = `# Event tracking report\n\n`;
    md += `This document lists all PostHog events that have been automatically added to your Next.js application.\n\n`;
    md += `## Events by File\n\n`;

    enhancedFiles.forEach((file) => {
      if (file.events.length > 0) {
        md += `### ${file.filePath}\n\n`;
        file.events.forEach((event) => {
          md += `- **${event.name}**: ${event.description}\n`;
        });
        md += `\n`;
      }
    });

    md += `\n## Events still awaiting implementation\n`;
    md += `- (you can fill these in)`;

    md += `\n---\n\n`;
    md += `## Next Steps\n\n`;
    md += `1. Review the changes made to your files\n`;
    md += `2. Test that events are being captured correctly\n`;
    md += `3. Create insights and dashboards in PostHog\n`;
    md += `4. Make a list of events we missed above. Knock them out yourself, or give this file to an agent.`;
    md += `Learn more about what to measure with PostHog and why: https://posthog.com/docs/new-to-posthog/getting-hogpilled\n`;
    return md;
  };

  const markdownContent = generateMarkdown();
  const fileName = 'event-tracking-report.md';
  const filePath = path.join(options.installDir, fileName);

  await fs.writeFile(filePath, markdownContent);

  // Summary
  const totalEvents = enhancedFiles.reduce(
    (sum, file) => sum + file.events.length,
    0,
  );

  clack.outro(
    `Success! Added ${chalk.bold(
      totalEvents.toString(),
    )} events across ${chalk.bold(enhancedFiles.length.toString())} files.
    
    Event tracking plan saved to: ${chalk.cyan(fileName)}
    
    Next steps:
    1. Review changes with ${chalk.bold('git diff')}
    2. Revert unwanted changes with ${chalk.bold('git checkout <file>')}
    3. Test that events are being captured
    4. Create insights in PostHog
    `,
  );
}
