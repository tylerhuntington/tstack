/**
 * Auth resolution for OpenAI-compatible API access.
 *
 * Resolution order:
 * 1. ~/.gstack/openai.json -> { "api_key": "sk-...", "base_url": "https://..." }
 * 2. OPENAI_API_KEY / OPENAI_BASE_URL environment variables
 * 3. null (caller handles guided setup or fallback)
 */

import fs from "fs";
import os from "os";
import path from "path";
import { spawnSync } from "node:child_process";

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

function shouldForceIpv6(url: string): boolean {
  if (process.env.OPENAI_FORCE_IPV4 === "1") return false;
  if (process.env.OPENAI_FORCE_IPV6 === "1") return true;

  try {
    return new URL(url).hostname === "api.cborg.lbl.gov";
  } catch {
    return false;
  }
}

function headerEntries(headers: RequestInit["headers"]): [string, string][] {
  if (!headers) return [];
  if (headers instanceof Headers) {
    return Array.from(headers.entries());
  }
  if (Array.isArray(headers)) {
    return headers.map(([key, value]) => [key, String(value)]);
  }
  return Object.entries(headers).map(([key, value]) => [key, String(value)]);
}

function quoteCurlConfig(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function curlTimeoutSeconds(): number {
  const timeoutMs = Number(process.env.OPENAI_TIMEOUT_MS || 120_000);
  return Number.isFinite(timeoutMs) ? Math.max(1, Math.ceil(timeoutMs / 1000)) : 120;
}

async function curlIpv6Fetch(url: string, init: RequestInit): Promise<Response> {
  const method = init.method || "GET";
  const body = typeof init.body === "string" ? init.body : init.body ? String(init.body) : "";
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gstack-openai-curl-"));
  const configPath = path.join(tmpDir, "curl.conf");

  const configLines = [
    "ipv6",
    "silent",
    "show-error",
    `max-time = ${curlTimeoutSeconds()}`,
    `request = ${quoteCurlConfig(method)}`,
    `url = ${quoteCurlConfig(url)}`,
    ...headerEntries(init.headers).map(([key, value]) => `header = ${quoteCurlConfig(`${key}: ${value}`)}`),
  ];

  fs.writeFileSync(configPath, `${configLines.join("\n")}\n`, { mode: 0o600 });

  try {
    const args = ["--config", configPath, "--write-out", "\n%{http_code}"];
    if (body) {
      args.push("--data-binary", "@-");
    }

    const result = spawnSync("curl", args, {
      input: body,
      encoding: "utf-8",
      maxBuffer: 80 * 1024 * 1024,
    });

    const stdout = result.stdout || "";
    const stderr = result.stderr || "";

    if (result.error || result.status !== 0) {
      const message = stderr.trim() || result.error?.message || `curl exited with status ${result.status}`;
      return new Response(JSON.stringify({ error: { message, type: "transport_error" } }), { status: 599 });
    }

    const splitAt = stdout.lastIndexOf("\n");
    const responseText = splitAt >= 0 ? stdout.slice(0, splitAt) : stdout;
    const statusText = splitAt >= 0 ? stdout.slice(splitAt + 1).trim() : "200";
    const status = Number.parseInt(statusText, 10) || 200;
    return new Response(responseText, {
      status,
      headers: { "content-type": "application/json" },
    });
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

export async function openAiFetch(pathname: string, init: RequestInit): Promise<Response> {
  const url = openAiUrl(pathname);
  if (shouldForceIpv6(url)) {
    return curlIpv6Fetch(url, init);
  }
  return fetch(url, init);
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
