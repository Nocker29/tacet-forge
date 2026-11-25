// Tacet Forge agent tool: loads the app's TypeScript (src/agent/commands.ts)
// in Node through Vite's module runner, so it resolves exactly like the app
// (aliases, dynamic character imports). Shared by scripts/agent.mjs (CLI) and
// scripts/agent-mcp.mjs (MCP server). See AGENTS.md.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Keeps stdout for results: app code logs (console.time, warnings) go to stderr. */
export function routeConsoleToStderr() {
  for (const method of ["log", "info", "warn", "debug", "time", "timeEnd", "timeLog"]) {
    const original = console[method].bind(console);
    console[method] = (...args) => {
      if (method.startsWith("time")) return;
      process.stderr.write(`${args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ")}\n`);
      void original;
    };
  }
}

/** Browser globals the app's import/migration code expects, in memory only. */
function installBrowserShims() {
  if (!globalThis.localStorage) {
    const store = new Map();
    globalThis.localStorage = {
      getItem: (key) => (store.has(key) ? store.get(key) : null),
      setItem: (key, value) => store.set(key, String(value)),
      removeItem: (key) => store.delete(key),
      clear: () => store.clear(),
      key: (index) => [...store.keys()][index] ?? null,
      get length() {
        return store.size;
      },
    };
  }
}

/**
 * The app's processor worker (src/workers/processor.worker.ts) talks through
 * `self.onmessage` / `self.postMessage`. In Node it runs in-process behind
 * this shim; messages are structured-cloned like postMessage does.
 */
const workerSelf = { onmessage: null, sink: null, postMessage: (message) => workerSelf.sink?.(structuredClone(message)) };

let hostPromise = null;

export function createAgentHost() {
  hostPromise ??= (async () => {
    installBrowserShims();
    globalThis.self = workerSelf;
    const { createServer, createServerModuleRunner } = await import("vite");
    const server = await createServer({
      root: ROOT,
      configFile: join(ROOT, "vite.config.ts"),
      logLevel: "silent",
      server: { middlewareMode: true, hmr: false, ws: false },
      appType: "custom",
      optimizeDeps: { noDiscovery: true, include: [] },
      // The stores import lodash with named imports, which Node's ESM can't
      // take from CommonJS; let Vite pre-bundle it for this SSR run.
      ssr: { noExternal: ["lodash"], optimizeDeps: { include: ["lodash"] } },
    });
    const runner = createServerModuleRunner(server.environments.ssr, { hmr: false });
    const agent = await runner.import("/src/agent/commands.ts");
    let processorLoaded = false;
    const baseDir = process.env.INIT_CWD || process.cwd();

    const runtime = {
      readText: (path) => readFileSync(path, "utf8"),
      writeText: (path, text) => writeFileSync(path, text, { encoding: "utf8", flag: "wx" }),
      exists: (path) => existsSync(path),
      resolvePath: (path) => (isAbsolute(path) ? resolve(path) : resolve(baseDir, path)),
      now: () => Date.now(),
      createProcessor() {
        return {
          async send(message) {
            if (!processorLoaded) {
              await runner.import("/src/workers/processor.worker.ts");
              processorLoaded = true;
            }
            workerSelf.onmessage?.({ data: structuredClone(message) });
          },
          onMessage(handler) {
            workerSelf.sink = handler;
          },
        };
      },
    };

    return {
      agent,
      runtime,
      run: (command, args) => agent.runAgentCommand(command, args, runtime),
      async close() {
        await runner.close();
        await server.close();
      },
    };
  })();
  return hostPromise;
}
