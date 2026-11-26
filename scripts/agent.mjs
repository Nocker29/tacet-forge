#!/usr/bin/env node
// Tacet Forge agent CLI: `node scripts/agent.mjs <command> [--arg value …]`.
// Prints one JSON object to stdout: { ok: true, command, result } or
// { ok: false, error: { code, message, hint } }. Start with `describe`.
// `batch` reads several commands from stdin (one JSON object per line:
// {"command": "...", "args": {...}}) and runs them in one process, which
// saves the ~2 s start-up per call. Instructions for agents: AGENTS.md.
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

async function readStdin() {
  let text = "";
  for await (const chunk of process.stdin) text += chunk;
  return text;
}

function help(host, command) {
  const definition = host.agent.getCommand(command);
  return definition
    ? { ok: true, command: "help", result: { name: definition.name, summary: definition.summary, args: definition.args, output: definition.output } }
    : null;
}

routeConsoleToStderr();
const { command, args } = parseArgs(process.argv.slice(2));
let output;
let host;
try {
  host = await createAgentHost();
  if (command === "batch") {
    if (args.help) {
      output = {
        ok: true,
        command: "help",
        result: {
          name: "batch",
          summary: "Runs several commands in one process. stdin: one JSON object per line, {\"command\": \"stats\", \"args\": {\"data\": \"…\", \"character\": \"Hiyuki\"}}.",
          output: "{ ok, command: \"batch\", result: [ <each command's output, in order> ] }",
        },
      };
    } else {
      const lines = (await readStdin()).split(/\r?\n/).filter((line) => line.trim());
      const results = [];
      for (const [index, line] of lines.entries()) {
        let request;
        try {
          request = JSON.parse(line);
        } catch {
          results.push({ ok: false, error: { code: "bad_batch_line", message: `Line ${index + 1} isn't JSON.` } });
          continue;
        }
        results.push(await host.run(String(request.command ?? ""), request.args ?? {}));
      }
      output = { ok: results.every((entry) => entry.ok), command: "batch", result: results };
    }
  } else if (args.help) {
    output = help(host, command) ?? (await host.run(command, {}));
  } else {
    output = await host.run(command, args);
  }
} catch (error) {
  output = { ok: false, error: { code: "host_error", message: error?.message ?? String(error) } };
}
process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
await host?.close();
process.exit(output.ok ? 0 : 1);
