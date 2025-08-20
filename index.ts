/* eslint @typescript-eslint/no-explicit-any: 0 */
/* eslint no-empty-pattern: 0 */


import express from "express";
import { v4 } from "uuid";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {  isInitializeRequest } from "@modelcontextprotocol/sdk/types.js"
import { z } from "zod";
import irc from "irc";
import minimist from 'minimist';

const argv = minimist(process.argv.slice(2));

const client = new irc.Client(argv["url"] || 'irc.libera.chat', `mc${v4()}`.slice(0,10), {
    channels: [],
	secure: true,
    port: argv["port"] || 6697,
    autoConnect: false
});
const lastMessages: any[] = [];

client.addListener('message', function (from, to, message) {
    lastMessages.unshift({
        from: from, to: to, message: message, time: Date.now()
    });
    lastMessages.splice(100);
    console.log(from + ' => ' + to + ': ' + message);
});
client.addListener('error', function(message) {
    console.log('error: ', message);
});
client.connect(1, (e) => {
    console.log(e);
});


const app = express();
app.use(express.json());

// Map to store transports by session ID
const transports: { [sessionId: string]: StreamableHTTPServerTransport } = {};

// Handle POST requests for client-to-server communication
app.post('/mcp', async (req, res) => {
  // Check for existing session ID
  const sessionId = req.headers['mcp-session-id'] as string | undefined;
  let transport: StreamableHTTPServerTransport;

  if (sessionId && transports[sessionId]) {
    // Reuse existing transport
    transport = transports[sessionId];
  } else if (!sessionId && isInitializeRequest(req.body)) {
    // New initialization request
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => v4(),
      onsessioninitialized: (sessionId) => {
        // Store the transport by session ID
        transports[sessionId] = transport;
      },
      // DNS rebinding protection is disabled by default for backwards compatibility. If you are running this server
      // locally, make sure to set:
      // enableDnsRebindingProtection: true,
      // allowedHosts: ['127.0.0.1'],
    });

    // Clean up transport when closed
    transport.onclose = () => {
      if (transport.sessionId) {
        delete transports[transport.sessionId];
      }
    };
    const server = new McpServer({
      name: "mcp-server-irc-client",
      version: "1.0.0"
    }, { capabilities: { tools: {}}});

    // ... set up server resources, tools, and prompts ...

    server.registerTool(
        "getMessages",
        {
            description: "Get the last 10 messages",
            inputSchema: {},
        },
        async ({ }) => {
            return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify(lastMessages),
                },
            ],
            };
        }
    );
    server.registerTool(
        "sendRaw",
        {
            description: "Send a raw message to the server",
            inputSchema: {
                cmd: z.string().describe("command"),
                arg1: z.string().describe("arg1"),
                arg2: z.string().optional().describe("arg2")
            },
        },
        async ({ cmd, arg1, arg2 }) => {
            client.send(cmd, arg1, arg2 || "");
            return {
            content: [
                {
                    type: "text",
                    text: "Done",
                },
            ],
            };
        }
    );
    server.registerTool(
        "join",
        {
            description: "Join a channel",
            inputSchema: {
                channel: z.string().describe("channel"),
            },
        },
        async ({ channel }) => {
            client.join(channel);
            return {
            content: [
                {
                    type: "text",
                    text: "Done",
                },
            ],
            };
        }
    );
        server.registerTool(
        "privmsg",
        {
            description: "Send a message to a channel or DM a user",
            inputSchema: {
                target: z.string().describe("channel or user"),
                message: z.string().describe("the message")
            },
        },
        async ({ target, message }) => {
            client.say(target, message);
            return {
            content: [
                {
                    type: "text",
                    text: "Done",
                },
            ],
            };
        }
    );

    // Connect to the MCP server
    await server.connect(transport);
  } else {
    // Invalid request
    res.status(400).json({
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: 'Bad Request: No valid session ID provided',
      },
      id: null,
    });
    return;
  }

  // Handle the request
  await transport.handleRequest(req, res, req.body);
});

// Reusable handler for GET and DELETE requests
const handleSessionRequest = async (req: express.Request, res: express.Response) => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;
  if (!sessionId || !transports[sessionId]) {
    res.status(400).send('Invalid or missing session ID');
    return;
  }
  
  const transport = transports[sessionId];
  await transport.handleRequest(req, res);
};

// Handle GET requests for server-to-client notifications via SSE
app.get('/mcp', handleSessionRequest);

// Handle DELETE requests for session termination
app.delete('/mcp', handleSessionRequest);
console.log("listening");
app.listen(3000);