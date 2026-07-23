import cors from "cors";
import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createCorsOptions,
  validateCorsOrigins,
} from "../middleware/corsConfig.js";

describe("validateCorsOrigins", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("accepts exact HTTPS origins", () => {
    expect(
      validateCorsOrigins([
        "https://lineproof.example",
        "https://admin.lineproof.example:8443",
      ]),
    ).toEqual([
      "https://lineproof.example",
      "https://admin.lineproof.example:8443",
    ]);
  });

  it("filters empty entries and warns", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    expect(validateCorsOrigins(["https://lineproof.example", " ", ""])).toEqual(
      ["https://lineproof.example"],
    );
    expect(warn).toHaveBeenCalledOnce();
  });

  it("rejects an empty origin list after filtering", () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    expect(() => validateCorsOrigins(["", "  "])).toThrow(
      "CORS_ORIGINS must contain at least one explicit trusted origin",
    );
  });

  it("rejects wildcard and glob origins", () => {
    expect(() => validateCorsOrigins(["*"])).toThrow(
      "wildcards are not allowed",
    );
    expect(() => validateCorsOrigins(["https://*.lineproof.example"])).toThrow(
      "wildcards are not allowed",
    );
  });

  it.each([
    "lineproof.example",
    "ftp://lineproof.example",
    "https://lineproof.example/",
    "https://lineproof.example/path",
  ])("rejects invalid origin %s", (origin) => {
    expect(() => validateCorsOrigins([origin])).toThrow("Invalid CORS origin");
  });

  it("allows a localhost development origin", () => {
    expect(validateCorsOrigins(["http://localhost:5173"])).toEqual([
      "http://localhost:5173",
    ]);
  });
});

describe("CORS middleware", () => {
  it("returns a ten-minute preflight cache duration for an allowed origin", async () => {
    const app = express();
    app.use(cors(createCorsOptions(["https://lineproof.example"])));
    app.get("/health", (_request, response) => response.json({ ok: true }));

    const response = await request(app)
      .options("/health")
      .set("Origin", "https://lineproof.example")
      .set("Access-Control-Request-Method", "GET");

    expect(response.status).toBe(204);
    expect(response.headers["access-control-allow-origin"]).toBe(
      "https://lineproof.example",
    );
    expect(response.headers["access-control-max-age"]).toBe("600");
    expect(response.headers.vary).toContain("Origin");
  });
});
