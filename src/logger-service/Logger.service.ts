export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error';

/**
 * A subset of the JS Console interface that handles basic logging functionality.
 * This interface matches the method signatures of Console methods we use, while
 * intentionally omitting methods we don't need for now (like time, group, etc).
 */
export interface LogHandler {
  trace: {
    (...data: any[]): void;
    (message?: any, ...optionalParams: any[]): void;
  };
  debug: {
    (...data: any[]): void;
    (message?: any, ...optionalParams: any[]): void;
  };
  log: {
    (...data: any[]): void;
    (message?: any, ...optionalParams: any[]): void;
  };
  info: {
    (...data: any[]): void;
    (message?: any, ...optionalParams: any[]): void;
  };
  warn: {
    (...data: any[]): void;
    (message?: any, ...optionalParams: any[]): void;
  };
  error: {
    (...data: any[]): void;
    (message?: any, ...optionalParams: any[]): void;
  };
}

export interface LoggerOptions {
  level?: string;
  handler?: LogHandler;
}

/**
 * Console-compatible logger with priority-based filtering.
 *
 * Log levels (most to least verbose):
 * trace > debug > info (default) > warn > error
 *
 * Messages are logged if their level is >= configured level.
 *
 * The default logger instance uses the LOG_LEVEL environment variable
 * to determine the logging level. If not set, defaults to 'info'.
 *
 * @example
 * const logger = Logger.create({ level: 'debug' });
 * logger.debug('Config loaded'); // logs
 * logger.trace('Details');       // filtered out
 */
export class Logger implements LogHandler {
  /**
   * Numeric priorities: lower = more verbose
   * trace < debug < info < warn < error
   */
  private static readonly LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
    trace: 1,
    debug: 2,
    info: 3,
    warn: 4,
    error: 5,
  } as const;

  private static readonly DEFAULT_LOG_LEVEL: LogLevel = 'info';

  private static isValidLogLevel(value: string | undefined): value is LogLevel {
    return (
      value !== undefined &&
      Object.keys(Logger.LOG_LEVEL_PRIORITY).includes(value)
    );
  }

  private readonly currentLevel: LogLevel;
  private readonly logHandler: LogHandler;

  private constructor(
    level: string | undefined = Logger.DEFAULT_LOG_LEVEL,
    logHandler: LogHandler = console
  ) {
    this.logHandler = logHandler;

    if (Logger.isValidLogLevel(level)) {
      this.currentLevel = level;
      return;
    }

    logHandler.warn(
      `Invalid log level "${level}", defaulting to "${Logger.DEFAULT_LOG_LEVEL}".`
    );

    this.currentLevel = Logger.DEFAULT_LOG_LEVEL;
  }

  public static create(options: LoggerOptions = {}): Logger {
    return new Logger(options.level, options.handler);
  }

  private isLoggable(targetLevel: LogLevel): boolean {
    return (
      Logger.LOG_LEVEL_PRIORITY[targetLevel] >=
      Logger.LOG_LEVEL_PRIORITY[this.currentLevel]
    );
  }

  private tryLog(
    method: keyof LogHandler,
    message?: unknown,
    ...optionalParams: unknown[]
  ): void {
    try {
      const logMethod = this.logHandler[method];
      logMethod(message, ...optionalParams);
    } catch (error) {
      // Silently handle console method failures for now
    }
  }

  public trace(message?: unknown, ...optionalParams: unknown[]): void {
    if (this.isLoggable('trace')) {
      this.tryLog('trace', message, ...optionalParams);
    }
  }

  public debug(message?: unknown, ...optionalParams: unknown[]): void {
    if (this.isLoggable('debug')) {
      this.tryLog('debug', message, ...optionalParams);
    }
  }

  public log(message?: unknown, ...optionalParams: unknown[]): void {
    if (this.isLoggable('info')) {
      this.tryLog('log', message, ...optionalParams);
    }
  }

  public info(message?: unknown, ...optionalParams: unknown[]): void {
    if (this.isLoggable('info')) {
      this.tryLog('info', message, ...optionalParams);
    }
  }

  public warn(message?: unknown, ...optionalParams: unknown[]): void {
    if (this.isLoggable('warn')) {
      this.tryLog('warn', message, ...optionalParams);
    }
  }

  public error(message?: unknown, ...optionalParams: unknown[]): void {
    if (this.isLoggable('error')) {
      this.tryLog('error', message, ...optionalParams);
    }
  }
}

export const logger = Logger.create({ level: process.env.LOG_LEVEL });
