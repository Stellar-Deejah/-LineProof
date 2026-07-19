import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";
import enrollmentsRouter from "../routes/enrollments.js";

// Mock the services
vi.mock("../services/enrollmentService.js", () => ({
  enrollIdentity: vi.fn(),
  cancelEnrollment: vi.fn(),
  getEnrollmentsByIdentity: vi.fn(),
  getEnrollmentsByQueue: vi.fn(),
}));

// Mock the metrics
vi.mock("../metrics/registry.js", () => ({
  recordEnrollment: vi.fn(),
}));

describe("Enrollments Routes - Stellar Address Validation", () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use("/api/enrollments", enrollmentsRouter);
    vi.clearAllMocks();
  });

  describe("POST /api/enrollments/enroll", () => {
    it("should reject S-prefixed secret key as identity", async () => {
      const response = await request(app).post("/api/enrollments/enroll").send({
        queueId: "test-queue",
        identity: "SABC1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ23456789", // S-prefixed (secret key)
      });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty("error");
      expect(response.body.error.message).toContain("Invalid Stellar address");
      expect(response.body.error.field).toBe("identity");
    });

    it("should reject garbage string as identity", async () => {
      const response = await request(app).post("/api/enrollments/enroll").send({
        queueId: "test-queue",
        identity: "not-a-stellar-address",
      });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty("error");
      expect(response.body.error.message).toContain("Invalid Stellar address");
      expect(response.body.error.field).toBe("identity");
    });

    it("should reject empty string as identity", async () => {
      const response = await request(app).post("/api/enrollments/enroll").send({
        queueId: "test-queue",
        identity: "",
      });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty("error");
      expect(response.body.error.message).toContain("Invalid Stellar address");
      expect(response.body.error.field).toBe("identity");
    });

    it("should accept valid G-prefixed Stellar address", async () => {
      const { enrollIdentity } =
        await import("../services/enrollmentService.js");
      vi.mocked(enrollIdentity).mockReturnValue({
        queueId: "test-queue",
        identity: "GABC1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ23456789",
        timestamp: Date.now(),
        conflict: false,
      });

      const response = await request(app)
        .post("/api/enrollments/enroll")
        .send({
          queueId: "test-queue",
          identity: "G" + "A".repeat(55),
        });

      expect(response.status).toBe(201);
    });
  });

  describe("POST /api/enrollments/cancel", () => {
    it("should reject S-prefixed secret key as identity", async () => {
      const response = await request(app).post("/api/enrollments/cancel").send({
        queueId: "test-queue",
        identity: "SABC1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ23456789",
      });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty("error");
      expect(response.body.error.message).toContain("Invalid Stellar address");
      expect(response.body.error.field).toBe("identity");
    });

    it("should reject garbage string as identity", async () => {
      const response = await request(app).post("/api/enrollments/cancel").send({
        queueId: "test-queue",
        identity: "invalid-identity",
      });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty("error");
      expect(response.body.error.message).toContain("Invalid Stellar address");
      expect(response.body.error.field).toBe("identity");
    });

    it("should accept valid G-prefixed Stellar address", async () => {
      const { cancelEnrollment } =
        await import("../services/enrollmentService.js");
      vi.mocked(cancelEnrollment).mockReturnValue(true);

      const response = await request(app)
        .post("/api/enrollments/cancel")
        .send({
          queueId: "test-queue",
          identity: "G" + "A".repeat(55),
        });

      expect(response.status).toBe(200);
    });
  });
});
const app = express();
app.use(express.json());
app.use("/api/enrollments", enrollmentsRouter);

describe("POST /api/enrollments/enroll", () => {
  const VALID_KEY = "G" + "A".repeat(55);
  const INVALID_KEY = "S" + "A".repeat(55); // Secret key instead of public key
  const GARBAGE_KEY = "not-a-stellar-key";

  it("rejects S-prefixed secret key as identity", async () => {
    const response = await request(app).post("/api/enrollments/enroll").send({
      queueId: "test-queue",
      identity: INVALID_KEY,
    });

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty("error");
    expect(response.body.error.field).toBe("identity");
    expect(response.body.error.message).toContain("Invalid Stellar address");
  });

  it("rejects garbage string as identity", async () => {
    const response = await request(app).post("/api/enrollments/enroll").send({
      queueId: "test-queue",
      identity: GARBAGE_KEY,
    });

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty("error");
    expect(response.body.error.field).toBe("identity");
  });

  it("rejects empty string as identity", async () => {
    const response = await request(app).post("/api/enrollments/enroll").send({
      queueId: "test-queue",
      identity: "",
    });

    expect(response.status).toBe(400);
  });

  it("accepts valid G-prefixed Stellar address", async () => {
    const response = await request(app).post("/api/enrollments/enroll").send({
      queueId: "test-queue",
      identity: VALID_KEY,
    });

    // Should not return 400 for invalid address
    // May return other status codes based on business logic
    expect(response.status).not.toBe(400);
  });
});

describe("POST /api/enrollments/cancel", () => {
  const VALID_KEY = "G" + "A".repeat(55);
  const INVALID_KEY = "S" + "A".repeat(55);

  it("rejects S-prefixed secret key as identity", async () => {
    const response = await request(app).post("/api/enrollments/cancel").send({
      queueId: "test-queue",
      identity: INVALID_KEY,
    });

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty("error");
    expect(response.body.error.field).toBe("identity");
  });

  it("accepts valid G-prefixed Stellar address", async () => {
    const response = await request(app).post("/api/enrollments/cancel").send({
      queueId: "test-queue",
      identity: VALID_KEY,
    });

    expect(response.status).not.toBe(400);
  });
});
