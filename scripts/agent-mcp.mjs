#!/usr/bin/env node
// Tacet Forge MCP server (stdio): the agent CLI's commands as MCP tools, for
// clients that prefer tools over a shell (Claude Desktop, Claude Code, other
// MCP clients). Same code path as `node scripts/agent.mjs`; see AGENTS.md for
// the client config. Newline-delimited JSON-RPC 2.0 on stdin/stdout; logs go
// to stderr.
import { createInterface } from "node:readline";
import { createAgentHost, routeConsoleToStderr } from "./agent-host.mjs";

const PROTOCOL_VERSION = "2025-06-18";
const TOOL_PREFIX = "tacet_forge_";

routeConsoleToStderr();

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function argSchema(arg) {
  const description = arg.description;
  if (arg.type === "number") return { type: "number", description };
  if (arg.type === "boolean") return { type: "boolean", description };
  if (arg.type === "list") {
    return { anyOf: [{ type: "array", items: { type: "string" } }, { type: "string" }], description: `${description} (array, or comma-separated)` };
  }
  return { type: "string", description };
}

function toTool(definition) {
  const properties = {};
  const required = [];
  for (const arg of definition.args) {
    properties[arg.name] = argSchema(arg);
    if (arg.required) required.push(arg.name);
  }
  if (properties.data) {
    properties.data.description += " Use an absolute path.";
  }
  return {
    name: `${TOOL_PREFIX}${definition.name}`,
    description: `${definition.summary} Returns JSON: ${definition.output}`,
    inputSchema: { type: "object", properties, required, additionalProperties: false },
  };
}

let hostPromise = null;
const host = () => (hostPromise ??= createAgentHost());

// The processor worker runs in-process behind one shim: one call at a time.
let queue = Promise.resolve();
function serialized(task) {
  const result = queue.then(task, task);
  queue = result.catch(() => {});
  return result;
}

async function handle(request) {
  const { id, method, params } = request;
  switch (method) {
    case "initialize":
      return {
        protocolVersion: params?.protocolVersion ?? PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: "tacet-forge", version: "1.0.0" },
        instructions:
          "Wuthering Waves calculator/optimizer on the user's exported Tacet Forge backup. Start with tacet_forge_describe; read AGENTS.md in the repository for the workflow. Never modifies the input file; `apply` writes a new backup for the user to import.",
      };
    case "ping":
      return {};
    case "tools/list": {
      const { agent } = await host();
      return { tools: agent.listCommandNames().map((name) => toTool(agent.getCommand(name))) };
    }
    case "tools/call": {
      const name = String(params?.name ?? "");
      const command = name.startsWith(TOOL_PREFIX) ? name.slice(TOOL_PREFIX.length) : name;
      const output = await serialized(async () => (await host()).run(command, params?.arguments ?? {}));
      return { content: [{ type: "text", text: JSON.stringify(output, null, 2) }], isError: !output.ok };
    }
    default:
      if (id === undefined) return undefined; // notification (e.g. notifications/initialized)
      throw Object.assign(new Error(`Method not found: ${method}`), { code: -32601 });
  }
}

const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
const inflight = new Set();
lines.on("line", (line) => {
  if (!line.trim()) return;
  let request;
  try {
    request = JSON.parse(line);
  } catch {
    send({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
    return;
  }
  const work = handle(request)
    .then((result) => {
      if (request.id !== undefined && result !== undefined) send({ jsonrpc: "2.0", id: request.id, result });
    })
    .catch((error) => {
      if (request.id !== undefined) {
        send({ jsonrpc: "2.0", id: request.id, error: { code: error.code ?? -32603, message: error.message ?? String(error) } });
      }
    })
    .finally(() => inflight.delete(work));
  inflight.add(work);
});
lines.on("close", async () => {
  await Promise.allSettled([...inflight]);
  if (hostPromise) await (await hostPromise).close();
  process.exit(0);
});
