/**
 * Error thrown when general payment-related operations fail
 */
export class PaymentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PaymentError";
  }
}

/**
 * Error thrown when wallet operations fail
 */
export class WalletRetrievalError extends Error {
  constructor(message?: string) {
    super(message ?? "Failed to retrieve wallet data");
    this.name = "WalletRetrievalError";
  }
}

/**
 * Error thrown when network operations fail
 */
export class NetworkError extends Error {
  constructor(message?: string) {
    super(message ?? "Network connection failed");
    this.name = "NetworkError";
  }
}
