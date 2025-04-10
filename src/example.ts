// Load environment variables from .env file
import "dotenv/config";

import { RetryService } from "./retry-service/Retry.service";
import { Logger } from "./logger-service/Logger.service";

// Create a logger using environment variables (from .env)
const logger = Logger.create({ level: process.env.LOG_LEVEL });
const retryService = new RetryService(logger);

/**
 * Pure function that simulates a flaky API call
 * It will fail for attempt counts less than 3 and succeed otherwise
 * @param attemptCount The current attempt count
 * @returns A promise that resolves to a success message or rejects with an error
 */
const simulateApiCall = async (attemptCount: number): Promise<string> => {
  if (attemptCount < 3) {
    throw new Error(`API call failed on attempt ${attemptCount}`);
  }
  return `API call succeeded on attempt ${attemptCount}`;
};

/**
 * Creates a function that tracks its own call count and calls the API simulation
 * This approach keeps the state encapsulated within the returned function's closure
 * @returns A function that can be called repeatedly to simulate API calls
 */
const createApiCallSimulator = (): (() => Promise<string>) => {
  // State is encapsulated in the closure, not exposed globally
  let attemptCount = 0;

  // Return a function that increments the counter and calls the pure API simulation
  return async () => {
    attemptCount += 1;
    return simulateApiCall(attemptCount);
  };
};

// Example 1: Basic retry with fixed delay
const basicRetryExample = async (): Promise<void> => {
  logger.info("EXAMPLE 1: Basic retry with fixed delay");
  try {
    // Create a fresh API simulator for this example
    const flakyApiCall = createApiCallSimulator();

    const result = await retryService.retry(flakyApiCall, {
      retries: 3,
      delay: 1000, // 1 second delay between retries
    });
    logger.info(`Success: ${result}`);
  } catch (error) {
    logger.error(`Failed: ${(error as Error).message}`);
  }
};

// Example 2: Retry with exponential backoff
const exponentialBackoffExample = async (): Promise<void> => {
  logger.info("\nEXAMPLE 2: Retry with exponential backoff");
  try {
    // Create a fresh API simulator for this example
    const flakyApiCall = createApiCallSimulator();

    const result = await retryService.retry(flakyApiCall, {
      retries: 3,
      delay: 500, // Start with 500ms delay
      exponentialBackoff: true, // Each retry will increase delay: 500ms, 1000ms, 1500ms
      onComplete: (report) => {
        logger.info(`Operation completed after ${report.attempts} attempts`);
        logger.info(`Total time elapsed: ${report.totalTime}ms`);
        logger.info(`Delays between attempts: ${report.delays.join(", ")}ms`);
      },
    });
    logger.info(`Success: ${result}`);
  } catch (error) {
    logger.error(`Failed: ${(error as Error).message}`);
  }
};

// Example 3: Retry with timeout
const timeoutExample = async (): Promise<void> => {
  logger.info("\nEXAMPLE 3: Retry with timeout");
  try {
    // Create a fresh API simulator for this example
    const flakyApiCall = createApiCallSimulator();

    const result = await retryService.retry(flakyApiCall, {
      retries: 5,
      delay: 1000,
      timeout: 2500, // Operation will timeout after 2.5 seconds
    });
    logger.info(`Success: ${result}`);
  } catch (error) {
    logger.error(`Failed: ${(error as Error).message}`);
  }
};

// Run all examples
const runAllExamples = async (): Promise<void> => {
  await basicRetryExample();
  // await exponentialBackoffExample();
  // await timeoutExample();
};

// Execute examples
runAllExamples().catch((error) => {
  logger.error("Error running examples:", error);
});
