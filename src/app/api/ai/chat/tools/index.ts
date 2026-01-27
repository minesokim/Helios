import Anthropic from '@anthropic-ai/sdk'
import { ToolDefinition, ToolContext } from '../types'
import { memoryTools } from './memory'
import { briefingTools } from './briefings'
import { financialTools } from './financial'
import { driveTools } from './drive'
import { emailTools } from './email'
import { calendarTools } from './calendar'
import { projectTools } from './projects'
import { peopleTools } from './people'
import { searchTools } from './search'
import { clientTools } from './clients'
import { ragTools } from './rag'

// Combine all tools
export const allTools: ToolDefinition[] = [
  ...searchTools,
  ...memoryTools,
  ...briefingTools,
  ...financialTools,
  ...driveTools,
  ...emailTools,
  ...calendarTools,
  ...projectTools,
  ...peopleTools,
  ...clientTools,
  ...ragTools,
]

// Convert to Anthropic format (without handlers)
export function getAnthropicTools(): Anthropic.Tool[] {
  return allTools.map(({ name, description, input_schema }) => ({
    name,
    description,
    input_schema,
  }))
}

// Execute a tool by name
export async function executeTool(
  name: string,
  params: Record<string, unknown>,
  context: ToolContext
): Promise<string> {
  const tool = allTools.find(t => t.name === name)
  if (!tool) {
    throw new Error(`Unknown tool: ${name}`)
  }
  return tool.handler(params, context)
}
