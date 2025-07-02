import axios from 'axios';
import type { ZodSchema } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { AIModel, CloudRegion } from './types';
import { getCloudUrlFromRegion } from './urls';
import { analytics } from './analytics';
import { AxiosError } from 'axios';
import { debug } from './debug';

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
  const fullSchema = zodToJsonSchema(schema, 'schema');
  const jsonSchema = fullSchema.definitions;
  
  debug('Full schema:', JSON.stringify(fullSchema, null, 2));
  debug('Query request:', {
    url: `${getCloudUrlFromRegion(region)}/api/wizard/query`,
    wizardHash,
    message: message.substring(0, 100) + '...',
    json_schema: { ...jsonSchema, name: 'schema', strict: true },
  });

  try {
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

    debug('Query response:', {
      status: response.status,
      data: response.data,
    });

    const validation = schema.safeParse(response.data.data);

    if (!validation.success) {
      debug('Validation error:', validation.error);
      throw new Error(`Invalid response from wizard: ${validation.error.message}`);
    }

    return validation.data;
  } catch (error) {
    debug('Query error:', error);
    
    if (error instanceof AxiosError) {
      analytics.captureException(error, {
        response_status_code: error.response?.status,
        message,
        model,
        json_schema: jsonSchema,
        type: 'wizard_query_error',
      });
      
      debug('Axios error details:', {
        status: error.response?.status,
        data: error.response?.data,
        headers: error.response?.headers,
      });
    }
    
    throw error;
  }
};
