<template>
  <Nav cur-page="privacy" :disable-mobile-nav="true"></Nav>

  <!-- Labs flag "UI Overhaul 3.0" (liveResultBar) off: legacy content,
       just given the same page-container treatment (padding/max-width)
       Legal/Info/Updates already had - Privacy was previously missing it,
       which is why it looked different in text formatting from the rest. -->
  <div v-if="!isLiveResultBarEnabled" class="page-privacy prose">
    <h1>Privacy Policy</h1>
    <h2>No analytics</h2>
    <p>
      This app has no analytics, tracking, ads, or cookies. We don't collect
      any information about you or how you use it.
    </p>
    <h2>Your data (builds, inventory, settings)</h2>
    <p>
      Everything you enter — characters, builds, echo inventory, settings —
      is stored only in your browser's local storage, on your own device.
      None of it is sent to us or to any server; we have no account system
      and nothing to log in to. Use Settings → Backup &amp; Restore to keep a
      copy, since clearing your browser data deletes it.
    </p>
    <h2>Images and fonts</h2>
    <p>
      Character, weapon, and echo images and the app's font are loaded from
      third-party hosts (image CDNs and Google Fonts), which can see your IP
      address like any website you visit. No build data is sent with those
      requests.
    </p>
    <template v-if="SCANNER_ENABLED">
    <h2>Echo scanner (screen share / video upload)</h2>
    <p>
      The optional echo scanner (Labs → Echo scanning) lets you share your
      game window or upload a recording so the app can read your echoes'
      stats automatically. Both options are processed entirely in your
      browser — nothing is uploaded to a server, no video or screen capture
      ever leaves your device, and no frames or images are kept once
      you're done. Closing the scanner (including pressing Escape) stops
      screen sharing immediately, the same as clicking "Stop scanning."
    </p>
    </template>
    <h2>Changes</h2>
    <p>
      Changes may occur to this policy at any time, so check back to this for
      the latest.
    </p>
  </div>

  <!-- Labs flag on: same header-bar/card vocabulary as Settings/Updates/Info. -->
  <div v-else class="page-privacy page-privacy--v3">
    <h1 class="text-2xl font-bold mb-4">Privacy</h1>
    <div class="bg-base-200 rounded-xl p-4 flex flex-col gap-4">
      <div>
        <div class="text-[.65rem] font-bold uppercase tracking-wider opacity-50 mb-2">
          No analytics
        </div>
        <p class="text-sm opacity-80">
          This app has no analytics, tracking, ads, or cookies. We don't
          collect any information about you or how you use it.
        </p>
      </div>
      <div class="border-t border-base-300 pt-4">
        <div class="text-[.65rem] font-bold uppercase tracking-wider opacity-50 mb-2">
          Your data (builds, inventory, settings)
        </div>
        <p class="text-sm opacity-80">
          Everything you enter — characters, builds, echo inventory,
          settings — is stored only in your browser's local storage, on
          your own device. None of it is sent to us or to any server; we
          have no account system and nothing to log in to. Use Settings →
          Backup &amp; Restore to keep a copy, since clearing your browser
          data deletes it.
        </p>
      </div>
      <div class="border-t border-base-300 pt-4">
        <div class="text-[.65rem] font-bold uppercase tracking-wider opacity-50 mb-2">
          Images and fonts
        </div>
        <p class="text-sm opacity-80">
          Character, weapon, and echo images and the app's font are loaded
          from third-party hosts (image CDNs and Google Fonts), which can
          see your IP address like any website you visit. No build data is
          sent with those requests.
        </p>
      </div>
      <div v-if="SCANNER_ENABLED" class="border-t border-base-300 pt-4">
        <div class="text-[.65rem] font-bold uppercase tracking-wider opacity-50 mb-2">
          Echo scanner (screen share / video upload)
        </div>
        <p class="text-sm opacity-80">
          The optional echo scanner (Labs → Echo scanning) lets you share
          your game window or upload a recording so the app can read your
          echoes' stats automatically. Both options are processed entirely
          in your browser — nothing is uploaded to a server, no video or
          screen capture ever leaves your device, and no frames or images
          are kept once you're done. Closing the scanner (including
          pressing Escape) stops screen sharing immediately, the same as
          clicking "Stop scanning."
        </p>
      </div>
      <div class="border-t border-base-300 pt-4">
        <div class="text-[.65rem] font-bold uppercase tracking-wider opacity-50 mb-2">
          Changes
        </div>
        <p class="text-sm opacity-80">
          This policy may change at any time — check back here for the
          latest.
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import Nav from "../components/navigation/Nav.vue";
import { useSettingsStore } from "../stores/settings";
import { isV3UiEnabled } from "../utils/uiVersion";
import { SCANNER_ENABLED } from "../utils/forkFeatures";

const settingsStore = useSettingsStore();
const isLiveResultBarEnabled = computed(
  () => isV3UiEnabled(settingsStore),
);
</script>

<style scoped lang="scss">
.page-privacy {
  padding: 2rem 3rem;
  max-width: 640px;
  @media (max-width: 768px) {
    margin-left: 0;
  }
}
</style>
