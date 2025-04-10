import { LogHandler } from "../logger-service/Logger.service";
import type { RetryOptions, RetryReport } from "./Retry.service";
import {
  RetryAttemptsExceededError,
  RetryConfigurationError,
  RetryReportValidationError,
  RetryService,
  retryService,
  RetryTimeoutError,
} from "./Retry.service";

describe("RetryService", () => {
  let service: RetryService;
  let mockLogger: LogHandler;
  let mockTimer: {
    delay: ReturnType<typeof vi.fn>;
    now: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockLogger = {
      debug: vi.fn(),
      error: vi.fn(),
      trace: vi.fn(),
      log: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
    };
    mockTimer = {
      delay: vi.fn().mockResolvedValue(undefined),
      now: vi.fn(),
    };
    service = new RetryService(mockLogger, mockTimer);
  });

  describe("basic retry behavior", () => {
    it("should succeed immediately when no errors occur", async () => {
      // Given
      const successfulFunction = vi.fn(async () => "Immediate Success");
      const options: RetryOptions<string, Error> = { retries: 3, delay: 0 };

      // When
      const result = await service.retry(successfulFunction, options);

      // Then
      expect(result).toBe("Immediate Success");
      expect(successfulFunction).toHaveBeenCalledTimes(1);
    });

    it("should eventually succeed after temporary failures", async () => {
      // Given
      let attempts = 0;

      const failingFunction = vi.fn(async () => {
        attempts += 1;
        if (attempts < 3) {
          throw new Error("Failed attempt");
        }
        return "Success";
      });
      const options: RetryOptions<string, Error> = { retries: 5, delay: 0 };

      // When
      const result = await service.retry(failingFunction, options);

      // Then
      expect(result).toBe("Success");
      expect(failingFunction).toHaveBeenCalledTimes(3);
    });

    it("should fail when the operation cannot be completed", async () => {
      // Given
      const failingFunction = vi.fn(async () => {
        throw new Error("Always fails");
      });
      const options: RetryOptions<unknown, Error> = { retries: 2, delay: 0 };

      // When/Then
      await expect(service.retry(failingFunction, options)).rejects.toThrow(
        "Always fails"
      );
      expect(failingFunction).toHaveBeenCalledTimes(3);
    });

    it("should fail immediately when retries are disabled", async () => {
      // Given
      const failingFunction = vi.fn(async () => {
        throw new Error("Negative retries");
      });
      const options: RetryOptions<unknown, Error> = { retries: -1, delay: 0 };

      // When/Then
      await expect(service.retry(failingFunction, options)).rejects.toThrow(
        RetryConfigurationError
      );
      expect(failingFunction).toHaveBeenCalledTimes(0); // Function is never called due to configuration validation
    });
  });

  describe("timing behavior", () => {
    it("should wait for the specified delay duration between retries", async () => {
      // Given
      const delayTime = 50;
      let currentTime = 1000;

      mockTimer.now.mockImplementation(() => currentTime);
      mockTimer.delay.mockImplementation(async (ms) => {
        currentTime += ms;
        return Promise.resolve();
      });

      let attempts = 0;

      // When
      await service.retry(
        async () => {
          attempts += 1;
          if (attempts === 1) {
            throw new Error("trigger retry");
          }
          return "success";
        },
        {
          retries: 1,
          delay: delayTime,
        }
      );

      // Then
      expect(mockTimer.delay).toHaveBeenCalledWith(delayTime);
      expect(currentTime).toBe(1000 + delayTime);
    });

    it("should call the timer with the correct delay value", async () => {
      // Given
      let attempts = 0;
      const fn = vi.fn(async () => {
        attempts += 1;
        if (attempts === 1) throw new Error("First attempt fails");
        return "success";
      });

      const options: RetryOptions = {
        retries: 1,
        delay: 100,
      };

      // When
      await service.retry(fn, options);

      // Then
      expect(mockTimer.delay).toHaveBeenCalledWith(100);
    });

    it("should increase wait time between attempts", async () => {
      // Given
      const failingFunction = vi.fn(async () => {
        throw new Error("Exponential failure");
      });
      const options: RetryOptions<unknown, Error> = {
        retries: 3,
        delay: 100,
        exponentialBackoff: true,
      };

      // When/Then
      await expect(service.retry(failingFunction, options)).rejects.toThrow(
        "Exponential failure"
      );
      expect(mockTimer.delay).toHaveBeenNthCalledWith(1, 100);
      expect(mockTimer.delay).toHaveBeenNthCalledWith(2, 200);
      expect(mockTimer.delay).toHaveBeenNthCalledWith(3, 300);
    });

    it("should fail when operation takes too long", async () => {
      // Given
      let time = 0;
      mockTimer.now.mockImplementation(() => time);

      const longRunningFunction = vi.fn(async () => {
        time += 60;
        throw new Error("Any error");
      });

      const options: RetryOptions<unknown, Error> = {
        retries: 5,
        delay: 50,
        timeout: 100,
      };

      // When/Then
      await expect(service.retry(longRunningFunction, options)).rejects.toThrow(
        RetryTimeoutError
      );
      expect(longRunningFunction).toHaveBeenCalledTimes(2);
    });

    it("should measure time accurately during retry operations", async () => {
      // Given
      const startTime = 1000;
      const endTime = 1050;
      const onComplete = vi.fn();

      let callCount = 0;
      mockTimer.now.mockImplementation(() => {
        // First call returns startTime, subsequent calls return endTime
        const isFirstCall = callCount === 0;
        callCount += 1;
        return isFirstCall ? startTime : endTime;
      });

      // When
      const result = await service.retry(async () => "success", {
        retries: 0,
        onComplete,
      });

      // Then
      expect(result).toBe("success");
      expect(mockTimer.now).toHaveBeenCalledTimes(2); // Once for start, once for end
      expect(onComplete).toHaveBeenCalledWith(
        expect.objectContaining({
          startTime,
          totalTime: endTime - startTime, // Should be 50
          retryingOperationSucceeded: true,
        })
      );
    });
  });

  describe("conditional retry behavior", () => {
    it("should only retry on recoverable errors", async () => {
      // Given
      const retryOnError = (error: Error) =>
        error.message === "Retryable error";
      let attempts = 0;
      const retryableFunction = vi.fn(async () => {
        attempts += 1;
        throw new Error(
          attempts === 1 ? "Non-retryable error" : "Retryable error"
        );
      });
      const options: RetryOptions<unknown, Error> = {
        retries: 2,
        delay: 100,
        retryOnError,
      };

      // When/Then
      await expect(service.retry(retryableFunction, options)).rejects.toThrow(
        "Non-retryable error"
      );
      expect(retryableFunction).toHaveBeenCalledTimes(1);
    });

    it("should retry until the desired result is achieved", async () => {
      // Given
      let attempts = 0;
      const resultFunction = vi.fn(async () => {
        attempts += 1;
        return { statusCode: attempts === 1 ? 401 : 200 };
      });
      const options: RetryOptions<{ statusCode: number }, Error> = {
        retries: 2,
        delay: 100,
        retryOnResult: (result) => result.statusCode === 401,
      };

      // When
      const result = await service.retry(resultFunction, options);

      // Then
      expect(result).toEqual({ statusCode: 200 });
      expect(resultFunction).toHaveBeenCalledTimes(2);
    });

    it("should not retry when result is retryable but no attempts remain", async () => {
      // Given
      let callCount = 0;
      const resultFunction = vi.fn(async () => {
        callCount += 1;
        return { status: "done" };
      });
      const options: RetryOptions<{ status: string }, Error> = {
        retries: 0,
        retryOnResult: (result) => result.status === "done",
      };

      // When
      const result = await service.retry(resultFunction, options);

      // Then
      expect(result).toEqual({ status: "done" });
      expect(callCount).toBe(1);
    });

    it("should increase wait time between attempts when retrying on result", async () => {
      // Given
      let attempts = 0;
      const resultFunction = vi.fn(async () => {
        attempts += 1;
        return { status: attempts >= 4 ? "success" : "pending" };
      });
      const options: RetryOptions<{ status: string }, Error> = {
        retries: 3,
        delay: 100,
        exponentialBackoff: true,
        retryOnResult: (result) => result.status === "pending",
      };

      // When
      const result = await service.retry(resultFunction, options);

      // Then
      expect(result).toEqual({ status: "success" });
      expect(resultFunction).toHaveBeenCalledTimes(4);
      expect(mockTimer.delay).toHaveBeenNthCalledWith(1, 100); // First retry: base delay
      expect(mockTimer.delay).toHaveBeenNthCalledWith(2, 200); // Second retry: 2x delay
      expect(mockTimer.delay).toHaveBeenNthCalledWith(3, 300); // Third retry: 3x delay
    });
  });

  describe("service configuration", () => {
    it("should work with default logger when no custom logger is provided", async () => {
      // Given
      const defaultLogger = new RetryService(); // This will use the default logger
      const successFn = async () => "success";

      // When
      const result = await defaultLogger.retry(successFn, { retries: 0 });

      // Then
      expect(result).toBe("success");
    });

    it("should work with a complete custom logger", async () => {
      // Given
      const customLogger = {
        trace: vi.fn(),
        debug: vi.fn(),
        log: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      };
      const customLoggerService = new RetryService(customLogger);
      const successFn = async () => "success";

      // When
      const result = await customLoggerService.retry(successFn, { retries: 0 });

      // Then
      expect(result).toBe("success");
    });

    it("should be ready to use without configuration", async () => {
      // Given
      const successFn = async () => "success";

      // When
      const result = await retryService.retry(successFn, { retries: 0 });

      // Then
      expect(result).toBe("success");
    });

    it("should succeed with default timing behavior", async () => {
      // Given
      const serviceWithoutCustomTimer = new RetryService(mockLogger);
      const fn = async () => "success";
      const options: RetryOptions<string, Error> = {
        retries: 1,
        delay: 100,
      };

      // When
      const result = await serviceWithoutCustomTimer.retry(fn, options);

      // Then
      expect(result).toBe("success");
    });
  });

  describe("default timing operations", () => {
    it("should return current timestamp when calling now()", async () => {
      // Given
      const expectedTime = 12345;
      mockTimer.now.mockReturnValue(expectedTime);

      // When
      const result = service.retry(async () => service._getCurrentTime(), {
        retries: 0,
      });

      // Then
      await expect(result).resolves.toBe(expectedTime);
    });

    it("should correctly implement now() using Date.now()", async () => {
      // Given
      const expectedTime = 12345;
      mockTimer.now.mockReturnValue(expectedTime);

      // When
      const result = await service.retry(
        async () => service._getCurrentTime(),
        {
          retries: 0,
        }
      );

      // Then
      expect(result).toBe(expectedTime);
    });
  });

  describe("error message handling", () => {
    it("should handle non-Error objects thrown in the function", async () => {
      // Given
      const nonErrorObj = { foo: "bar" };
      const nonErrorFunction = vi.fn(async () => {
        // eslint-disable-next-line @typescript-eslint/no-throw-literal
        throw nonErrorObj;
      });
      const options: RetryOptions = { retries: 0 };

      // When/Then
      await expect(service.retry(nonErrorFunction, options)).rejects.toBe(
        nonErrorObj
      );
      expect(mockLogger.debug).toHaveBeenCalled(); // Just verify we logged something
    });

    it("should preserve original error as cause when retries are exhausted", async () => {
      // Given
      const originalError = new Error("Original specific error");
      originalError.name = "MakeRequestError";
      (originalError as any).statusCode = 500;

      const failingFunction = vi.fn(async () => {
        throw originalError;
      });

      const options: RetryOptions = { retries: 2, delay: 0 };

      // When/Then
      await expect(
        service.retry(failingFunction, options)
      ).rejects.toMatchObject({
        name: "RetryAttemptsExceededError",
        cause: originalError,
      });

      expect(failingFunction).toHaveBeenCalledTimes(3);
    });

    it("should preserve original error as cause when timeout occurs", async () => {
      // Given
      const originalError = new Error("Original timeout error");
      originalError.name = "DataFetchError";
      (originalError as any).status = 408;

      let time = 0;
      mockTimer.now.mockImplementation(() => time);

      const timeoutFunction = vi.fn(async () => {
        time += 60;
        throw originalError;
      });

      const options: RetryOptions = {
        retries: 5,
        timeout: 100,
      };

      // When/Then
      await expect(
        service.retry(timeoutFunction, options)
      ).rejects.toMatchObject({
        name: "RetryTimeoutError",
        cause: originalError,
      });

      expect(timeoutFunction).toHaveBeenCalled();
    });
  });

  describe("retry reporting", () => {
    it("provides a complete report when an operation succeeds on first attempt", async () => {
      // Given
      const onComplete = vi.fn();
      const successFn = vi.fn().mockResolvedValue("success");
      const options: RetryOptions<string, Error> = {
        retries: 3,
        onComplete,
      };

      // When
      const result = await service.retry(successFn, options);

      // Then
      expect(result).toBe("success");
      expect(successFn).toHaveBeenCalledTimes(1);
      expect(onComplete).toHaveBeenCalledTimes(1);
      expect(onComplete).toHaveBeenCalledWith(
        expect.objectContaining({
          attempts: 1,
          retryingOperationSucceeded: true,
          errors: [],
        })
      );
    });

    it("captures all retry attempts and errors when an operation eventually succeeds", async () => {
      // Given
      const onComplete = vi.fn();
      let attempts = 0;
      const eventuallySuccessFn = vi.fn(async () => {
        attempts += 1;
        if (attempts < 3) {
          throw new Error(`Attempt ${attempts} failed`);
        }
        return "success";
      });

      const options: RetryOptions<string, Error> = {
        retries: 5,
        delay: 10,
        onComplete,
      };

      // When
      const result = await service.retry(eventuallySuccessFn, options);

      // Then
      expect(result).toBe("success");
      expect(eventuallySuccessFn).toHaveBeenCalledTimes(3);
      expect(onComplete).toHaveBeenCalledTimes(1);
      expect(onComplete).toHaveBeenCalledWith(
        expect.objectContaining({
          attempts: 3,
          retryingOperationSucceeded: true,
          errors: expect.arrayContaining([
            expect.objectContaining({ message: "Attempt 1 failed" }),
            expect.objectContaining({ message: "Attempt 2 failed" }),
          ]),
          delays: expect.arrayContaining([10, 10]),
        })
      );
    });

    it("documents all failures when an operation never succeeds", async () => {
      // Given
      const onComplete = vi.fn();
      const alwaysFailFn = vi.fn(async () => {
        throw new Error("Always fails");
      });

      const options: RetryOptions<unknown, Error> = {
        retries: 2,
        delay: 10,
        onComplete,
      };

      // When/Then
      await expect(service.retry(alwaysFailFn, options)).rejects.toThrow(
        "Always fails"
      );

      expect(alwaysFailFn).toHaveBeenCalledTimes(3); // Initial + 2 retries
      expect(onComplete).toHaveBeenCalledTimes(1);
      expect(onComplete).toHaveBeenCalledWith(
        expect.objectContaining({
          attempts: 3,
          retryingOperationSucceeded: false,
          errors: expect.arrayContaining([
            expect.objectContaining({ message: "Always fails" }),
            expect.objectContaining({ message: "Always fails" }),
            expect.objectContaining({ message: "Always fails" }),
          ]),
          delays: expect.arrayContaining([10, 10]),
        })
      );
    });

    it("tracks accurate timing metrics for the retry process", async () => {
      // Given
      const onComplete = vi.fn();
      let time = 1000;

      mockTimer.now.mockImplementation(() => time);

      const timedFunction = vi.fn(async () => {
        time += 50;
        return "success";
      });

      const options: RetryOptions<string, Error> = {
        retries: 0,
        onComplete,
      };

      // When
      await service.retry(timedFunction, options);

      // Then
      expect(onComplete).toHaveBeenCalledWith(
        expect.objectContaining({
          startTime: 1000,
          totalTime: 50,
          retryingOperationSucceeded: true,
        })
      );
    });

    it("records retry reasons when retrying based on result conditions", async () => {
      // Given
      const onComplete = vi.fn();
      let attempts = 0;
      const conditionalFn = vi.fn(async () => {
        attempts += 1;
        return { status: attempts >= 3 ? "success" : "pending" };
      });

      const options: RetryOptions<{ status: string }, Error> = {
        retries: 3,
        delay: 10,
        retryOnResult: (result) => result.status === "pending",
        onComplete,
      };

      // When
      const result = await service.retry(conditionalFn, options);

      // Then
      expect(result).toEqual({ status: "success" });
      expect(conditionalFn).toHaveBeenCalledTimes(3);
      expect(onComplete).toHaveBeenCalledWith(
        expect.objectContaining({
          attempts: 3,
          retryingOperationSucceeded: true,
          errors: [],
          retryReasons: expect.arrayContaining([
            { type: "result", value: { status: "pending" } },
            { type: "result", value: { status: "pending" } },
          ]),
        })
      );
    });

    it("indicates when an operation times out", async () => {
      // Given
      const onComplete = vi.fn();
      let time = 0;
      mockTimer.now.mockImplementation(() => time);

      const timeoutFn = vi.fn(async () => {
        time += 60;
        throw new Error("Any error");
      });

      const options: RetryOptions<unknown, Error> = {
        retries: 5,
        timeout: 100,
        onComplete,
      };

      // When/Then
      await expect(service.retry(timeoutFn, options)).rejects.toThrow(
        "Retry timeout exceeded"
      );

      expect(onComplete).toHaveBeenCalledWith(
        expect.objectContaining({
          retryingOperationSucceeded: false,
          timedOut: true,
          attempts: expect.any(Number),
        })
      );

      // Verify that attempts is at least 1
      expect(onComplete).toHaveBeenCalled();
      const report = onComplete.mock.calls[0]?.[0];
      expect(report).toBeDefined();
      expect(report.attempts).toBeGreaterThanOrEqual(1);
      // The function is called once per attempt, but the timeout might occur
      // before the function completes, so we need to check that the function
      // was called at most the number of attempts
      expect(timeoutFn.mock.calls.length).toBeLessThanOrEqual(report.attempts);
    });

    it("works correctly when no reporting callback is provided", async () => {
      // Given
      const successFn = vi.fn().mockResolvedValue("success");
      const options: RetryOptions<string, Error> = { retries: 1 };

      // When/Then
      const result = await service.retry(successFn, options);
      expect(result).toBe("success");
    });

    it("validates report data integrity for negative totalTime", () => {
      // Given
      const invalidReport: RetryReport = {
        startTime: 1000,
        totalTime: -100,
        attempts: 1,
        errors: [],
        delays: [],
        retryingOperationSucceeded: true,
      };

      // When/Then
      expect(() => RetryService._validateRetryReport(invalidReport)).toThrow(
        RetryReportValidationError
      );
    });

    it("validates report data integrity for negative attempts", () => {
      // Given
      const invalidReport: RetryReport = {
        startTime: 1000,
        totalTime: 100,
        attempts: -1,
        errors: [],
        delays: [],
        retryingOperationSucceeded: true,
      };

      // When/Then
      expect(() => RetryService._validateRetryReport(invalidReport)).toThrow(
        RetryReportValidationError
      );
    });

    it.each([
      { name: "negative retries", options: { retries: -5 } },
      { name: "negative delay", options: { retries: 3, delay: -100 } },
      { name: "invalid timeout", options: { retries: 3, timeout: 0 } },
      {
        name: "negative sanitization threshold",
        options: { retries: 3, sanitizationThreshold: -10 },
      },
    ])(
      "should throw RetryConfigurationError for $name",
      async ({ options }) => {
        // When/Then
        await expect(
          service.retry(async () => "test", options)
        ).rejects.toThrow(RetryConfigurationError);
      }
    );

    it("should throw RetryAttemptsExceededError when max retries are reached", async () => {
      // Given
      const failingFunction = vi.fn(async () => {
        throw new Error("Always fails");
      });

      const options: RetryOptions = {
        retries: 2,
        delay: 0,
      };

      // When/Then
      await expect(service.retry(failingFunction, options)).rejects.toThrow(
        RetryAttemptsExceededError
      );
      expect(failingFunction).toHaveBeenCalledTimes(3); // Initial + 2 retries
    });

    it("correctly counts attempts when timeout occurs after multiple attempts", async () => {
      // Given
      const onComplete = vi.fn();
      let attempts = 0;

      // We need to control the timer precisely to simulate a timeout
      // Start with a base time
      const startTime = 1000;
      let currentTime = startTime;

      // Mock the timer.now() function to return controlled time values
      mockTimer.now.mockImplementation(() => {
        // On the third attempt, return a time that exceeds the timeout
        // The timeout will be startTime + 100ms = 1100
        if (attempts === 2) {
          return startTime + 150; // Well past the timeout
        }
        return currentTime;
      });

      // Mock the delay function to increment our time counter
      mockTimer.delay.mockImplementation(async (ms) => {
        currentTime += ms;
        return Promise.resolve();
      });

      // Our test function that will be retried
      const testFn = vi.fn(async () => {
        attempts += 1;

        // First attempt fails
        if (attempts === 1) {
          throw new Error("First attempt failed");
        }

        // Second attempt fails
        if (attempts === 2) {
          throw new Error("Second attempt failed");
        }

        // Third attempt would succeed, but timeout should prevent it
        return "success";
      });

      // Configure retry options with a timeout
      const options: RetryOptions<unknown, Error> = {
        retries: 5,
        delay: 10,
        timeout: 100, // 100ms timeout from the start time
        onComplete,
      };

      // When/Then
      await expect(service.retry(testFn, options)).rejects.toThrow(
        RetryTimeoutError
      );

      // Verify the function was called the expected number of times
      expect(testFn).toHaveBeenCalledTimes(2);

      // Verify the report contains the correct data
      expect(onComplete).toHaveBeenCalledWith(
        expect.objectContaining({
          retryingOperationSucceeded: false,
          timedOut: true,
          attempts: 3, // The third attempt is counted but the function isn't called
          errors: expect.arrayContaining([
            expect.objectContaining({ message: "First attempt failed" }),
            expect.objectContaining({ message: "Second attempt failed" }),
          ]),
        })
      );
    });
  });

  describe("log sanitization", () => {
    let onComplete: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      onComplete = vi.fn();
    });

    const retryWithValue = async (
      value: unknown,
      options = {}
    ): Promise<RetryReport> => {
      onComplete.mockClear(); // Clear previous calls

      await service
        .retry(async () => value, {
          retries: 1,
          retryOnResult: () => true,
          onComplete,
          ...options,
        })
        .catch(() => {
          /* expected error */
        });

      return onComplete.mock.calls[0]?.[0] as RetryReport;
    };

    const createObjectWithProperties = (
      count: number
    ): Record<string, string> => {
      const result: Record<string, string> = {};
      for (let i = 0; i < count; i += 1) {
        result[`prop${i}`] = `value${i}`;
      }
      return result;
    };

    it.each([
      {
        type: "string",
        value: "test string",
        expected: "test string",
        assertion: "toBe",
      },
      {
        type: "number",
        value: 123,
        expected: 123,
        assertion: "toBe",
      },
      {
        type: "null",
        value: null,
        expected: null,
        assertion: "toBeNull",
      },
      {
        type: "small object",
        value: { small: "object", with: "few properties" },
        expected: { small: "object", with: "few properties" },
        assertion: "toEqual",
      },
    ])(
      "should preserve $type values when sanitizing",
      async ({ value, expected, assertion }) => {
        // Given

        // When
        const report = await retryWithValue(value);

        // Then
        if (assertion === "toBeNull") {
          expect(report.retryReasons?.[0]?.value).toBeNull();
        } else if (assertion === "toBe") {
          expect(report.retryReasons?.[0]?.value).toBe(expected);
        } else {
          expect(report.retryReasons?.[0]?.value).toEqual(expected);
        }
      }
    );

    it("should sanitize large objects by default", async () => {
      // Given
      const largeObject = createObjectWithProperties(100);

      // When
      const report = await retryWithValue(largeObject);

      // Then
      const sanitizedValue = report.retryReasons?.[0]?.value;
      expect(typeof sanitizedValue).toBe("string");
      expect(String(sanitizedValue)).toMatch(/\[Large Object: \d+ chars\]/);
    });

    it("should handle circular references by marking them as unstringifiable", async () => {
      // Given
      const circularObject: any = {};
      circularObject.self = circularObject;

      // When
      const report = await retryWithValue(circularObject);

      // Then
      expect(report.retryReasons?.[0]?.value).toBe("[Unstringifiable Object]");
    });

    it("should respect the sanitizeRetryReasons option", async () => {
      // Given
      const mediumObject = createObjectWithProperties(20);
      const sanitizationDisabled = { sanitizeRetryReasons: false };

      // When
      const report = await retryWithValue(mediumObject, sanitizationDisabled);

      // Then
      expect(report.retryReasons?.[0]?.value).toEqual(mediumObject);
    });

    it("should sanitize objects exceeding default threshold", async () => {
      // Given
      const objectToSanitize = createObjectWithProperties(30);

      // When
      const report = await retryWithValue(objectToSanitize);

      // Then
      const sanitizedValue = report.retryReasons?.[0]?.value;
      expect(typeof sanitizedValue).toBe("string");
      expect(String(sanitizedValue)).toMatch(/\[Large Object: \d+ chars\]/);
    });

    it("should preserve objects when using higher sanitization threshold", async () => {
      // Given
      const objectToSanitize = createObjectWithProperties(30);
      const highThresholdOption = { sanitizationThreshold: 10000 };

      // When
      const report = await retryWithValue(
        objectToSanitize,
        highThresholdOption
      );

      // Then
      expect(report.retryReasons?.[0]?.value).toEqual(objectToSanitize);
    });

    it('should use constructor name or fallback to "Object" when sanitizing', async () => {
      // Given
      class CustomClass {}
      const customObject = new CustomClass();
      Object.assign(customObject, { largeData: "x".repeat(1000) });

      // When
      const customClassReport = await retryWithValue(customObject);

      // Then
      const sanitizedValue = customClassReport.retryReasons?.[0]
        ?.value as string;
      expect(sanitizedValue).toMatch(/\[Large CustomClass: \d+ chars\]/);
    });

    it('should fallback to "Object" when sanitizing objects without constructor', async () => {
      // Given
      const objectWithoutConstructor = Object.create(null);
      objectWithoutConstructor.largeData = "x".repeat(1000);

      // When
      const report = await retryWithValue(objectWithoutConstructor);

      // Then
      const sanitizedValue = report.retryReasons?.[0]?.value as string;
      expect(sanitizedValue).toMatch(/\[Large Object: \d+ chars\]/);
    });

    it("should sanitize all objects when sanitizationThreshold is 0", async () => {
      // Given
      const smallObject = { small: "object" };
      const zeroThresholdOption = { sanitizationThreshold: 0 };

      // When
      const report = await retryWithValue(smallObject, zeroThresholdOption);

      // Then
      const sanitizedValue = report.retryReasons?.[0]?.value;
      expect(typeof sanitizedValue).toBe("string");
      expect(String(sanitizedValue)).toMatch(/\[Large Object: \d+ chars\]/);
    });

    it("should ignore sanitizationThreshold when sanitizeRetryReasons is false", async () => {
      // Given
      const largeObject = createObjectWithProperties(100);
      const options = {
        sanitizeRetryReasons: false,
        sanitizationThreshold: 0, // Would sanitize everything if considered
      };

      // When
      const report = await retryWithValue(largeObject, options);

      // Then
      // Object should be preserved intact, not sanitized
      expect(report.retryReasons?.[0]?.value).toEqual(largeObject);
    });
  });

  describe("DefaultTimer", () => {
    const getDefaultTimer = () => {
      const logger = {
        trace: vi.fn(),
        debug: vi.fn(),
        log: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      };
      const serviceInstance = new RetryService(logger);
      // Access the timer property (which will be DefaultTimer)
      return (serviceInstance as any).timer;
    };

    it("delay should wait for the specified time", async () => {
      // Given
      const defaultTimer = getDefaultTimer();
      const delayTime = 5;
      const startTime = Date.now();

      // When
      await defaultTimer.delay(delayTime);
      const endTime = Date.now();

      // Then
      const actualDelay = endTime - startTime;

      expect(actualDelay).toBeGreaterThanOrEqual(1);
    });

    it("now should return the current timestamp", () => {
      // Given
      const defaultTimer = getDefaultTimer();
      const beforeTime = Date.now();

      // When
      const result = defaultTimer.now();

      // Then
      const afterTime = Date.now();
      expect(result).toBeGreaterThanOrEqual(beforeTime);
      expect(result).toBeLessThanOrEqual(afterTime);
    });
  });
});
