import type { CorsOptions } from "cors";

const DEFAULT_CORS_ORIGIN = "http://localhost:5173";

/**
 * Validate configured CORS origins before the HTTP server starts.
 *
 * The cors package compares string origins exactly. Accepting globs, paths, or
 * trailing slashes here would therefore create misleading configuration that
 * never matches a browser Origin header.
 */
export function validateCorsOrigins(origins: string[]): string[] {
  const normalized = origins.map((origin) => origin.trim());
  const emptyOriginCount = normalized.filter(
    (origin) => origin.length === 0,
  ).length;

  if (emptyOriginCount > 0) {
    console.warn(
      `[cors] Ignoring ${emptyOriginCount} empty CORS origin entr${emptyOriginCount === 1 ? "y" : "ies"}.`,
    );
  }

  const validatedOrigins = normalized
    .filter((origin) => origin.length > 0)
    .map((origin) => {
      if (origin.includes("*")) {
        throw new Error(
          `Invalid CORS origin "${origin}": wildcards are not allowed; configure each trusted origin explicitly.`,
        );
      }

      let parsed: URL;
      try {
        parsed = new URL(origin);
      } catch {
        throw new Error(
          `Invalid CORS origin "${origin}": expected an absolute http:// or https:// URL.`,
        );
      }

      if (
        (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
        parsed.origin !== origin
      ) {
        throw new Error(
          `Invalid CORS origin "${origin}": use an exact http(s) origin without a path, query, hash, credentials, or trailing slash.`,
        );
      }

      return origin;
    });

  if (validatedOrigins.length === 0) {
    throw new Error(
      "CORS_ORIGINS must contain at least one explicit trusted origin.",
    );
  }

  return validatedOrigins;
}

export function corsOriginsFromEnvironment(
  value = process.env.CORS_ORIGINS ?? DEFAULT_CORS_ORIGIN,
): string[] {
  return validateCorsOrigins(value.split(","));
}

export function createCorsOptions(origins: string[]): CorsOptions {
  return {
    origin: origins,
    maxAge: 600,
  };
}
