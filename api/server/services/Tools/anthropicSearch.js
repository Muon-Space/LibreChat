const { z } = require('zod');
const { ChatAnthropic, tools: anthropicTools } = require('@langchain/anthropic');
const { tool } = require('@langchain/core/tools');
const { Tools, Constants, AuthKeys } = require('librechat-data-provider');
const { logger } = require('@librechat/data-schemas');
const {
  isAnthropicVertexCredentials,
  createAnthropicVertexClient,
} = require('@librechat/api');

/**
 * Extracts search results from Anthropic's web search response
 * @param {import('@langchain/core/messages').AIMessage} response - The response from ChatAnthropic
 * @returns {object} Formatted search results
 */
function extractSearchResults(response) {
  const results = {
    organic: [],
    topStories: [],
    images: [],
    relatedSearches: [],
  };

  // The response content may contain web_search_result blocks
  if (Array.isArray(response.content)) {
    for (const block of response.content) {
      if (block.type === 'web_search_result') {
        results.organic.push({
          position: results.organic.length + 1,
          title: block.title || '',
          link: block.url || '',
          snippet: block.snippet || '',
          date: block.page_age || undefined,
          attribution: extractDomain(block.url),
        });
      }
    }
  }

  return results;
}

/**
 * Extracts domain from URL for attribution
 * @param {string} url - The URL
 * @returns {string} The domain
 */
function extractDomain(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

/**
 * Formats search results for LLM consumption
 * @param {number} turn - The turn number
 * @param {object} results - The search results
 * @returns {object} Formatted output with text and references
 */
function formatResultsForLLM(turn, results) {
  const lines = [];
  const references = [];

  if (results.organic && results.organic.length > 0) {
    lines.push('## Search Results\n');
    for (let i = 0; i < results.organic.length; i++) {
      const result = results.organic[i];
      lines.push(`### ${i + 1}. ${result.title}`);
      lines.push(`Source: ${result.attribution}`);
      if (result.snippet) {
        lines.push(`${result.snippet}`);
      }
      lines.push(`URL: ${result.link}`);
      lines.push('');

      references.push({
        turn,
        type: 'search',
        index: i,
        url: result.link,
        title: result.title,
      });
    }
  }

  return {
    output: lines.join('\n'),
    references,
  };
}

/**
 * Creates an Anthropic web search tool using @langchain/anthropic
 *
 * This tool wraps Anthropic's native web search capability in a LangChain tool,
 * allowing it to be used with approval flows and other LangChain features.
 *
 * Supports both direct Anthropic API and Vertex AI authentication:
 * - For direct API: pass { apiKey: 'your-key' }
 * - For Vertex AI: pass { credentials: { GOOGLE_SERVICE_KEY: {...} }, vertexOptions: { region, projectId } }
 *
 * @param {object} config - Configuration options
 * @param {string} [config.apiKey] - Anthropic API key (for direct API access)
 * @param {object} [config.credentials] - Credentials object (supports both API key and Vertex AI)
 * @param {object} [config.vertexOptions] - Vertex AI options (region, projectId)
 * @param {string} [config.model='claude-sonnet-4-5-20250929'] - Model to use for search
 * @param {function} [config.onSearchResults] - Callback for search results
 * @param {function} [config.onGetHighlights] - Callback for highlights
 * @param {object} [config.webSearchOptions] - Options for webSearch_20250305()
 * @returns {import('@langchain/core/tools').DynamicStructuredTool} The search tool
 */
function createAnthropicSearchTool(config = {}) {
  const {
    apiKey,
    credentials,
    vertexOptions,
    model = 'claude-sonnet-4-5-20250929',
    onSearchResults,
    onGetHighlights,
    webSearchOptions = {},
  } = config;

  // Build credentials object from apiKey if credentials not provided
  const creds = credentials || (apiKey ? { [AuthKeys.ANTHROPIC_API_KEY]: apiKey } : null);

  if (!creds) {
    throw new Error('Anthropic credentials are required for Anthropic search tool');
  }

  // Check if using Vertex AI
  const isVertex = isAnthropicVertexCredentials(creds);

  let llmConfig = { model };

  if (isVertex) {
    logger.info('[AnthropicSearch] Using Vertex AI for web search');
    // Create a custom client for Vertex AI
    const clientOptions = {
      defaultHeaders: {
        'anthropic-beta': 'web-search-2025-03-05',
      },
    };
    llmConfig.createClient = () => createAnthropicVertexClient(creds, clientOptions, vertexOptions);
  } else {
    // Direct API access
    const directApiKey = creds[AuthKeys.ANTHROPIC_API_KEY];
    if (!directApiKey) {
      throw new Error('Anthropic API key is required for direct API access');
    }
    llmConfig.apiKey = directApiKey;
  }

  const llm = new ChatAnthropic(llmConfig);

  const searchSchema = z.object({
    query: z.string().describe('The search query to look up on the web'),
  });

  return tool(
    async ({ query }, runnableConfig) => {
      logger.info(`[AnthropicSearch] Executing search for: ${query}`);

      try {
        // Use Anthropic's web search tool
        const response = await llm.invoke(
          `Search the web for: ${query}. Return the search results.`,
          {
            tools: [anthropicTools.webSearch_20250305(webSearchOptions)],
          },
        );

        // Extract search results from the response
        const searchResults = extractSearchResults(response);

        // Call the onSearchResults callback if provided
        if (onSearchResults) {
          onSearchResults(
            { success: true, data: searchResults },
            runnableConfig,
          );
        }

        // Format results for LLM
        const turn = runnableConfig?.toolCall?.turn ?? 0;
        const { output, references } = formatResultsForLLM(turn, searchResults);

        // Return in the format expected by the agent
        const data = { turn, ...searchResults, references };
        return [output, { [Constants.WEB_SEARCH]: data }];
      } catch (error) {
        logger.error('[AnthropicSearch] Search failed:', error);
        return `Search failed: ${error.message}`;
      }
    },
    {
      name: Tools.web_search,
      description: `Real-time web search using Anthropic's search capability. Results include URLs and snippets.

Note: Use ONCE per reply unless instructed otherwise.

**CITE EVERY NON-OBVIOUS FACT/QUOTE** using the provided URLs.`,
      schema: searchSchema,
      responseFormat: Constants.CONTENT_AND_ARTIFACT,
    },
  );
}

module.exports = {
  createAnthropicSearchTool,
  extractSearchResults,
  formatResultsForLLM,
};
