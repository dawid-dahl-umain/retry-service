import type { Mock } from "vitest";
import { Logger } from "./Logger.service";

describe("Logger", () => {
  const mockConsole = {
    trace: vi.fn() as Mock & Console["trace"],
    debug: vi.fn() as Mock & Console["debug"],
    log: vi.fn() as Mock & Console["log"],
    info: vi.fn() as Mock & Console["info"],
    warn: vi.fn() as Mock & Console["warn"],
    error: vi.fn() as Mock & Console["error"],
  } as unknown as Console;
  const realConsole = global.console;
  const originalLogLevel = process.env.LOG_LEVEL;

  beforeAll(() => {
    global.console = mockConsole as unknown as typeof global.console;
  });

  beforeEach(() => {
    Object.values(mockConsole).forEach((mockFn) => mockFn.mockReset());
    process.env.LOG_LEVEL = originalLogLevel;
  });

  afterAll(() => {
    global.console = realConsole;
    process.env.LOG_LEVEL = originalLogLevel;
  });

  describe("when logging is set to detailed level", () => {
    it("should display messages of all severity levels", () => {
      // Given
      const logger = Logger.create({ level: "trace", handler: mockConsole });

      // When
      logger.trace("trace msg");
      logger.debug("debug msg");
      logger.log("log msg");
      logger.info("info msg");
      logger.warn("warn msg");
      logger.error("error msg");

      // Then
      expect(mockConsole.trace).toHaveBeenCalledWith("trace msg");
      expect(mockConsole.debug).toHaveBeenCalledWith("debug msg");
      expect(mockConsole.log).toHaveBeenCalledWith("log msg");
      expect(mockConsole.info).toHaveBeenCalledWith("info msg");
      expect(mockConsole.warn).toHaveBeenCalledWith("warn msg");
      expect(mockConsole.error).toHaveBeenCalledWith("error msg");
    });
  });

  describe("when logging is set to standard level", () => {
    it("should display regular, warning and error messages only", () => {
      // Given
      const logger = Logger.create({ level: "info", handler: mockConsole });

      // When
      logger.trace("trace msg");
      logger.debug("debug msg");
      logger.log("log msg");
      logger.info("info msg");
      logger.warn("warn msg");
      logger.error("error msg");

      // Then
      expect(mockConsole.trace).not.toHaveBeenCalled();
      expect(mockConsole.debug).not.toHaveBeenCalled();
      expect(mockConsole.log).toHaveBeenCalledWith("log msg");
      expect(mockConsole.info).toHaveBeenCalledWith("info msg");
      expect(mockConsole.warn).toHaveBeenCalledWith("warn msg");
      expect(mockConsole.error).toHaveBeenCalledWith("error msg");
    });
  });

  describe("when logging is set to errors only", () => {
    it("should display only error messages", () => {
      // Given
      const logger = Logger.create({ level: "error", handler: mockConsole });

      // When
      logger.trace("trace msg");
      logger.debug("debug msg");
      logger.log("log msg");
      logger.info("info msg");
      logger.warn("warn msg");
      logger.error("error msg");

      // Then
      expect(mockConsole.trace).not.toHaveBeenCalled();
      expect(mockConsole.debug).not.toHaveBeenCalled();
      expect(mockConsole.log).not.toHaveBeenCalled();
      expect(mockConsole.info).not.toHaveBeenCalled();
      expect(mockConsole.warn).not.toHaveBeenCalled();
      expect(mockConsole.error).toHaveBeenCalledWith("error msg");
    });
  });

  describe("when initialized with invalid settings", () => {
    it("should warn about invalid configuration", () => {
      // Given
      const warnSpy = vi.spyOn(global.console, "warn");

      // When
      const logger = Logger.create({ level: "invalid", handler: mockConsole });
      logger.info("test");

      // Then
      expect(warnSpy).toHaveBeenCalledWith(
        'Invalid log level "invalid", defaulting to "info".'
      );
      warnSpy.mockRestore();
    });

    it("should fall back to standard logging behavior", () => {
      // Given
      const logger = Logger.create({ level: "invalid", handler: mockConsole });

      // When
      logger.trace("trace msg");
      logger.debug("debug msg");
      logger.log("log msg");
      logger.info("info msg");

      // Then
      expect(mockConsole.trace).not.toHaveBeenCalled();
      expect(mockConsole.debug).not.toHaveBeenCalled();
      expect(mockConsole.log).toHaveBeenCalledWith("log msg");
      expect(mockConsole.info).toHaveBeenCalledWith("info msg");
    });
  });

  describe("when log level is set via environment", () => {
    let envLogLevel: string | undefined;

    beforeEach(() => {
      envLogLevel = process.env.LOG_LEVEL;
    });

    afterEach(() => {
      process.env.LOG_LEVEL = envLogLevel;
    });

    it("should use the configured environment level", () => {
      // Given
      process.env.LOG_LEVEL = "debug";
      const logger = Logger.create({
        level: process.env.LOG_LEVEL,
        handler: mockConsole,
      });

      // When
      logger.debug("debug message");
      logger.info("info message");

      // Then
      expect(mockConsole.debug).toHaveBeenCalledWith("debug message");
      expect(mockConsole.info).toHaveBeenCalledWith("info message");
    });

    it("should preserve initial log level despite environment changes", () => {
      // Given
      process.env.LOG_LEVEL = "debug";
      const logger = Logger.create({
        level: process.env.LOG_LEVEL,
        handler: mockConsole,
      });

      // When
      process.env.LOG_LEVEL = "error";
      logger.debug("debug message");

      // Then
      expect(mockConsole.debug).toHaveBeenCalledWith("debug message");
    });
  });

  describe("when handling different message types", () => {
    it("should correctly log objects and arrays", () => {
      // Given
      const logger = Logger.create({ level: "info", handler: mockConsole });
      const complexObject = { key: "value", nested: { data: [1, 2, 3] } };
      const array = [1, "string", { obj: true }];

      // When
      logger.info(complexObject);
      logger.warn(array);

      // Then
      expect(mockConsole.info).toHaveBeenCalledWith(complexObject);
      expect(mockConsole.warn).toHaveBeenCalledWith(array);
    });

    it("should preserve error objects with their stack traces", () => {
      // Given
      const logger = Logger.create({ level: "info", handler: mockConsole });
      const error = new Error("Test error");

      // When
      logger.error(error);

      // Then
      expect(mockConsole.error).toHaveBeenCalledWith(error);
    });

    it("should handle null and undefined values safely", () => {
      // Given
      const logger = Logger.create({ level: "info", handler: mockConsole });

      // When
      logger.info(undefined);
      logger.warn(null);

      // Then
      expect(mockConsole.info).toHaveBeenCalledWith(undefined);
      expect(mockConsole.warn).toHaveBeenCalledWith(null);
    });
  });

  describe("when logging with multiple arguments", () => {
    it("should pass all arguments through to the console", () => {
      // Given
      const logger = Logger.create({ level: "info", handler: mockConsole });
      const arg1 = "Message with";
      const arg2 = { details: "object" };
      const arg3 = ["additional", "data"];

      // When
      logger.info(arg1, arg2, arg3);
      logger.error("Error:", new Error("Test"), { context: "additional info" });

      // Then
      expect(mockConsole.info).toHaveBeenCalledWith(arg1, arg2, arg3);
      expect(mockConsole.error).toHaveBeenCalledWith(
        "Error:",
        expect.any(Error),
        { context: "additional info" }
      );
    });
  });

  describe("when console operations fail", () => {
    it("should continue operating without throwing errors", () => {
      // Given
      const errorConsole = {
        ...mockConsole,
        error: vi.fn().mockImplementation(() => {
          throw new Error("Console error failed");
        }),
      } as unknown as Console;
      const logger = Logger.create({ level: "error", handler: errorConsole });

      // When/Then
      expect(() => {
        logger.error("This should not throw");
      }).not.toThrow();
    });
  });
});
