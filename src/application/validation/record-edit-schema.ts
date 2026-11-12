import { z } from "zod";

const timestamp = z.number().int().min(0).max(253402300799000);
export const recordEditSchema = z.object({
  expectedStructure: z.string().max(4_000_000),
  expectedMemos: z.record(z.string(), z.string().max(2000)),
  mode: z.enum(["auto", "ratio", "manual"]),
  entries: z
    .array(
      z.object({
        id: z.string().min(1).max(100),
        memo: z.string().max(2000),
        weight: z.number().finite().min(0).max(1000000),
        manualMs: z.number().int().min(0).max(315576000000).optional(),
        intervals: z
          .array(z.object({ start: timestamp, end: timestamp.nullable() }))
          .min(1)
          .max(10000),
      }),
    )
    .max(1000),
});
