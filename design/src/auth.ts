/**
 * Auth resolution for OpenAI-compatible API access.
 *
 * Resolution order:
 * 1. ~/.gstack/openai.json -> { "api_key": "sk-...", "base_url": "https://..." }
 * 2. OPENAI_API_KEY / OPENAI_BASE_URL environment variables
 * 3. null (caller handles guided setup or fallback)
 */

import fs from "fs";
import path from "path";

const CONFIG_PATH = path.join(process.env.HOME || "~", ".gstack", "openai.json");
const DEFAULT_BASE_URL = "https://api.openai.com";

function readConfig(): Record<string, unknown> | null {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const content = fs.readFileSync(CONFIG_PATH, "utf-8");
      return JSON.parse(content);
    }
  } catch {
    // Fall through to env vars/defaults.
  }
  return null;
}

export function resolveApiKey(): string | null {
  const config = readConfig();
  if (config?.api_key && typeof config.api_key === "string") {
    return config.api_key;
  }

  if (process.env.OPENAI_API_KEY) {
    return process.env.OPENAI_API_KEY;
  }

  return null;
}

export function resolveBaseUrl(): string {
  const config = readConfig();
  const configured = typeof config?.base_url === "string"
    ? config.base_url
    : process.env.OPENAI_BASE_URL;
  return (configured || DEFAULT_BASE_URL).replace(/\/+$/, "");
}

export function openAiUrl(pathname: string): string {
  const baseUrl = resolveBaseUrl();
  let pathWithSlash = pathname.startsWith("/") ? pathname : `/${pathname}`;

  if (baseUrl.endsWith("/v1") && pathWithSlash.startsWith("/v1/")) {
    pathWithSlash = pathWithSlash.slice(3);
  }

  return `${baseUrl}${pathWithSlash}`;
}

/**
 * Save an API key to ~/.gstack/openai.json with 0600 permissions.
 */
export function saveApiKey(key: string): void {
  const dir = path.dirname(CONFIG_PATH);
  fs.mkdirSync(dir, { recursive: true });
  const existing = readConfig() ?? {};
  const existingBaseUrl = typeof existing.base_url === "string" ? existing.base_url : undefined;
  const baseUrl = existingBaseUrl ?? process.env.OPENAI_BASE_URL;
  const nextConfig = baseUrl
    ? { ...existing, base_url: baseUrl, api_key: key }
    : { ...existing, api_key: key };
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(nextConfig, null, 2));
  fs.chmodSync(CONFIG_PATH, 0o600);
}

/**
 * Get API key or exit with setup instructions.
 */
export function requireApiKey(): string {
  const key = resolveApiKey();
  if (!key) {
    console.error("No OpenAI-compatible API key found.");
    console.error("");
    console.error("Run: $D setup");
    console.error("  or save to ~/.gstack/openai.json: { \"api_key\": \"sk-...\", \"base_url\": \"https://api.openai.com\" }");
    console.error("  or set OPENAI_API_KEY and optional OPENAI_BASE_URL environment variables");
    console.error("");
    console.error("Get an OpenAI key at: https://platform.openai.com/api-keys");
    process.exit(1);
  }
  return key;
}
