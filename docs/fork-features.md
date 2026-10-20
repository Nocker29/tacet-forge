# Tacet Forge: fork features

Features added in the fork, where they live and the rules they follow. User-facing
history is in [CHANGES.md](../CHANGES.md).

## Characters page (`/characters`)

- Page: `src/pages/CharactersView.vue`; cards `src/components/characters/CharacterOverviewCard.vue`;
  read-only details modal `CharacterOverviewDetails.vue`.
- Pure logic (tested): `src/characters/characterOverview.ts` — which characters are listed
  (`listSavedCharacters`: roster characters with a record in the character store), sequence
  from the `SequenceNode<N>…` chain keys, active sets (same threshold rule as the build card),
  filtering and sorting.
- Stats: `src/composables/useCharacterOverview.ts` calls `buildCharacterCalculationContext`
  with `alwaysEnabledOnly` (the build card's rules), one character at a time through a shared
  queue so 40+ cards don't load every module at once. Nothing is copied into a store.
- "Open in calculator" sets the active character and goes to `/`; "Open in optimizer" adds
  `?screen=optimizer`, read once by `Calculator.vue` via `src/utils/calculatorScreen.ts`.
- Missing images fall back to initials (`CharacterAvatar.vue`) or a neutral placeholder
  (`src/components/AppImage.vue`).
