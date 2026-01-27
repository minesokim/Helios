#!/usr/bin/env node

/**
 * Jorkel MCP Server
 *
 * Provides Claude with tools to interact with Jorkel AI APIs:
 * - Drive sync and watch management
 * - File classification
 * - Chat with Jorkel
 * - Project management
 * - Banking data access
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

const JORKEL_BASE_URL = process.env.JORKEL_URL || 'https://jorkel-ai.vercel.app';
const JORKEL_API_KEY = process.env.JORKEL_API_KEY || '';

// Helper to make API calls
async function jorkelApi(endpoint, options = {}) {
  const url = `${JORKEL_BASE_URL}${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(JORKEL_API_KEY && { 'Authorization': `Bearer ${JORKEL_API_KEY}` }),
      ...options.headers,
    },
  });

  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text, status: response.status };
  }
}

// Define available tools
const tools = [
  {
    name: 'jorkel_drive_sync',
    description: 'Trigger a full sync of Google Drive files to Jorkel',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'jorkel_drive_watch_status',
    description: 'Check the status of Google Drive real-time sync (webhook)',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'jorkel_drive_watch_enable',
    description: 'Enable real-time Drive sync via webhooks',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'jorkel_drive_watch_disable',
    description: 'Disable real-time Drive sync',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'jorkel_drive_classify',
    description: 'Trigger AI classification of unclassified Drive files',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'jorkel_drive_files',
    description: 'Get indexed Drive files with optional filtering',
    inputSchema: {
      type: 'object',
      properties: {
        zone: {
          type: 'string',
          description: 'Filter by zone (BUSINESS, CLIENTS, PROJECTS, etc.)',
        },
        limit: {
          type: 'number',
          description: 'Max files to return (default 50)',
        },
      },
      required: [],
    },
  },
  {
    name: 'jorkel_drive_search',
    description: 'Search Drive files by name or content',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'jorkel_chat',
    description: 'Send a message to Jorkel AI and get a response',
    inputSchema: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          description: 'Message to send to Jorkel',
        },
        conversationId: {
          type: 'string',
          description: 'Optional conversation ID to continue a conversation',
        },
      },
      required: ['message'],
    },
  },
  {
    name: 'jorkel_projects_list',
    description: 'List all projects tracked in Jorkel',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'jorkel_projects_create',
    description: 'Create a new project in Jorkel',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Project name',
        },
        client: {
          type: 'string',
          description: 'Client name (optional)',
        },
        description: {
          type: 'string',
          description: 'Project description (optional)',
        },
      },
      required: ['name'],
    },
  },
  {
    name: 'jorkel_banking_accounts',
    description: 'Get connected bank accounts and balances',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'jorkel_transactions',
    description: 'Get recent transactions',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Max transactions to return (default 50)',
        },
        category: {
          type: 'string',
          description: 'Filter by category',
        },
      },
      required: [],
    },
  },
  {
    name: 'jorkel_health',
    description: 'Check if Jorkel API is healthy and responsive',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
];

// Tool handlers
const toolHandlers = {
  jorkel_drive_sync: async () => {
    return await jorkelApi('/api/drive/sync', { method: 'POST' });
  },

  jorkel_drive_watch_status: async () => {
    return await jorkelApi('/api/drive/watch');
  },

  jorkel_drive_watch_enable: async () => {
    return await jorkelApi('/api/drive/watch', { method: 'POST' });
  },

  jorkel_drive_watch_disable: async () => {
    return await jorkelApi('/api/drive/watch', { method: 'DELETE' });
  },

  jorkel_drive_classify: async () => {
    return await jorkelApi('/api/drive/auto-classify', { method: 'POST' });
  },

  jorkel_drive_files: async (args) => {
    const params = new URLSearchParams();
    if (args.zone) params.set('zone', args.zone);
    if (args.limit) params.set('limit', args.limit.toString());
    return await jorkelApi(`/api/drive/indexed?${params}`);
  },

  jorkel_drive_search: async (args) => {
    return await jorkelApi(`/api/drive/search?q=${encodeURIComponent(args.query)}`);
  },

  jorkel_chat: async (args) => {
    return await jorkelApi('/api/ai/chat', {
      method: 'POST',
      body: JSON.stringify({
        message: args.message,
        conversationId: args.conversationId,
      }),
    });
  },

  jorkel_projects_list: async () => {
    return await jorkelApi('/api/projects');
  },

  jorkel_projects_create: async (args) => {
    return await jorkelApi('/api/projects', {
      method: 'POST',
      body: JSON.stringify(args),
    });
  },

  jorkel_banking_accounts: async () => {
    return await jorkelApi('/api/banking/accounts');
  },

  jorkel_transactions: async (args) => {
    const params = new URLSearchParams();
    if (args.limit) params.set('limit', args.limit.toString());
    if (args.category) params.set('category', args.category);
    return await jorkelApi(`/api/transactions?${params}`);
  },

  jorkel_health: async () => {
    try {
      const start = Date.now();
      const response = await fetch(`${JORKEL_BASE_URL}/api/drive/webhook`);
      const latency = Date.now() - start;
      const data = await response.json();
      return {
        status: 'healthy',
        latency: `${latency}ms`,
        url: JORKEL_BASE_URL,
        ...data,
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
        url: JORKEL_BASE_URL,
      };
    }
  },
};

// Create and run the server
const server = new Server(
  {
    name: 'jorkel-mcp-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Handle tool listing
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  const handler = toolHandlers[name];
  if (!handler) {
    throw new Error(`Unknown tool: ${name}`);
  }

  try {
    const result = await handler(args || {});
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Jorkel MCP server running');
}

main().catch(console.error);
