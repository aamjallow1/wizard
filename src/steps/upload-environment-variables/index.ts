import { traceStep } from "../../telemetry";
import { analytics } from "../../utils/analytics";
import clack from "../../utils/clack";
import { abortIfCancelled } from "../../utils/clack-utils";
import type { WizardOptions } from "../../utils/types";
import { EnvironmentProvider } from "./EnvironmentProvider";
import { VercelEnvironmentProvider } from "./providers/vercel";


export const uploadEnvironmentVariablesStep = async (envVars: Record<string, string>, options: WizardOptions) => {
  const providers: EnvironmentProvider[] = [new VercelEnvironmentProvider(options)];

  let provider: EnvironmentProvider | null = null;

  for (const p of providers) {
    if (await p.detect()) {
      provider = p;
      break;
    }
  }

  if (!provider) {
    analytics.capture('wizard interaction', {
      action: "not uploading environment variables",
      reason: "no environment provider found",
    });
    return;
  }

  const upload: boolean = await abortIfCancelled(
    clack.select({
      message: `It looks like you are using ${provider.name}. Would you like to upload the PostHog environment variables?`,
      options: [
        { value: true, label: 'Yes' },
        { value: false, label: 'No' },
      ],
    }),
  );

  if (!upload) {
    analytics.capture('wizard interaction', {
      action: "not uploading environment variables",
      reason: "user declined to upload",
      provider: provider.name,
    });
    return;
  }

  await traceStep('uploading environment variables', async () => {
    await provider.uploadEnvVars(envVars);
  });

  analytics.capture('wizard interaction', {
    action: "uploaded environment variables",
    provider: provider.name,
  });
};

