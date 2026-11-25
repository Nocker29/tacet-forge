#!/usr/bin/env node
// Tacet Forge agent CLI: `node scripts/agent.mjs <command> [--arg value …]`.
// Prints one JSON object to stdout: { ok: true, command, result } or
// { ok: false, error: { code, message, hint } }. Start with `describe`.
// Instructions for agents: AGENTS.md.
import { createAgentHost, routeConsoleToStderr } from "./agent-host.mjs";

function parseArgs(argv) {
  const [command = "describe", ...rest] = argv;
  const args = {};
  for (let i = 0; i < rest.length; i++) {
    const token = rest[i];
    if (!token.startsWith("--")) continue;
    const [rawKey, inline] = token.slice(2).split(/=(.*)/s);
    const next = rest[i + 1];
    let value;
    if (inline !== undefined) value = inline;
    else if (next !== undefined && !next.startsWith("--")) value = rest[++i];
    else value = true;
    // Repeated flags (e.g. --min-stat a --min-stat b) collect into a list.
    args[rawKey] = rawKey in args ? [].concat(args[rawKey], value) : value;
  }
  return { command, args };
}

routeConsoleToStderr();
const { command, args } = parseArgs(process.argv.slice(2));
let output;
let host;
try {
  host = await createAgentHost();
  if (args.help) {
    const definition = host.agent.getCommand(command);
    output = definition
      ? { ok: true, command: "help", result: { name: definition.name, summary: definition.summary, args: definition.args, output: definition.output } }
      : await host.run(command, {});
  } else {
    output = await host.run(command, args);
  }
} catch (error) {
  output = { ok: false, error: { code: "host_error", message: error?.message ?? String(error) } };
}
process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
await host?.close();
process.exit(output.ok ? 0 : 1);
