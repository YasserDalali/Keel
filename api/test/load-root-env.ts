import fs from "node:fs";
import path from "node:path";
import { BINDING_KEYS, OPTIONAL_BINDING_KEYS, type BindingKey } from "../src/env/binding-keys";

const ROOT_ENV = path.resolve(process.cwd(), "../.env");

function parseEnvFile(filePath: string): Record<string, string> {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing ${filePath} — copy .env.example to .env and fill in values.`);
  }

  const out: Record<string, string> = {};
  for (const line of fs.readFileSync(filePath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    out[key] = value;
  }
  return out;
}

export function loadRootEnvBindings(): Record<BindingKey, string> {
  const parsed = parseEnvFile(ROOT_ENV);
  const bindings = {} as Record<BindingKey, string>;

  for (const key of BINDING_KEYS) {
    const value = parsed[key];
    if (value === undefined || (value === "" && !OPTIONAL_BINDING_KEYS.has(key))) {
      throw new Error(`Missing or empty ${key} in ${ROOT_ENV}`);
    }
    bindings[key] = value ?? "";
  }

  return bindings;
}
