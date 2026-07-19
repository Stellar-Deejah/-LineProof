import { Router, type IRouter, Response } from "express";
import { z } from "zod";
import {
  enrollIdentity,
  cancelEnrollment,
  getEnrollmentsByIdentity,
  getEnrollmentsByQueue,
} from "../services/enrollmentService.js";
import { recordEnrollment } from "../metrics/registry.js";
import { validateStellarAddress } from "../middleware/validateStellarAddress.js";
import { StellarAddress } from "../schemas/stellar.js";
import {
  lineproofClient,
  readEnrollmentOnChain,
  submitEnrollment,
} from "../contracts/lineproofClient.js";

const router: IRouter = Router();

const EnrollSchema = z.object({
  queueId: z.string().min(1),
  identity: StellarAddress,
});

const CancelSchema = z.object({
  queueId: z.string().min(1),
  identity: StellarAddress,
});

router.post(
  "/enroll",
  validateStellarAddress(["identity"]),
  async (req: any, res: Response, next) => {
    const parsed = EnrollSchema.safeParse(req.body);
    if (!parsed.success)
      return res
        .status(400)
        .json({ message: "Invalid request", issues: parsed.error.issues });

    try {
      if (lineproofClient) {
        const transactionHash = await submitEnrollment(
          parsed.data.queueId,
          parsed.data.identity,
        );
        recordEnrollment(parsed.data.queueId);
        return res
          .status(201)
          .json({ ...parsed.data, transactionHash, source: "on-chain" });
      }
      const result = enrollIdentity(parsed.data.queueId, parsed.data.identity);
      if (result.conflict)
        return res
          .status(409)
          .json({ message: "Duplicate enrollment blocked" });
      recordEnrollment(result.queueId);
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  "/cancel",
  validateStellarAddress(["identity"]),
  (req: any, res: Response, next) => {
    const parsed = CancelSchema.safeParse(req.body);
    if (!parsed.success)
      return res
        .status(400)
        .json({ message: "Invalid request", issues: parsed.error.issues });

    try {
      const ok = cancelEnrollment(parsed.data.queueId, parsed.data.identity);
      if (!ok) return res.status(404).json({ message: "Enrollment not found" });
      res.status(200).json({ message: "Enrollment cancelled" });
    } catch (err) {
      next(err);
    }
  },
);

router.get("/queue/:queueId", (req, res: Response) => {
  const records = getEnrollmentsByQueue(req.params.queueId);
  res.setHeader("X-Data-Source", "mock");
  res.json(records);
});

router.get("/:identity", async (req, res: Response, next) => {
  try {
    const enrolled = await readEnrollmentOnChain(req.params.identity);
    if (enrolled !== undefined) {
      res.setHeader("X-Data-Source", "on-chain");
      return res.json([{ identity: req.params.identity, enrolled }]);
    }
    const record = getEnrollmentsByIdentity(req.params.identity);
    res.setHeader("X-Data-Source", "mock");
    if (!record || record.length === 0)
      return res.status(404).json({ message: "No enrollments found" });
    res.json(record);
  } catch (err) {
    next(err);
  }
});

export default router;
