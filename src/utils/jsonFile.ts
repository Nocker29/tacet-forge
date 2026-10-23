/**
 * Tacet Forge: reads a user-picked .json file for the import text boxes.
 * Returns the file's text (validated as JSON) or a message for the user.
 */
export const MAX_JSON_FILE_BYTES = 20 * 1024 * 1024;

function readAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

export async function readJsonFile(file: File): Promise<{ text: string } | { error: string }> {
  if (file.size > MAX_JSON_FILE_BYTES) {
    return { error: `${file.name} is too big (over ${MAX_JSON_FILE_BYTES / 1024 / 1024} MB).` };
  }
  let text: string;
  try {
    text = await readAsText(file);
  } catch {
    return { error: `Couldn't read ${file.name}.` };
  }
  try {
    JSON.parse(text);
  } catch {
    return { error: `${file.name} isn't valid JSON.` };
  }
  return { text };
}
