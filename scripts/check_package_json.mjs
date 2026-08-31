#!/usr/bin/env node
// Validates that package.json files parse as well-formed JSON with no
// duplicate keys. A standard JSON.parse silently keeps the last value for a
// duplicate key, which lets conflicting settings (e.g. "engines") ship
// unnoticed. This walks each file's tokens itself so duplicates are an error.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

function findPackageJsonFiles(dir, results = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".git") continue;
    const full = join(dir, entry);
    const stats = statSync(full);
    if (stats.isDirectory()) {
      findPackageJsonFiles(full, results);
    } else if (entry === "package.json") {
      results.push(full);
    }
  }
  return results;
}

// Minimal recursive-descent JSON parser that rejects duplicate object keys.
function parseStrict(text, filePath) {
  let i = 0;

  function error(msg) {
    throw new Error(`${filePath}: ${msg} (at offset ${i})`);
  }

  function skipWs() {
    while (i < text.length && /\s/.test(text[i])) i++;
  }

  function parseValue() {
    skipWs();
    const c = text[i];
    if (c === "{") return parseObject();
    if (c === "[") return parseArray();
    if (c === '"') return parseString();
    if (c === "t" || c === "f") return parseKeyword();
    if (c === "n") return parseKeyword();
    if (c === "-" || (c >= "0" && c <= "9")) return parseNumber();
    error(`unexpected character '${c}'`);
  }

  function parseObject() {
    i++; // {
    const seen = new Set();
    skipWs();
    if (text[i] === "}") {
      i++;
      return {};
    }
    for (;;) {
      skipWs();
      const key = parseString();
      if (seen.has(key)) error(`duplicate key '${key}'`);
      seen.add(key);
      skipWs();
      if (text[i] !== ":") error("expected ':'");
      i++;
      parseValue();
      skipWs();
      if (text[i] === ",") {
        i++;
        continue;
      }
      if (text[i] === "}") {
        i++;
        break;
      }
      error("expected ',' or '}'");
    }
    return {};
  }

  function parseArray() {
    i++; // [
    skipWs();
    if (text[i] === "]") {
      i++;
      return [];
    }
    for (;;) {
      parseValue();
      skipWs();
      if (text[i] === ",") {
        i++;
        continue;
      }
      if (text[i] === "]") {
        i++;
        break;
      }
      error("expected ',' or ']'");
    }
    return [];
  }

  function parseString() {
    if (text[i] !== '"') error("expected string");
    i++;
    let out = "";
    while (text[i] !== '"') {
      if (i >= text.length) error("unterminated string");
      if (text[i] === "\\") {
        i += 2;
      } else {
        out += text[i];
        i++;
      }
    }
    i++;
    return out;
  }

  function parseNumber() {
    const start = i;
    while (i < text.length && /[-+0-9.eE]/.test(text[i])) i++;
    return Number(text.slice(start, i));
  }

  function parseKeyword() {
    for (const kw of ["true", "false", "null"]) {
      if (text.startsWith(kw, i)) {
        i += kw.length;
        return kw === "null" ? null : kw === "true";
      }
    }
    error("invalid literal");
  }

  const result = parseValue();
  skipWs();
  if (i !== text.length) error("unexpected trailing content");
  return result;
}

const files = findPackageJsonFiles(process.cwd());
if (files.length === 0) {
  console.error("No package.json files found");
  process.exit(1);
}

let failed = false;
for (const file of files) {
  const text = readFileSync(file, "utf8");
  try {
    parseStrict(text, file);
    console.log(`OK   ${file}`);
  } catch (err) {
    console.error(`FAIL ${err.message}`);
    failed = true;
  }
}

process.exit(failed ? 1 : 0);
