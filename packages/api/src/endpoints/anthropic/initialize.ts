import { EModelEndpoint, AuthKeys } from 'librechat-data-provider';
import type { TVertexAIConfig } from 'librechat-data-provider';
import type {
  BaseInitializeParams,
  InitializeResultBase,
  AnthropicConfigOptions,
  AnthropicCredentials,
} from '~/types';
import { checkUserKeyExpiry, isEnabled } from '~/utils';
import { getLLMConfig } from './llm';
import { loadAnthropicVertexCredentials, getVertexCredentialOptions } from './vertex';

/**
 * Initializes Anthropic endpoint configuration.
 *
 * @param params - Configuration parameters
 * @returns Promise resolving to Anthropic configuration options
 * @throws Error if API key is not provided
 */
export async function initializeAnthropic({
  req,
  endpoint,
  model_parameters,
  db,
}: BaseInitializeParams): Promise<InitializeResultBase> {
  void endpoint;
  const appConfig = req.config;
  const { ANTHROPIC_API_KEY, ANTHROPIC_REVERSE_PROXY, PROXY } = process.env;
  const { key: expiresAt } = req.body;

  let credentials: AnthropicCredentials = {};
  let vertexOptions: { region?: string; projectId?: string } | undefined;

  /** @type {undefined | TVertexAIConfig} */
  const vertexConfig = appConfig?.endpoints?.[EModelEndpoint.anthropic]?.vertexConfig as
    | TVertexAIConfig
    | undefined;

  // Check for Vertex AI configuration: YAML config takes priority over env var
  const useVertexAI = vertexConfig?.enabled || isEnabled(process.env.ANTHROPIC_USE_VERTEX);

  if (useVertexAI) {
    // Load credentials with optional YAML config overrides
    const credentialOptions = vertexConfig ? getVertexCredentialOptions(vertexConfig) : undefined;
    credentials = await loadAnthropicVertexCredentials(credentialOptions);

    // Store vertex options for client creation
    if (vertexConfig) {
      vertexOptions = {
        region: vertexConfig.region,
        projectId: vertexConfig.projectId,
      };
    }
  } else {
    const isUserProvided = ANTHROPIC_API_KEY === 'user_provided';
    const anthropicApiKey = isUserProvided
      ? await db.getUserKey({ userId: req.user?.id ?? '', name: EModelEndpoint.anthropic })
      : ANTHROPIC_API_KEY;

    if (!anthropicApiKey) {
      throw new Error('Anthropic API key not provided. Please provide it again.');
    }

    if (expiresAt && isUserProvided) {
      checkUserKeyExpiry(expiresAt, EModelEndpoint.anthropic);
    }
    credentials[AuthKeys.ANTHROPIC_API_KEY] = anthropicApiKey;
  }

  let clientOptions: AnthropicConfigOptions = {};

  /** @type {undefined | TBaseEndpoint} */
  const anthropicConfig = appConfig?.endpoints?.[EModelEndpoint.anthropic];

  if (anthropicConfig) {
    clientOptions = {
      ...clientOptions,
      // Note: _lc_stream_delay is set on modelOptions in the result
    };
  }

  const allConfig = appConfig?.endpoints?.all;

  clientOptions = {
    proxy: PROXY ?? undefined,
    reverseProxyUrl: ANTHROPIC_REVERSE_PROXY ?? undefined,
    modelOptions: {
      ...(model_parameters ?? {}),
      user: req.user?.id,
    },
    // Pass Vertex AI options if configured
    ...(vertexOptions && { vertexOptions }),
    // Pass full Vertex AI config including model mappings
    ...(vertexConfig && { vertexConfig }),
    ...clientOptions,
  };

  const result = getLLMConfig(credentials, clientOptions);

  // Apply stream rate delay
  if (anthropicConfig?.streamRate) {
    (result.llmConfig as Record<string, unknown>)._lc_stream_delay = anthropicConfig.streamRate;
  }

  if (allConfig?.streamRate) {
    (result.llmConfig as Record<string, unknown>)._lc_stream_delay = allConfig.streamRate;
  }

  return result;
}
