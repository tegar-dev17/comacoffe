import { ProviderCapabilityError } from "./providers/midtrans.adapter.js";
import {
  PaymentConflictError,
  PaymentForbiddenError,
  PaymentNotFoundError,
  PaymentValidationError,
} from "./services/payment.service.js";
import { InventoryError } from "../pos/inventory.service.js";

export function mapPaymentDomainError(err: unknown): { status: number; body: { error: string } } | null {
  if (err instanceof PaymentNotFoundError) return { status: 404, body: { error: err.message } };
  if (err instanceof PaymentForbiddenError) return { status: 403, body: { error: err.message } };
  if (err instanceof PaymentValidationError) return { status: 400, body: { error: err.message } };
  if (err instanceof PaymentConflictError) return { status: 409, body: { error: err.message } };
  if (err instanceof ProviderCapabilityError) return { status: 422, body: { error: err.message } };
  if (err instanceof InventoryError) return { status: 409, body: { error: err.message } };
  return null;
}
