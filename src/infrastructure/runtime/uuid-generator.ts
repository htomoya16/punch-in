import type { IdGenerator } from "../../application/ports/id-generator";

export const uuidGenerator: IdGenerator = { generate: () => crypto.randomUUID() };
