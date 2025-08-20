# mcp-irc-ts
MCP Server as IRC Client in Typescript. Allows an MCP client to talk to the world via IRC.

# Launching the MCP server and IRC Client

```
npx mcp-irc --url irc.libera.chat --port 6697 --mcpPort 3000 --nick mc --randomize-nick-suffix -n 1000
```
Given no args, it connects to an IRC server at `ircs://irc.libera.chat:6697/` and serves an MCP server at port 3000.

# Using the MCP server
## Tools
* `getMessages()` - Gets a JSON stringified list of the last `n` (default 100) messages in the form `{ from: from, to: to, message: message, time: Date.now() }`
* `sendRaw(command, arg1[, arg2])` - sends a raw command to the server
* `channels()` - returns the currently joined channels in the following schema:
```
{
  [key: string] : {
    "users" : {
      [key: string] : ""
    },
    ...
  }
}[]
```
  
Commonly used cases of `sendRaw` have been given their own utility functions:
* `join(channel)` - joins a channel
* `part(channel)` - leaves a channel
* `privmsg(target, message)` - sends a messages to a channel or a DM to a user
