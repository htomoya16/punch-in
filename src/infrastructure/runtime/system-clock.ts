import type { Clock } from "../../application/ports/clock";

export const systemClock: Clock = { now: () => Date.now() };
