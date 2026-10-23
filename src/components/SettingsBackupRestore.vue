<template>
  <div class="flex flex-col gap-4">
    <div class="bg-base-200 rounded-xl p-4 flex flex-col gap-3">
      <div class="text-[.65rem] font-bold uppercase tracking-wider opacity-50">
        Backup
      </div>
      <p class="text-sm opacity-70">
        Save a backup of your characters, inventory, and team rotations.
      </p>
      <div class="flex gap-2">
        <button
          @click="copyCharacterData"
          class="btn btn-sm btn-primary"
          data-test-settings-export-copy>
          Copy to clipboard
        </button>
        <button
          @click="downloadCharacterData"
          class="btn btn-sm btn-primary"
          data-test-settings-export-download>
          Download .json
        </button>
      </div>
    </div>

    <div class="bg-base-200 rounded-xl p-4 flex flex-col gap-3">
      <div class="text-[.65rem] font-bold uppercase tracking-wider opacity-50">
        Import echoes
      </div>
      <p class="text-sm opacity-70">
        Adds a scanned or shared list of echoes to your inventory — does not
        touch your existing data. Should be JSON, an array of echo objects.
      </p>
      <textarea
        v-model="importEchoesAddRawText"
        class="textarea textarea-bordered"
        data-test-import-raw-text-echoes></textarea>
      <input
        ref="echoFileInput"
        type="file"
        accept=".json,application/json"
        class="hidden"
        data-test-import-echoes-file-input
        @change="loadEchoFile" />
      <div class="flex flex-wrap gap-2">
        <button
          type="button"
          class="btn btn-sm btn-outline"
          aria-label="Choose a JSON file to load into the echo import box"
          data-test-import-echoes-choose-file
          @click="echoFileInput?.click()">
          Choose JSON file…
        </button>
        <button
          @click="importEchoesAddRaw"
          class="btn btn-sm btn-primary"
          data-test-import-raw-echoes-button>
          Import echoes
        </button>
      </div>
    </div>

    <div class="bg-base-200 rounded-xl p-4 flex flex-col gap-3">
      <div class="flex items-center justify-between">
        <div class="text-[.65rem] font-bold uppercase tracking-wider opacity-50">
          Import &amp; overwrite
        </div>
      </div>
      <div role="alert" class="alert alert-warning py-2 text-sm">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          class="h-5 w-5 shrink-0 stroke-current">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4m0 4h.01" />
        </svg>
        <span>This replaces all of your existing data. The backup is checked first, and your current data is kept so you can undo the last import.</span>
      </div>

      <div class="grid gap-4 sm:grid-cols-2">
        <div class="flex flex-col gap-2">
          <p class="text-sm opacity-70">Paste a previously exported backup.</p>
          <textarea
            v-model="importedRawCharacterData"
            class="textarea textarea-bordered"
            data-test-import-raw-text></textarea>
          <button
            @click="importRawCharacterData"
            class="btn btn-sm btn-error self-start"
            data-test-import-raw-button>
            Overwrite from text
          </button>
        </div>

        <div class="flex flex-col gap-2">
          <p class="text-sm opacity-70">Or upload a backup file.</p>
          <input
            type="file"
            @change="handleFileUpload"
            accept=".json"
            class="file-input file-input-bordered file-input-sm"
            data-test-import-file-input />
          <textarea
            v-model="fileData"
            readonly
            class="textarea textarea-bordered"></textarea>
          <button
            @click="confirmUpload"
            class="btn btn-sm btn-error self-start"
            data-test-import-file-confirm>
            Overwrite from file
          </button>
        </div>
      </div>
    </div>

    <div
      v-if="undoInfo"
      class="bg-base-200 rounded-xl p-4 flex flex-col gap-3"
      data-test-undo-import>
      <div class="text-[.65rem] font-bold uppercase tracking-wider opacity-50">
        Undo last import
      </div>
      <p class="text-sm opacity-70">
        Your data from before the backup import on {{ undoDate }} is kept. Put it back, or
        download it as a backup file.
      </p>
      <div class="flex flex-wrap gap-2">
        <button
          type="button"
          class="btn btn-sm btn-warning"
          data-test-undo-import-button
          @click="undoImport">
          Undo last import
        </button>
        <button type="button" class="btn btn-sm btn-outline" data-test-undo-import-download @click="downloadUndoBackup">
          Download pre-import data
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * v3.0 "Backup & Restore" panel — merges legacy's separate Export and
 * Import tabs into one, and adds an explicit warning banner above the
 * destructive overwrite-import controls (legacy has no such warning).
 * All data logic is shared with legacy via src/utils/settingsBackup.ts —
 * see docs/adr/0022-settings-page-redesign.md.
 */
import { computed, ref } from "vue";
import { useToast } from "../composables/useToast";
import { useBackupImport } from "../composables/useBackupImport";
import { readJsonFile } from "../utils/jsonFile";
import { downloadBlob } from "../utils/downloadFile";
import {
  generateExportFilename,
  getExportData,
  getUndoImportBackupText,
  getUndoImportInfo,
  undoLastImport,
} from "../utils/settingsBackup";
import { useConfirm } from "../composables/useConfirm";

const { showToast } = useToast();
const { importBackupText, importEchoesText } = useBackupImport();
const echoFileInput = ref<HTMLInputElement | null>(null);

// Loads a picked .json file into the echo import box; Import stays a separate click.
async function loadEchoFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;
  const result = await readJsonFile(file);
  if ("error" in result) {
    showToast(result.error, "error");
    return;
  }
  importEchoesAddRawText.value = result.text;
}

const importedRawCharacterData = ref("");
const importEchoesAddRawText = ref("");
const fileData = ref<string | null>(null);


// "Undo last import": the data from before the last backup import, if kept.
const undoInfo = ref(getUndoImportInfo());
const undoDate = computed(() => (undoInfo.value ? new Date(undoInfo.value.savedAt).toLocaleString() : ""));
const { confirm } = useConfirm();

async function undoImport() {
  const confirmed = await confirm(
    "Replace your current characters, inventory and teams with the data from before the last backup import?",
    { title: "Undo last import", confirmLabel: "Undo import", variant: "warning" },
  );
  if (!confirmed) return;
  if (!undoLastImport()) {
    showToast("There's no earlier data to restore.", "error");
    undoInfo.value = null;
    return;
  }
  undoInfo.value = null;
  showToast("Your data from before the import is back.", "success");
  window.setTimeout(() => location.reload(), 1500);
}

function downloadUndoBackup() {
  const text = getUndoImportBackupText();
  if (text) downloadBlob(text, `before-import-${generateExportFilename()}`);
}

function copyCharacterData() {
  const data = getExportData();
  navigator.clipboard.writeText(JSON.stringify(data));
  showToast("Character data has been copied to your clipboard", "success");
}

function downloadCharacterData() {
  const data = getExportData();
  downloadBlob(JSON.stringify(data), generateExportFilename());
  showToast("Character data has been downloaded", "success");
}

function importRawCharacterData() {
  if (importBackupText(importedRawCharacterData.value)) importedRawCharacterData.value = "";
}

function handleFileUpload(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (file && file.type === "application/json") {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        fileData.value = typeof data === "string" ? data : null;
      } catch {
        showToast("Error parsing JSON file", "error");
        fileData.value = null;
      }
    };
    reader.readAsText(file);
  } else {
    showToast("Please upload a valid JSON file.", "error");
    fileData.value = null;
  }
}

function confirmUpload() {
  if (importBackupText(fileData.value)) fileData.value = null;
}

async function importEchoesAddRaw() {
  await importEchoesText(importEchoesAddRawText.value);
}
</script>
