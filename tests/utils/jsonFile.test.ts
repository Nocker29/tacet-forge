import { describe, it, expect } from "vitest";
import { MAX_JSON_FILE_BYTES, readJsonFile } from "../../src/utils/jsonFile";

describe("readJsonFile", () => {
  it("returns the text of a valid JSON file", async () => {
    const file = new File(['[{"echo":"Jue"}]'], "echoes.json", { type: "application/json" });
    expect(await readJsonFile(file)).toEqual({ text: '[{"echo":"Jue"}]' });
  });

  it("rejects invalid JSON", async () => {
    expect(await readJsonFile(new File(["not json"], "bad.json"))).toEqual({ error: "bad.json isn't valid JSON." });
  });

  it("rejects files over the size limit without reading them", async () => {
    const file = new File(["[]"], "big.json");
    Object.defineProperty(file, "size", { value: MAX_JSON_FILE_BYTES + 1 });
    expect(await readJsonFile(file)).toEqual({ error: "big.json is too big (over 20 MB)." });
  });
});
