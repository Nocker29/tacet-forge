<template>
  <h3 class="text-2xl font-bold mb-4">Overwrite your existing data</h3>

  <div class="card card-bordered card-compact bg-base-100 shadow mb-2">
    <div class="card-body">
      <h3 class="card-title">Import from text</h3>
      <p>
        Import your character data? Paste your data here. This will overwrite
        your existing data.
      </p>
      <textarea
        v-model="importedRawCharacterData"
        class="textarea textarea-bordered"
        data-test-import-raw-text></textarea>
      <button @click="importRawCharacterData" class="btn btn-error" data-test-import-raw-button>
        Confirm Import
      </button>
    </div>
  </div>

  <div class="card card-bordered card-compact bg-base-100 shadow mb-2">
    <div class="card-body">
      <h3 class="card-title">Import from file</h3>
      <p>Upload your character data? This will overwrite your existing data.</p>
      <input
        type="file"
        @change="handleFileUpload"
        accept=".json"
        class="file-input file-input-bordered" />
      <textarea
        v-model="fileData"
        readonly
        class="textarea textarea-bordered"></textarea>
      <button @click="confirmUpload" class="btn btn-error">
        Confirm Overwrite with File Data
      </button>
    </div>
  </div>

  <h3 class="text-2xl font-bold mb-4">Import echoes</h3>

  <div class="card card-bordered card-compact bg-base-100 shadow mb-2">
    <div class="card-body">
      <h3 class="card-title">Import from text</h3>
      <p>
        This will import a list of echoes and <strong>add</strong> them to your inventory. It will not replace your inventory. It should be in JSON format, and an array of echo objects.
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
          class="btn btn-outline"
          aria-label="Choose a JSON file to load into the echo import box"
          data-test-import-echoes-choose-file
          @click="echoFileInput?.click()">
          Choose JSON file…
        </button>
        <button @click="importEchoesAddRaw" class="btn btn-primary" data-test-import-raw-echoes-button>
          Confirm Import Echoes
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * On import we apply pending transforms from meta.version, then mark current.
 * See src/utils/settingsBackup.ts for the shared import/export/version logic.
 */
import { ref } from "vue";
import { useToast } from "../composables/useToast";
import { useBackupImport } from "../composables/useBackupImport";
import { readJsonFile } from "../utils/jsonFile";

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


/**
 * Imports the raw character data through a given string in the input
 */
function importRawCharacterData() {
  if (importBackupText(importedRawCharacterData.value)) importedRawCharacterData.value = "";
}

/**
 * Process the file and store the data
 */
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

/**
 * Confirms the file upload and overwrite the data
 */
function confirmUpload() {
  if (importBackupText(fileData.value)) fileData.value = null;
}

async function importEchoesAddRaw() {
  await importEchoesText(importEchoesAddRawText.value);
}
</script>

<style scoped lang="scss">
.actions {
  display: flex;
  gap: 2rem;

  @media (max-width: 660px) {
    flex-direction: column;
  }
}
textarea {
  min-width: 320px;
  min-height: 3rem;
  display: block;

  @media (max-width: 900px) {
    min-width: 240px;
  }
}
.notification {
  background: #045c04;
  border-radius: 6px;
  padding: 0.5rem 1rem;
  margin-bottom: 1rem;
  position: sticky;
  top: 0;
  left: 0;
  width: 100%;
  height: 1.5rem;

  &.notification--error {
    background: #890725;
  }
}
input[type="file"] {
  margin-bottom: 1rem;
}
.mb-1 {
  margin-bottom: 1rem;
}
</style>
