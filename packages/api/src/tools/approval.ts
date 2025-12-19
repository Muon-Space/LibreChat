import { logger } from '@librechat/data-schemas';
import type { TToolApproval } from 'librechat-data-provider';
import { MCPToolCallValidationHandler } from '~/mcp/validation';

/**
 * Checks if a tool requires approval based on the toolApproval config.
 *
 * @param toolName - The name of the tool
 * @param toolApproval - The tool approval configuration
 * @returns true if the tool requires approval, false otherwise
 */
export function requiresApproval(
  toolName: string,
  toolApproval: TToolApproval | undefined,
): boolean {
  if (!toolApproval) {
    return false;
  }

  const { required, excluded } = toolApproval;

  // If required is not set, no approval needed
  if (required === undefined || required === false) {
    return false;
  }

  // Check if tool is in excluded list
  if (excluded && excluded.length > 0) {
    for (const pattern of excluded) {
      if (matchesPattern(toolName, pattern)) {
        return false;
      }
    }
  }

  // If required is true, all tools require approval (except excluded)
  if (required === true) {
    return true;
  }

  // If required is an array, check if tool matches any pattern
  if (Array.isArray(required)) {
    for (const pattern of required) {
      if (matchesPattern(toolName, pattern)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Matches a tool name against a pattern.
 * Supports:
 * - Exact match: "web_search"
 * - Wildcard patterns: "mcp:*" (matches any MCP tool)
 * - Prefix patterns: "image_*" (matches image_gen, image_edit, etc.)
 *
 * @param toolName - The name of the tool
 * @param pattern - The pattern to match against
 * @returns true if the tool name matches the pattern
 */
export function matchesPattern(toolName: string, pattern: string): boolean {
  // Exact match
  if (pattern === toolName) {
    return true;
  }

  // Special case: "all" matches everything
  if (pattern === 'all') {
    return true;
  }

  // Wildcard pattern: "mcp:*" or "prefix_*"
  if (pattern.endsWith('*')) {
    const prefix = pattern.slice(0, -1);
    return toolName.startsWith(prefix);
  }

  // Check if it's an MCP tool pattern like "mcp:*" matching tools with MCP delimiter
  if (pattern === 'mcp:*' || pattern === 'mcp_*') {
    // MCP tools contain the MCP delimiter (:::mcp:::)
    return toolName.includes(':::mcp:::');
  }

  return false;
}

/**
 * Gets the server name for a tool.
 * For MCP tools, extracts from the tool name.
 * For other tools, returns 'builtin'.
 *
 * @param toolName - The name of the tool
 * @returns The server name
 */
export function getToolServerName(toolName: string): string {
  // MCP tools have format: "toolName:::mcp:::serverName"
  if (toolName.includes(':::mcp:::')) {
    const parts = toolName.split(':::mcp:::');
    return parts[1] || 'mcp';
  }
  return 'builtin';
}

/**
 * Gets the base tool name (without server name for MCP tools).
 *
 * @param toolName - The full tool name
 * @returns The base tool name
 */
export function getBaseToolName(toolName: string): string {
  // MCP tools have format: "toolName:::mcp:::serverName"
  if (toolName.includes(':::mcp:::')) {
    const parts = toolName.split(':::mcp:::');
    return parts[0] || toolName;
  }
  return toolName;
}

export { MCPToolCallValidationHandler };
