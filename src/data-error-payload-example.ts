// Load environment variables from .env file
import "dotenv/config";

import { RetryService } from "./retry-service/Retry.service";
import { Logger } from "./logger-service/Logger.service";
import DataErrorPayloadUtil from "./util/data-error-payload/DataErrorPayload.utils";
import { DataErrorPayload } from "./util/data-error-payload/types/data-error-payload.types";
import {
  NetworkError,
  PaymentError,
  WalletRetrievalError,
} from "./util/custom-error/CustomError";

// Create a logger using environment variables (from .env)
const logger = Logger.create({ level: process.env.LOG_LEVEL });
const retryService = new RetryService(logger);

// Define the success response type
interface WalletData {
  id: string;
  balance: number;
  currency: string;
  lastUpdated: string;
}

/**
 * Simulates fetching a wallet from an API
 * Returns a DataErrorPayload with either wallet data or an error
 */
const fetchWallet = async (
  walletId: string
): Promise<DataErrorPayload<WalletData, Error>> => {
  try {
    // Simulate API behavior - fail for certain IDs
    if (!walletId || walletId.trim() === "") {
      throw new PaymentError("Wallet ID is required");
    }

    // Simulate not found error
    if (walletId === "non-existent") {
      throw new WalletRetrievalError("Wallet not found");
    }

    // Simulate network error
    if (walletId === "network-error") {
      throw new NetworkError("Holy shit! Network connection failed!");
    }

    // Success case - create wallet data
    const walletData: WalletData = {
      id: walletId,
      balance: 1250.75,
      currency: "USD",
      lastUpdated: new Date().toISOString(),
    };

    // Return successful payload
    return DataErrorPayloadUtil.create(walletData);
  } catch (error) {
    if (error instanceof NetworkError) {
      throw new NetworkError(error.message);
    }

    // Return error payload with the caught error
    return DataErrorPayloadUtil.createErr(
      error instanceof Error ? error : new Error(String(error))
    );
  }
};

/**
 * Example function that uses RetryService with DataErrorPayload
 * Demonstrates retrying with conditional retry based on error type
 */
const fetchWalletWithRetry = async (
  walletId: string
): Promise<DataErrorPayload<WalletData, Error>> => {
  try {
    const result = await retryService.retry(
      async () => {
        const response = await fetchWallet(walletId);

        console.log("RESPONSE AFTER SERVICE CALL---->", response);

        return response;
      },
      {
        retries: 3,
        delay: 1000,
        exponentialBackoff: true,
        retryOnResult: (result) => {
          if (
            DataErrorPayloadUtil.isErr(result) &&
            result.error.message === "Wallet not found"
          ) {
            return true;
          }

          return false;
        },
        onComplete: (report) => {
          logger.info(
            `[REPORT] Operation completed after ${report.attempts} attempts`
          );
          logger.info(`[REPORT]: ${JSON.stringify(report, null, 2)}`);

          if (report.errors.length > 0) {
            logger.debug("Errors encountered:", report.errors);
          }
        },
      }
    );

    // Successful retry result already contains DataErrorPayload
    return result;
  } catch (error: any) {
    console.log(
      "ERROR IN CATCH AFTER SERVICE CALL---->",
      JSON.stringify(error, null, 2)
    );

    // We got an error that couldn't be retried or retries were exhausted
    return DataErrorPayloadUtil.createErr(
      error instanceof Error ? error : new Error(String(error))
    );
  }
};

/**
 * Demonstrates processing a DataErrorPayload result
 */
const processWalletResult = (
  result: DataErrorPayload<WalletData, Error>
): void => {
  // Check if the result is successful
  if (DataErrorPayloadUtil.isOk(result)) {
    // Extract the data
    const walletData = DataErrorPayloadUtil.extractOkPayload(result);
    logger.info("Successfully fetched wallet:", walletData);
    logger.info(`Wallet balance: ${walletData.balance} ${walletData.currency}`);
  } else {
    // Extract the error
    const error = DataErrorPayloadUtil.extractErrorPayload(result);
    logger.error(`Error fetching wallet: ${error.message}`);

    // Handle different error types
    if (error instanceof PaymentError) {
      logger.info("Please check the payment parameters");
    } else if (error instanceof WalletRetrievalError) {
      logger.info("Please verify the wallet exists");
    } else {
      logger.info("A system error occurred. Please try again later");
    }
  }
};

// Run examples with different scenarios
const runDataErrorPayloadExamples = async (): Promise<void> => {
  logger.info("DATA ERROR PAYLOAD EXAMPLE");
  logger.info("=========================");

  // Example 1: Successful fetch
  /* logger.info("\nExample 1: Successful fetch (valid wallet)");
  const successResult = await fetchWalletWithRetry("wallet-123");
  processWalletResult(successResult); */

  // Example 2: Payment error (empty wallet ID)
  /* logger.info("\nExample 2: Payment error (empty wallet ID)");
  const paymentErrorResult = await fetchWalletWithRetry("");
  processWalletResult(paymentErrorResult); */

  // Example 3: Network error with retry
  /* logger.info("\nExample 3: Network error with retry");
  const networkErrorResult = await fetchWalletWithRetry("network-error");
  processWalletResult(networkErrorResult); */

  // Example 4: Wallet retrieval error with DataErrorPayload
  logger.info("\nExample 4: Wallet retrieval error (non-existent wallet)");
  const walletErrorResult = await fetchWalletWithRetry("non-existent");
  processWalletResult(walletErrorResult);
};

// Execute examples
runDataErrorPayloadExamples().catch((error) => {
  logger.error("Error running examples:", error);
});
