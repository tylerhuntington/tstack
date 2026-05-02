import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import fs from "fs";
import os from "os";
import path from "path";

type AuthModule = typeof import("../src/auth");

describe("design auth", () => {
  let tmpHome: string;
  let originalHome: string | undefined;
  let originalApiKey: string | undefined;
  let originalBaseUrl: string | undefined;
  let auth: AuthModule;

  beforeAll(async () => {
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "gstack-design-auth-"));
    originalHome = process.env.HOME;
    originalApiKey = process.env.OPENAI_API_KEY;
    originalBaseUrl = process.env.OPENAI_BASE_URL;
    process.env.HOME = tmpHome;
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_BASE_URL;

    auth = await import(`../src/auth.ts?test=${Date.now()}`) as AuthModule;
  });

  afterAll(() => {
    if (originalHome === undefined) delete process.env.HOME;
    else process.env.HOME = originalHome;
    if (originalApiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalApiKey;
    if (originalBaseUrl === undefined) delete process.env.OPENAI_BASE_URL;
    else process.env.OPENAI_BASE_URL = originalBaseUrl;
    fs.rmSync(tmpHome, { recursive: true, force: true });
  });

  test("uses OpenAI API root by default", () => {
    expect(auth.openAiUrl("/v1/responses")).toBe("https://api.openai.com/v1/responses");
  });

  test("uses OPENAI_BASE_URL for OpenAI-compatible providers", () => {
    process.env.OPENAI_BASE_URL = "https://api.cborg.lbl.gov/";
    expect(auth.openAiUrl("/v1/responses")).toBe("https://api.cborg.lbl.gov/v1/responses");
  });

  test("does not duplicate /v1 when the base URL includes it", () => {
    process.env.OPENAI_BASE_URL = "https://api.cborg.lbl.gov/v1";
    expect(auth.openAiUrl("/v1/chat/completions")).toBe("https://api.cborg.lbl.gov/v1/chat/completions");
  });

  test("config file base_url wins and saveApiKey preserves it", () => {
    const configDir = path.join(tmpHome, ".gstack");
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(
      path.join(configDir, "openai.json"),
      JSON.stringify({ base_url: "https://api.cborg.lbl.gov", api_key: "test-existing-key" }, null, 2)
    );

    process.env.OPENAI_BASE_URL = "https://api.openai.com";
    expect(auth.openAiUrl("/v1/responses")).toBe("https://api.cborg.lbl.gov/v1/responses");
    expect(auth.resolveApiKey()).toBe("test-existing-key");

    auth.saveApiKey("test-updated-key");
    const saved = JSON.parse(fs.readFileSync(path.join(configDir, "openai.json"), "utf-8"));
    expect(saved).toEqual({ base_url: "https://api.cborg.lbl.gov", api_key: "test-updated-key" });
  });
test("saveApiKey stores OPENAI_BASE_URL when no config base_url exists", () => {
  const configDir = path.join(tmpHome, ".gstack");
  const configPath = path.join(configDir, "openai.json");
  fs.rmSync(configPath, { force: true });

  process.env.OPENAI_BASE_URL = "https://api.cborg.lbl.gov";
  auth.saveApiKey("test-env-base-key");

  const saved = JSON.parse(fs.readFileSync(configPath, "utf-8"));
  expect(saved).toEqual({ base_url: "https://api.cborg.lbl.gov", api_key: "test-env-base-key" });
});

});
