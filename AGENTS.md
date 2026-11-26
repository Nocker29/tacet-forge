# AGENTS.md: using Tacet Forge from an AI agent

**Tacet Forge** is a calculator and echo-loadout optimizer for the game *Wuthering Waves*. It's a
browser app, but every calculation is plain TypeScript. This folder includes a **command-line tool
and an MCP server** that run the app's own calculator and optimizer on a user's exported data. You
don't need to read or understand the app's source to use it.

> Working on the app's code instead? Read [CLAUDE.md](CLAUDE.md). This file is for *using* the tool.

## 1. Setup (once)

- **Node.js 24+** (`node --version`).
- Dependencies: if there is no `node_modules/` folder, run `npm ci --ignore-scripts` in this
  folder. It needs no network after that.
- Run every command **from this folder** (the one containing this file).

## 2. Get the user's data

The tool works on a **backup file** the user exports from the app, never on the browser itself.

- If the user gave you a path to a `.json` backup, use it.
- Otherwise **ask them** for the path, or to export one: *"In Tacet Forge open **Settings → Backup &
  Restore → Download .json** and tell me where the file is."* Don't go looking through their
  Downloads or other folders for it. Wuthering Tools (wutheringtools.com) backups work too.
- `frames` and `catalog` need no backup.

## 3. Run commands

```
node scripts/agent.mjs <command> --data "<path to backup.json>" [--arg value …]
```

- Output is **one JSON object on stdout**: `{ "ok": true, "command", "result" }` or
  `{ "ok": false, "error": { "code", "message", "hint" } }`. The exit code is 0 or 1. Logs go to
  stderr. Read the `hint` on errors.
- `node scripts/agent.mjs describe` lists every command, argument and output shape.
  `node scripts/agent.mjs <command> --help` shows one command.
- Lists are comma-separated (`--sets A,B`). Booleans are bare flags (`--free`). Relative paths
  resolve from the folder you run in; absolute paths are safest.
- `damage` and `optimize` print a lot: redirect to a file (`> out.json`) and read the fields you
  need. Windows paths work quoted (`"C:\Users\me\backup.json"`) or with forward slashes.
- `npm run --silent agent -- <command> …` works too (without `--silent` npm adds a banner to stdout).
- Each call takes about 2–4 s, mostly start-up. For several commands use **batch** (one process,
  results in order), or the MCP server (section 6), which stays warm between calls:

  ```
  node scripts/agent.mjs batch < commands.jsonl
  ```
  with one JSON object per line: `{"command": "stats", "args": {"data": "…", "character": "Hiyuki"}}`.

| Command | What it gives you |
|---|---|
| `characters` | Saved characters: level, sequence, weapon, builds, saved optimizer settings |
| `echoes` | Inventory echoes (`--set`, `--cost`, `--main-stat`, `--held-by`, `--free`) with their `echoId` |
| `stats --character X [--build B]` | Final stats exactly as the app's calculator shows them |
| `damage --character X [--build B]` | Damage of every attack and every saved rotation (normal / average / crit) |
| `targets --character X` | Valid `--target` values for `optimize` |
| `catalog [--what sets\|main-echoes\|substats]` | Keys for echo sets, main echoes, substats |
| `optimize --character X [options]` | Best echo loadouts by the app's own optimizer |
| `apply --character X --echoes id1,…` | Saves those echoes as a **new build** in a **new backup file** |
| `rotations [--character X]` | Saved team rotations, each character's saved rotations, the app's rotation presets (often empty) |
| `team-rotation …` | Team damage, DPS and frame-data timeline for up to 3 characters (see below) |
| `frames --character X` / `frames --echo E` | Action `type`/`key` pairs for rotations, with wuwalab frame data |

`optimize` starts from the character's **saved optimizer settings** (what the user set in the app).
Any option overrides them: `--target`, `--sets`, `--main-echoes`, `--min-stat "energyRegen>=120"`,
`--damage-type Normal|Average|Crit`, `--loadout-format Any|43311|44111`, `--protection app|none`,
`--top`, `--max-combinations`, `--time-limit`. If nothing is saved, the error tells you which
option to pass. Stats use the app's units: percents as percents (`energyRegen: 124.4`); zero stats are
left out. `optimize` returns 5 results by default (`--top`). The current build may not meet the
saved minimum stats, so mention that when comparing it with an optimized one.

### Team rotations

`team-rotation` uses the app's Teams calculation. Give it either a **saved team** or the characters
and their actions:

```
node scripts/agent.mjs team-rotation --data b.json --team "My team"
node scripts/agent.mjs team-rotation --data b.json --characters Hiyuki,Lucilla --slot-rotations "Burst,Opener"
node scripts/agent.mjs team-rotation --data b.json --characters Hiyuki,Lucilla --actions @actions.json --duration 12
```

- `--slot-rotations`: one saved rotation (id or name) or preset name per slot, played slot after
  slot. `rotations` shows what exists. Presets are empty for many characters, so say so instead of
  guessing a rotation.
- `--actions`: a JSON list (inline, or `@file`) in play order:
  `[{"slot": 1, "type": "intro", "key": "ClipItDMG"}, {"slot": 0, "type": "liberation", "key": "ForeclaimingBladeLiberationBaseDMG", "count": 1}]`.
  Slot 0–2 follows `--characters`. Get valid `type`/`key` pairs from `frames --character X` (types:
  basic, skill, forteCircuit, liberation, intro, outro, tuneBreak; `echoAttacks` keys from
  `frames --echo <main echo>`; `{"type": "wait", "frames": 30}` waits). `--builds ,Name,` pins builds.
- Output: `total`, `perCharacter`, every action's damage and timing (start frame, game/real
  frames, time-stop frames, hit frames), `timeline` (game vs real length, time stop, blocks,
  landings), and `dps` from frame data and from `--duration` when given. The app has no buff
  windows: buffs apply as configured, not by time. Actions without frame data count as 0 frames,
  and the output says how many.
## 4. Typical workflow

1. `characters`: find the character key and their current build.
2. `stats` and `damage`: the current numbers (they match the app).
3. `optimize`: read `results[].value`, `echoIds`, `finalStats` and `takesFrom` (echoes it would
   take from other characters). If `complete` is `false`, the search stopped at `stoppedBy`; say so,
   or raise `--time-limit`/`--max-combinations`.
4. Show the user the options. Apply only what they choose:
   `apply --character X --echoes <echoIds of the result> [--build-name "…"]`.
   This writes `<input>.agent-<character>-<UTC time>.json` next to the input (or `--out`); the exact
   path is `result.out`. The new build becomes the active one (`--keep-active` keeps the current one
   active); the previous build stays saved.
5. Tell the user to import it: **Settings → Backup & Restore → Import & overwrite**, pick the new
   file, check the preview, confirm. **Undo last import** brings back their previous data.

## 5. Rules

- **Never modify the user's input file.** `apply` always writes a new file and refuses to overwrite.
- **Don't drive the browser or the user's localStorage.** The backup file is the only interface; the
  user imports results themselves.
- Don't run `start.bat`, `scripts/update.mjs`, `git pull` or upstream merges; updating the app is the
  user's call.
- Report numbers as the tool gives them. Don't recompute them by hand, and say which build and
  target they're for.
- The backup contains the user's personal game data. Keep it local and don't upload it anywhere.

## 6. MCP server (optional)

The same commands are available as MCP tools (`tacet_forge_describe`, `tacet_forge_optimize`, …)
over stdio: `node scripts/agent-mcp.mjs`. Give tools an **absolute** `data` path.

Claude Code (run in this folder):

```
claude mcp add tacet-forge -- node scripts/agent-mcp.mjs
```

Claude Desktop / any MCP client (`claude_desktop_config.json` → `mcpServers`), with this folder's
absolute path:

```json
{
  "mcpServers": {
    "tacet-forge": {
      "command": "node",
      "args": ["<absolute path to this folder>/scripts/agent-mcp.mjs"]
    }
  }
}
```

## 7. How it stays accurate

The tool loads the app's TypeScript through Vite (`scripts/agent-host.mjs`) and calls the same
functions the app does. It imports backups with the app's validation and migrations, calculates
through `buildCharacterCalculationContext`/`calcDamages`, and optimizes with the app's processor
worker. Tests in `tests/agent/` render the app's optimizer screen and compare the inputs it builds.
They also check that applying the best loadout reproduces the optimizer's value. Details:
[docs/fork-agent.md](docs/fork-agent.md).
