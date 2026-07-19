import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";
import escrowRouter from "../routes/escrow.js";

// Mock the services
vi.mock("../services/escrowService.js", () => ({
  depositEscrow: vi.fn(),
  releaseEscrow: vi.fn(),
  refundEscrow: vi.fn(),
  expireEscrow: vi.fn(),
  getEscrow: vi.fn(),
}));

// Mock the metrics
vi.mock("../metrics/registry.js", () => ({
  recordEscrowDeposit: vi.fn(),
  recordEscrowClosed: vi.fn(),
}));

describe("Escrow Routes - Stellar Address Validation", () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use("/api/escrow", escrowRouter);
    vi.clearAllMocks();
  });

  describe("POST /api/escrow/deposit", () => {
    it("should reject S-prefixed secret key as identity", async () => {
      const response = await request(app).post("/api/escrow/deposit").send({
        queueId: "test-queue",
        identity: "SABC1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ23456789",
        amount: 100,
        asset: "XLM",
      });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty("error");
      expect(response.body.error.message).toContain("Invalid Stellar address");
      expect(response.body.error.field).toBe("identity");
    });

    it("should reject garbage string as identity", async () => {
      const response = await request(app).post("/api/escrow/deposit").send({
        queueId: "test-queue",
        identity: "not-a-stellar-address",
        amount: 100,
        asset: "XLM",
      });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty("error");
      expect(response.body.error.message).toContain("Invalid Stellar address");
      expect(response.body.error.field).toBe("identity");
    });

    it("should accept valid G-prefixed Stellar address", async () => {
      const { depositEscrow } = await import("../services/escrowService.js");
      vi.mocked(depositEscrow).mockReturnValue({
        queueId: "test-queue",
        identity: "GABC1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ23456789",
        amount: 100,
        asset: "XLM",
        timestamp: Date.now(),
      });

      const response = await request(app)
        .post("/api/escrow/deposit")
        .send({
          queueId: "test-queue",
          identity: "G" + "A".repeat(55),
          amount: 100,
          asset: "XLM",
        });

      expect(response.status).toBe(201);
    });
  });

  describe("POST /api/escrow/release", () => {
    it("should reject escrowId with invalid embedded identity", async () => {
      const response = await request(app).post("/api/escrow/release").send({
        escrowId: "test-queue:SABC1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ23456789",
      });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty("message");
      expect(response.body.message).toBe("Invalid request");
      expect(response.body.issues).toBeDefined();
      expect(response.body.issues[0].message).toContain(
        "Invalid escrowId format",
      );
    });

    it("should reject escrowId without colon separator", async () => {
      const response = await request(app).post("/api/escrow/release").send({
        escrowId: "invalid-escrow-id",
      });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty("message");
      expect(response.body.message).toBe("Invalid request");
    });

    it("should accept valid escrowId with valid embedded identity", async () => {
      const { releaseEscrow } = await import("../services/escrowService.js");
      vi.mocked(releaseEscrow).mockReturnValue({
        queueId: "test-queue",
        identity: "GABC1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ23456789",
        amount: 100,
        asset: "XLM",
        status: "released",
      });

      const response = await request(app)
        .post("/api/escrow/release")
        .send({
          escrowId: `test-queue:G${"A".repeat(55)}`,
        });

      expect(response.status).toBe(200);
    });
  });

  describe("POST /api/escrow/refund", () => {
    it("should reject escrowId with invalid embedded identity", async () => {
      const response = await request(app).post("/api/escrow/refund").send({
        escrowId: "test-queue:SABC1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ23456789",
      });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty("message");
      expect(response.body.message).toBe("Invalid request");
      expect(response.body.issues).toBeDefined();
      expect(response.body.issues[0].message).toContain(
        "Invalid escrowId format",
      );
    });

    it("should accept valid escrowId with valid embedded identity", async () => {
      const { refundEscrow } = await import("../services/escrowService.js");
      vi.mocked(refundEscrow).mockReturnValue({
        queueId: "test-queue",
        identity: "GABC1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ23456789",
        amount: 100,
        asset: "XLM",
        status: "refunded",
      });

      const response = await request(app)
        .post("/api/escrow/refund")
        .send({
          escrowId: `test-queue:G${"A".repeat(55)}`,
        });

      expect(response.status).toBe(200);
    });
  });

  describe("POST /api/escrow/expire", () => {
    it("should reject escrowId with invalid embedded identity", async () => {
      const response = await request(app).post("/api/escrow/expire").send({
        escrowId: "test-queue:SABC1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ23456789",
      });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty("message");
      expect(response.body.message).toBe("Invalid request");
      expect(response.body.issues).toBeDefined();
      expect(response.body.issues[0].message).toContain(
        "Invalid escrowId format",
      );
    });

    it("should accept valid escrowId with valid embedded identity", async () => {
      const { expireEscrow } = await import("../services/escrowService.js");
      vi.mocked(expireEscrow).mockReturnValue({
        queueId: "test-queue",
        identity: "GABC1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ23456789",
        amount: 100,
        asset: "XLM",
        status: "expired",
      });

      const response = await request(app)
        .post("/api/escrow/expire")
        .send({
          escrowId: `test-queue:G${"A".repeat(55)}`,
        });

      expect(response.status).toBe(200);
    });
  });
});
const app = express();
app.use(express.json());
app.use("/api/escrow", escrowRouter);

describe("POST /api/escrow/deposit", () => {
  const VALID_KEY = "G" + "A".repeat(55);
  const INVALID_KEY = "S" + "A".repeat(55); // Secret key instead of public key
  const GARBAGE_KEY = "not-a-stellar-key";

  it("rejects S-prefixed secret key as identity", async () => {
    const response = await request(app).post("/api/escrow/deposit").send({
      queueId: "test-queue",
      identity: INVALID_KEY,
      amount: 100,
      asset: "XLM",
    });

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty("error");
    expect(response.body.error.field).toBe("identity");
    expect(response.body.error.message).toContain("Invalid Stellar address");
  });

  it("rejects garbage string as identity", async () => {
    const response = await request(app).post("/api/escrow/deposit").send({
      queueId: "test-queue",
      identity: GARBAGE_KEY,
      amount: 100,
      asset: "XLM",
    });

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty("error");
    expect(response.body.error.field).toBe("identity");
  });

  it("accepts valid G-prefixed Stellar address", async () => {
    const response = await request(app).post("/api/escrow/deposit").send({
      queueId: "test-queue",
      identity: VALID_KEY,
      amount: 100,
      asset: "XLM",
    });

    expect(response.status).not.toBe(400);
  });
});

describe("POST /api/escrow/release", () => {
  const VALID_KEY = "G" + "A".repeat(55);
  const INVALID_KEY = "S" + "A".repeat(55);

  it("rejects escrowId with invalid embedded identity", async () => {
    const response = await request(app)
      .post("/api/escrow/release")
      .send({
        escrowId: `test-queue:${INVALID_KEY}`,
      });

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty("message");
    expect(response.body.issues[0].message).toContain(
      "Invalid escrowId format",
    );
  });

  it("rejects escrowId with garbage embedded identity", async () => {
    const response = await request(app).post("/api/escrow/release").send({
      escrowId: "test-queue:not-a-stellar-key",
    });

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty("message");
  });

  it("rejects malformed escrowId without colon separator", async () => {
    const response = await request(app).post("/api/escrow/release").send({
      escrowId: "invalid-format-no-colon",
    });

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty("message");
  });

  it("accepts escrowId with valid embedded Stellar address", async () => {
    const response = await request(app)
      .post("/api/escrow/release")
      .send({
        escrowId: `test-queue:${VALID_KEY}`,
      });

    expect(response.status).not.toBe(400);
  });
});

describe("POST /api/escrow/refund", () => {
  const VALID_KEY = "G" + "A".repeat(55);
  const INVALID_KEY = "S" + "A".repeat(55);

  it("rejects escrowId with invalid embedded identity", async () => {
    const response = await request(app)
      .post("/api/escrow/refund")
      .send({
        escrowId: `test-queue:${INVALID_KEY}`,
      });

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty("message");
    expect(response.body.issues[0].message).toContain(
      "Invalid escrowId format",
    );
  });

  it("accepts escrowId with valid embedded Stellar address", async () => {
    const response = await request(app)
      .post("/api/escrow/refund")
      .send({
        escrowId: `test-queue:${VALID_KEY}`,
      });

    expect(response.status).not.toBe(400);
  });
});
