import { logger } from "../logger-service/Logger.service";
import type { LogHandler } from "../logger-service/Logger.service";

/**
 * Base error class for all retry-related errors
 */
export class RetryError extends Error {
  cause?: Error;

  constructor(message: string, cause?: Error) {
    super(message);
    this.name = "RetryError";
    this.cause = cause;
  }
}

/**
 * Error thrown when a retry operation times out
 */
export class RetryTimeoutError extends RetryError {
  constructor(message = "Retry timeout exceeded", cause?: Error) {
    super(message, cause);
    this.name = "RetryTimeoutError";
  }
}

/**
 * Error thrown when a retry operation exceeds the maximum number of attempts
 */
export class RetryAttemptsExceededError extends RetryError {
  constructor(message = "Maximum retry attempts exceeded", cause?: Error) {
    super(message, cause);
    this.name = "RetryAttemptsExceededError";
  }
}

/**
 * Error thrown when a retry operation fails due to an invalid configuration
 */
export class RetryConfigurationError extends RetryError {
  constructor(message: string, cause?: Error) {
    super(message, cause);
    this.name = "RetryConfigurationError";
  }
}

/**
 * Error thrown when a retry operation fails due to a validation error in the retry report
 */
export class RetryReportValidationError extends RetryError {
  constructor(message: string, cause?: Error) {
    super(message, cause);
    this.name = "RetryReportValidationError";
  }
}

interface Timer {
  delay(ms: number): Promise<void>;
  now(): number;
}

const DefaultTimer: Timer = {
  delay(ms: number): Promise<void> {
    return new Promise<void>((resolve) => {
      setTimeout(resolve, ms);
    });
  },

  now(): number {
    return Date.now();
  },
};

export interface RetryOptions<T = unknown, E extends Error = Error> {
  retries: number;
  /**
   * Delay between retry attempts in milliseconds.
   * @default 0
   */
  delay?: number;
  /**
   * Whether to use exponential backoff for delays.
   * @default false
   */
  exponentialBackoff?: boolean;
  /**
   * Function to determine if retry should occur based on error.
   * When undefined, retries on all errors.
   */
  retryOnError?: (error: E) => boolean;
  /**
   * Function to determine if retry should occur based on result.
   * When undefined, doesn't retry based on result.
   */
  retryOnResult?: (result: T) => boolean;
  /**
   * Maximum time in milliseconds for all retry attempts.
   * When undefined, no timeout is applied.
   */
  timeout?: number;
  /**
   * Callback function executed when retry process completes.
   */
  onComplete?: (report: RetryReport) => void;
  /**
   * Controls object sanitization in retry reports.
   * When true, objects larger than threshold are replaced with placeholders.
   * When false, all objects are preserved intact.
   * @default true
   */
  sanitizeRetryReasons?: boolean;
  /**
   * Size threshold in characters for sanitization.
   * Only used when sanitizeRetryReasons is true.
   * @default 500
   */
  sanitizationThreshold?: number;
}

export interface RetryReport {
  startTime: number;
  totalTime: number;
  attempts: number;
  errors: Error[];
  delays: number[];
  retryingOperationSucceeded: boolean;
  timedOut?: boolean;
  retryReasons?: Array<{ type: "error" | "result"; value: unknown }>;
}

/**
 * Immutable builder for retry reports.
 * This class is an implementation detail and not part of the public API.
 *
 * Each modification method returns a new builder instance.
 * Create new reports with: new RetryReportBuilder(startTime)
 */
class RetryReportBuilder {
  private report: RetryReport;

  constructor(startTime: number) {
    this.report = {
      startTime,
      totalTime: 0,
      attempts: 0,
      errors: [],
      delays: [],
      retryingOperationSucceeded: false,
    };
  }

  /**
   * Creates a copy of the builder with the given updates applied
   * @private
   */
  private copyWithUpdates(updates: Partial<RetryReport>): RetryReportBuilder {
    const builder = new RetryReportBuilder(this.report.startTime);

    builder.report = {
      ...this.report,
      ...updates,
    };

    return builder;
  }

  /**
   * Creates a new report with the attempt counter incremented
   */
  public withAttempt(): RetryReportBuilder {
    return this.copyWithUpdates({
      attempts: this.report.attempts + 1,
    });
  }

  /**
   * Creates a new report with the given error added
   */
  public withError(error: unknown): RetryReportBuilder {
    const errorObj = error instanceof Error ? error : new Error(String(error));

    return this.copyWithUpdates({
      errors: [...this.report.errors, errorObj],
    });
  }

  /**
   * Creates a new report with the given delay added
   */
  public withDelay(delay: number): RetryReportBuilder {
    return this.copyWithUpdates({
      delays: [...this.report.delays, delay],
    });
  }

  /**
   * Creates a new report with the given retry reason added
   * @param type The type of retry reason
   * @param value The value that caused the retry
   * @param sanitize Whether to sanitize large objects (defaults to true)
   * @param threshold Character threshold for sanitization (defaults to 500)
   */
  public withRetryReason(
    type: "error" | "result",
    value: unknown,
    sanitize = true,
    threshold = 500
  ): RetryReportBuilder {
    const reasons = this.report.retryReasons || [];
    const sanitizedValue = RetryReportBuilder.sanitizeForLogging(
      value,
      sanitize,
      threshold
    );

    return this.copyWithUpdates({
      retryReasons: [...reasons, { type, value: sanitizedValue }],
    });
  }

  /**
   * Sanitizes a value for logging by replacing large objects with placeholders
   * @private
   * @param value The value to sanitize
   * @param shouldSanitize Whether to apply sanitization (defaults to true)
   * @param threshold Character threshold for sanitization (defaults to 500)
   * @returns The sanitized value, or the original value if sanitization is disabled
   */
  private static sanitizeForLogging(
    value: unknown,
    shouldSanitize = true,
    threshold = 500
  ): unknown {
    if (!shouldSanitize || value == null || typeof value !== "object") {
      return value;
    }

    try {
      const json = JSON.stringify(value);

      if (json.length <= threshold) {
        return value;
      }

      const objType = value.constructor?.name || "Object";

      return `[Large ${objType}: ${json.length} chars]`;
    } catch {
      return "[Unstringifiable Object]";
    }
  }

  /**
   * Creates a new report marked as successful
   */
  public withSuccess(currentTime: number): RetryReportBuilder {
    return this.copyWithUpdates({
      retryingOperationSucceeded: true,
      totalTime: currentTime - this.report.startTime,
    });
  }

  /**
   * Creates a new report marked as timed out
   */
  public withTimeout(currentTime: number): RetryReportBuilder {
    return this.copyWithUpdates({
      timedOut: true,
      totalTime: currentTime - this.report.startTime,
    });
  }

  /**
   * Creates a new report marked as failed
   */
  public withFailure(currentTime: number): RetryReportBuilder {
    return this.copyWithUpdates({
      retryingOperationSucceeded: false,
      totalTime: currentTime - this.report.startTime,
    });
  }

  /**
   * Returns the built report
   * @throws Error if the report is in an invalid state
   */
  public build(): RetryReport {
    if (this.report.totalTime < 0) {
      throw new RetryReportValidationError(
        "Invalid report: totalTime cannot be negative"
      );
    }

    if (this.report.attempts < 0) {
      throw new RetryReportValidationError(
        "Invalid report: attempts cannot be negative"
      );
    }

    return { ...this.report };
  }
}

export interface IRetry {
  retry<T = unknown, E extends Error = Error>(
    fn: () => Promise<T>,
    options: RetryOptions<T, E>
  ): Promise<T>;
}

export class RetryService implements IRetry {
  private readonly logger: LogHandler;
  private readonly timer: Timer;

  constructor(loggerInstance?: LogHandler, timer: Timer = DefaultTimer) {
    this.logger = loggerInstance ?? logger;
    this.timer = timer;
  }

  public async retry<T = unknown, E extends Error = Error>(
    fn: () => Promise<T>,
    options: RetryOptions<T, E>
  ): Promise<T> {
    RetryService.validateOptions(options);

    const retries = Math.max(0, options.retries);
    const delay = Math.max(0, options.delay || 0);
    const timeout = options.timeout ? this.timer.now() + options.timeout : null;
    const sanitizationThreshold = options.sanitizationThreshold ?? 500;

    const reportBuilder = new RetryReportBuilder(this.timer.now());

    return this.attempt(
      fn,
      options,
      retries,
      delay,
      timeout,
      sanitizationThreshold,
      reportBuilder
    );
  }

  private static validateOptions<T, E extends Error>(
    options: RetryOptions<T, E>
  ): void {
    if (options.retries < 0) {
      throw new RetryConfigurationError("Negative retries");
    }

    if (options.delay !== undefined && options.delay < 0) {
      throw new RetryConfigurationError("Delay cannot be negative");
    }

    if (options.timeout !== undefined && options.timeout <= 0) {
      throw new RetryConfigurationError("Timeout must be greater than zero");
    }

    if (
      options.sanitizationThreshold !== undefined &&
      options.sanitizationThreshold < 0
    ) {
      throw new RetryConfigurationError(
        "Sanitization threshold cannot be negative"
      );
    }
  }

  private async attempt<T, E extends Error>(
    fn: () => Promise<T>,
    options: RetryOptions<T, E>,
    retriesLeft: number,
    delay: number,
    timeout: number | null,
    sanitizationThreshold: number,
    currentReportBuilder: RetryReportBuilder
  ): Promise<T> {
    const updatedReportBuilder = currentReportBuilder.withAttempt();

    if (this.isTimedOut(timeout)) {
      return this.handleTimeout(updatedReportBuilder, options);
    }

    try {
      this.logger.debug(`Attempting function, retries left: ${retriesLeft}`);

      const result = await fn();

      if (options.retryOnResult && options.retryOnResult(result)) {
        if (retriesLeft > 0) {
          return await this.handleRetryableResult(
            fn,
            result,
            options,
            retriesLeft,
            delay,
            timeout,
            sanitizationThreshold,
            updatedReportBuilder
          );
        }

        this.logger.debug(
          `No retries left for retryable result. Returning result: ${JSON.stringify(
            result
          )}`
        );
      }

      return this.handleSuccess(result, updatedReportBuilder, options);
    } catch (error) {
      return this.handleError(
        error as E,
        fn,
        options,
        retriesLeft,
        delay,
        timeout,
        sanitizationThreshold,
        updatedReportBuilder
      );
    }
  }

  private isTimedOut(timeout: number | null): boolean {
    return Boolean(timeout && this.timer.now() > timeout);
  }

  private handleTimeout<T>(
    reportBuilder: RetryReportBuilder,
    options: RetryOptions<T, any>
  ): never {
    this.logger.debug(`Retry timeout exceeded`);

    const finalReport = reportBuilder.withTimeout(this.timer.now()).build();

    const maybeLastError =
      finalReport.errors.length > 0
        ? finalReport.errors[finalReport.errors.length - 1]
        : undefined;

    if (options.onComplete) {
      options.onComplete(finalReport);
    }

    throw new RetryTimeoutError("Retry timeout exceeded", maybeLastError);
  }

  private async handleRetryableResult<T, E extends Error>(
    fn: () => Promise<T>,
    result: T,
    options: RetryOptions<T, E>,
    retriesLeft: number,
    delay: number,
    timeout: number | null,
    sanitizationThreshold: number,
    reportBuilder: RetryReportBuilder
  ): Promise<T> {
    const currentDelay = RetryService.calculateDelay(
      options,
      retriesLeft,
      delay
    );

    this.logger.debug(
      `Retrying in ${currentDelay}ms... Retries left: ${retriesLeft - 1}`
    );

    const retryReportBuilder = reportBuilder
      .withRetryReason(
        "result",
        result,
        options.sanitizeRetryReasons !== false,
        sanitizationThreshold
      )
      .withDelay(currentDelay);

    if (currentDelay) {
      await this.timer.delay(currentDelay);
    }

    return this.attempt(
      fn,
      options,
      retriesLeft - 1,
      delay,
      timeout,
      sanitizationThreshold,
      retryReportBuilder
    );
  }

  private handleSuccess<T>(
    result: T,
    reportBuilder: RetryReportBuilder,
    options: RetryOptions<T, any>
  ): T {
    const finalReport = reportBuilder.withSuccess(this.timer.now()).build();

    if (options.onComplete) {
      options.onComplete(finalReport);
    }

    return result;
  }

  private async handleError<T, E extends Error>(
    error: E,
    fn: () => Promise<T>,
    options: RetryOptions<T, E>,
    retriesLeft: number,
    delay: number,
    timeout: number | null,
    sanitizationThreshold: number,
    reportBuilder: RetryReportBuilder
  ): Promise<T> {
    this.logger.debug(
      `Error encountered: ${
        error instanceof Error ? error.message : "Unknown error"
      }. Retries left: ${retriesLeft}`
    );

    const errorReportBuilder = reportBuilder.withError(error);
    const shouldRetry = !options.retryOnError || options.retryOnError(error);

    if (!shouldRetry || retriesLeft <= 0) {
      return this.handleNonRetryableError(
        error,
        errorReportBuilder,
        options,
        retriesLeft,
        shouldRetry
      );
    }

    return this.retryAfterError(
      fn,
      error,
      options,
      retriesLeft,
      delay,
      timeout,
      sanitizationThreshold,
      errorReportBuilder
    );
  }

  private handleNonRetryableError<T, E extends Error>(
    error: E,
    reportBuilder: RetryReportBuilder,
    options: RetryOptions<T, E>,
    retriesLeft: number,
    shouldRetry: boolean
  ): never {
    this.logger.debug(
      `No retries left or error is not retryable. Throwing error`
    );

    const finalReport = reportBuilder.withFailure(this.timer.now()).build();

    if (options.onComplete) {
      options.onComplete(finalReport);
    }

    if (retriesLeft <= 0 && shouldRetry && error instanceof Error) {
      throw new RetryAttemptsExceededError(
        `Maximum retry attempts (${options.retries}) exceeded: ${error.message}`,
        error
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-throw-literal
    throw error;
  }

  private async retryAfterError<T, E extends Error>(
    fn: () => Promise<T>,
    error: E,
    options: RetryOptions<T, E>,
    retriesLeft: number,
    delay: number,
    timeout: number | null,
    sanitizationThreshold: number,
    reportBuilder: RetryReportBuilder
  ): Promise<T> {
    const currentDelay = RetryService.calculateDelay(
      options,
      retriesLeft,
      delay
    );

    this.logger.debug(
      `Retrying in ${currentDelay}ms... Retries left: ${retriesLeft - 1}`
    );

    const retryReportBuilder = reportBuilder
      .withRetryReason(
        "error",
        error,
        options.sanitizeRetryReasons !== false,
        sanitizationThreshold
      )
      .withDelay(currentDelay);

    if (currentDelay) {
      await this.timer.delay(currentDelay);
    }

    return this.attempt(
      fn,
      options,
      retriesLeft - 1,
      delay,
      timeout,
      sanitizationThreshold,
      retryReportBuilder
    );
  }

  private static calculateDelay(
    options: RetryOptions<any, any>,
    retriesLeft: number,
    baseDelay: number
  ): number {
    return options.exponentialBackoff
      ? baseDelay * (options.retries - retriesLeft + 1)
      : baseDelay;
  }

  /**
   * This method is ONLY for testing purposes to validate RetryReport objects.
   * It exposes RetryReportBuilder validation logic to tests without exposing
   * the entire builder implementation.
   *
   * @param report The report to validate
   * @returns The validated report
   * @throws Error if the report is invalid
   * @internal
   */
  public static _validateRetryReport(report: RetryReport): RetryReport {
    // Create a minimal builder just for validation
    const builder = {
      report,
      build: RetryReportBuilder.prototype.build,
    };

    // Call the build method to trigger validation
    return builder.build();
  }

  /**
   * This method is ONLY for testing purposes to access the current timestamp.
   * It exposes the timer's now() method to tests without exposing
   * the entire timer implementation.
   *
   * @returns The current timestamp from the timer
   * @internal
   */
  public _getCurrentTime(): number {
    return this.timer.now();
  }
}

export const retryService = new RetryService(logger);
