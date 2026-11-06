import { getConnectorBinding } from "./connector-context";
import { createConnectors } from "./connector-contract.mjs";

/** Keep invocation context on this request; never cache it across visitors. */
export function connectorsForRequest() {
  return createConnectors(getConnectorBinding());
}

export type {
  ConnectorContext,
  ConnectorFailureStatus,
  ConnectorResult,
  Json,
} from "./connector-contract.mjs";
