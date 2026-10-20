<template>
  <div class="bg-base-200 rounded-xl p-4 flex flex-col gap-4">
    <div data-test-fork-notice>
      <div class="text-[.65rem] font-bold uppercase tracking-wider opacity-50 mb-2">
        About this version
      </div>
      <p class="text-sm opacity-80">
        {{ APP_NAME }} is based on
        <a :href="UPSTREAM_REPO_URL" target="_blank" rel="noopener" class="link font-semibold">
          {{ UPSTREAM_NAME }}</a>
        by @LavaSnake and contributors. This is a modified version, licensed under the
        GNU GPL v3 like the original; see CHANGES.md in the source for what changed.
      </p>
      <p class="text-sm opacity-80 mt-2">
        Source code and bug reports:
        <a :href="FORK_REPO_URL" target="_blank" rel="noopener" class="link font-semibold">
          {{ APP_NAME }} on GitHub</a>.
      </p>
    </div>

    <div>
      <div class="text-[.65rem] font-bold uppercase tracking-wider opacity-50 mb-2">
        Original developers
      </div>
      <ul class="text-sm opacity-80 flex flex-col gap-1">
        <li>Author: @LavaSnake</li>
        <li>Contributors: @flysand</li>
      </ul>
    </div>

    <div>
      <div class="text-[.65rem] font-bold uppercase tracking-wider opacity-50 mb-2">
        Shoutouts
      </div>
      <ul class="text-sm opacity-80 flex flex-col gap-1">
        <li>
          Jäger, Bachelor, Nekuro (NekroLight), AlecJohn, juste — for all of
          your help with the calculations and great ideas!
        </li>
        <li>Namelag, and Dustin for all of your help with the Spectro Frazzle formula!</li>
        <li>noyaosu for your help in data gathering for Aero Erosion!</li>
        <li>F.I.S.H. and invidia.exe for your help in figuring out Tune Break!</li>
      </ul>
    </div>

    <div class="pt-1 border-t border-base-300">
      <RouterLink to="/privacy" class="link text-sm">Privacy Policy →</RouterLink>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useDocumentTitle } from "../../composables/useDocumentTitle";
import { APP_NAME, FORK_REPO_URL, UPSTREAM_NAME, UPSTREAM_REPO_URL } from "../../utils/forkInfo";

useDocumentTitle(
  "Credits & Community — Tacet Forge",
  "Developers, contributors, and community links for Tacet Forge.",
);
</script>
