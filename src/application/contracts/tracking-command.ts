import { recordEditSchema } from "../validation/record-edit-schema";
import { z } from "zod";

export const workInput = z.object({
  id: z.string().min(1).max(100),
  control: z.enum([
    "join",
    "pause",
    "resume",
    "finish",
    "end",
    "pauseAll",
    "resumeAll",
    "allocate",
    "remove",
    "timing",
    "edit",
  ]),
  edit: recordEditSchema.optional(),
  categoryId: z.string().min(1).max(100).optional(),
  memberId: z.string().min(1).max(100).optional(),
  startedAt: z.number().int().min(0).max(253402300799000).optional(),
  endedAt: z.number().int().min(0).max(253402300799000).nullable().optional(),
  mode: z.enum(["auto", "ratio", "manual"]).optional(),
  values: z.record(z.string(), z.number().finite().min(0).max(315576000000)).optional(),
});
