import { Router, type IRouter, Response } from "express";
import { z } from "zod";
import {
  depositEscrow,
  releaseEscrow,
  refundEscrow,
  expireEscrow,
  getEscrow,
} from "../services/escrowService.js";
import {
  recordEscrowDeposit,
  recordEscrowClosed,
} from "../metrics/registry.js";
import { validateStellarAddress } from "../middleware/validateStellarAddress.js";
import { StellarAddress } from "../schemas/stellar.js";
import {
  contractAdapter,
  ContractReadUnavailableError,
} from "../contracts/index.js";
import {
  lineproofClient,
  submitEscrowDeposit,
} from "../contracts/lineproofClient.js";

const router: IRouter = Router();

const DepositSchema = z.object({
  queueId: z.string().min(1),
  identity: StellarAddress,
  amount: z.number().positive(),
  asset: z.string().min(1),
  holdDays: z.number().int().positive().optional(),
});

const EscrowActionSchema = z.object({
  escrowId: z
    .string()
    .min(1)
    .refine(
      (value) => {
        // escrowId format: ${queueId}:${identity}
        const parts = value.split(":");
        if (parts.length !== 2) return false;
        const identity = parts[1];
        return /^G[A-Z2-7]{55}$/.test(identity);
      },
      {
        message:
          "Invalid escrowId format. Must be ${queueId}:${identity} where identity is a valid Stellar address.",
      },
    ),
});

router.post(
  "/deposit",
  validateStellarAddress(["identity"]),
  async (req: any, res: Response, next) => {
    const parsed = DepositSchema.safeParse(req.body);
    if (!parsed.success)
      return res
        .status(400)
        .json({ message: "Invalid request", issues: parsed.error.issues });
    try {
      if (lineproofClient) {
        const transactionHash = await submitEscrowDeposit(
          parsed.data.amount,
          parsed.data.asset,
        );
        recordEscrowDeposit(parsed.data.asset);
        return res
          .status(201)
          .json({ ...parsed.data, transactionHash, source: "on-chain" });
      }
      const record = depositEscrow(parsed.data);
      recordEscrowDeposit(record.asset);
      res.status(201).json(record);
    } catch (err) {
      next(err);
    }
  },
);

router.post("/release", (req: any, res: Response, next) => {
  const parsed = EscrowActionSchema.safeParse(req.body);
  if (!parsed.success)
    return res
      .status(400)
      .json({ message: "Invalid request", issues: parsed.error.issues });
  try {
    const updated = releaseEscrow(parsed.data.escrowId);
    if (!updated) return res.status(404).json({ message: "Escrow not found" });
    recordEscrowClosed();
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

router.post("/refund", (req: any, res: Response, next) => {
  const parsed = EscrowActionSchema.safeParse(req.body);
  if (!parsed.success)
    return res
      .status(400)
      .json({ message: "Invalid request", issues: parsed.error.issues });
  try {
    const updated = refundEscrow(parsed.data.escrowId);
    if (!updated) return res.status(404).json({ message: "Escrow not found" });
    recordEscrowClosed();
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

router.post("/expire", (req: any, res: Response, next) => {
  const parsed = EscrowActionSchema.safeParse(req.body);
  if (!parsed.success)
    return res
      .status(400)
      .json({ message: "Invalid request", issues: parsed.error.issues });
  try {
    const updated = expireEscrow(parsed.data.escrowId);
    if (!updated) return res.status(404).json({ message: "Escrow not found" });
    recordEscrowClosed();
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

router.get("/:id", async (req, res: Response, next) => {
  try {
    if (contractAdapter) {
      try {
        const onChain = await contractAdapter.getEscrowRecord(req.params.id);
        if (onChain) {
          res.setHeader("X-Data-Source", "on-chain");
          return res.json(onChain);
        }
      } catch (err) {
        if (!(err instanceof ContractReadUnavailableError)) throw err;
      }
    }
    const record = getEscrow(req.params.id);
    res.setHeader("X-Data-Source", "mock");
    if (!record) return res.status(404).json({ message: "Escrow not found" });
    res.json(record);
  } catch (err) {
    next(err);
  }
});

export default router;
