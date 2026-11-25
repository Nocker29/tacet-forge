---
name: use-tacet-forge
description: Use the Tacet Forge Wuthering Waves calculator/optimizer on a user's exported backup — stats, damage, best echo loadouts, saving a build as a new backup to import. Use whenever the user asks to calculate, optimize or build a character from their Tacet Forge / Wuthering Tools data (not for changing the app's code).
---

Read [AGENTS.md](../../../AGENTS.md) at the repository root and follow it. In short:

1. Get the user's backup `.json` (Settings → Backup & Restore → Download .json).
2. `node scripts/agent.mjs describe`, then `characters`, `stats`, `damage`, `optimize` with `--data <path>`.
3. Show the options; `apply` only what the user picks. It writes a new file — never modify the input.
4. Tell the user to import it via Settings → Backup & Restore → Import & overwrite (preview + Undo).
