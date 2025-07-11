import axios from 'axios';
import type { ZodSchema } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { AIModel, CloudRegion } from './types';
import { getCloudUrlFromRegion } from './urls';

export const query = async <S>({
  message,
  model = 'o4-mini',
  region,
  schema,
  wizardHash,
}: {
  message: string;
  model?: AIModel;
  region: CloudRegion;
  schema: ZodSchema<S>;
  wizardHash: string;
}): Promise<S> => {
  const jsonSchema = zodToJsonSchema(schema, 'schema').definitions;

  const response = await axios.post<{ data: unknown }>(
    `${getCloudUrlFromRegion(region)}/api/wizard/query`,
    {
      message,
      model,
      json_schema: { ...jsonSchema, name: 'schema', strict: true },
    },
    {
      headers: {
        'X-PostHog-Wizard-Hash': wizardHash,
      },
    },
  );

  const validation = schema.safeParse(response.data.data);

  if (!validation.success) {
    throw new Error(
      `Invalid response from wizard: ${validation.error.message}`,
    );
  }

  return validation.data;
};
