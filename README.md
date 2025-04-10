# Retry Service

A TypeScript utility for managing retry logic in asynchronous operations with robust error handling.

## Features

- Configurable retry attempts with customizable delay
- Optional exponential backoff for delays
- Timeout functionality
- Conditional retrying based on errors or results
- Detailed reporting on retry attempts
- Error sanitization for logging
- Works with any error handling pattern (try/catch, Result/Either patterns, etc.)

## Setup

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env to set preferred log level

# Run the tests once
npm test

# Run tests in watch mode
npm run test:watch

# Run examples
npm run example
npm run example:data-error
```

## Requirements

- Node.js v16+ (tested with v20.16.0)
- TypeScript 5.7+

## Environment Variables

- `LOG_LEVEL`: Sets the logging level. Available options are:
  - `trace`: Most verbose, shows all logs
  - `debug`: Shows detailed debugging information
  - `info`: Default level, shows informational messages
  - `warn`: Shows only warnings and errors
  - `error`: Shows only errors

## Core Concepts

### RetryService

The RetryService provides flexible retry functionality for asynchronous operations, allowing you to:

- Set the number of retry attempts
- Configure delay between attempts
- Apply exponential backoff
- Set timeout limits
- Conditionally retry based on errors or results
- Receive detailed reports of retry attempts

## Usage Examples

### Basic Retry

```typescript
import { retryService } from "./src/retry-service/Retry.service";

// Basic usage
const result = await retryService.retry(
  async () => {
    // Your async function here
    return "success";
  },
  {
    retries: 3,
    delay: 100,
  }
);
```

### With Conditional Retrying

```typescript
const result = await retryService.retry(
  async () => {
    const response = await fetchData("resource-123");
    return response;
  },
  {
    retries: 3,
    delay: 1000,
    exponentialBackoff: true,
    // Retry based on the result
    retryOnResult: (result) => {
      return result.status === "PENDING";
    },
    // Retry based on error type
    retryOnError: (error) => {
      return error.name === "NetworkError" || error.message.includes("timeout");
    },
    // Get a report when complete
    onComplete: (report) => {
      console.log(`Operation completed after ${report.attempts} attempts`);
    },
  }
);
```

### With Result/Either Pattern (Example with DataErrorPayload)

This example shows how to use the retry service with a Result/Either pattern implementation called DataErrorPayload, which is included in the example code. This pattern is similar to Rust's Result or Haskell's Either types:

```typescript
import { retryService } from "./src/retry-service/Retry.service";
import DataErrorPayloadUtil from "./src/util/data-error-payload/DataErrorPayload.utils";
import { DataErrorPayload } from "./src/util/data-error-payload/types/data-error-payload.types";

// Function that returns a Result type
async function fetchData(
  id: string
): Promise<DataErrorPayload<UserData, Error>> {
  try {
    // API call or other operation
    const data = await api.getUser(id);
    return DataErrorPayloadUtil.create(data); // Ok variant
  } catch (error) {
    return DataErrorPayloadUtil.createErr(
      error instanceof Error ? error : new Error(String(error))
    ); // Err variant
  }
}

// Using with retry and a Result pattern
const result = await retryService.retry(
  async () => {
    const response = await fetchData("user-123");
    return response;
  },
  {
    retries: 3,
    delay: 1000,
    exponentialBackoff: true,
    retryOnResult: (result) => {
      // Check if result is an error and decide whether to retry
      return (
        DataErrorPayloadUtil.isErr(result) &&
        result.error.message === "Resource temporarily unavailable"
      );
    },
    onComplete: (report) => {
      console.log(`Operation completed after ${report.attempts} attempts`);
    },
  }
);

// Process the result
if (DataErrorPayloadUtil.isOk(result)) {
  const data = DataErrorPayloadUtil.extractOkPayload(result);
  console.log("Success:", data);
} else {
  const error = DataErrorPayloadUtil.extractErrorPayload(result);
  console.error("Failed:", error.message);
}
```

## Configuration Options

The `RetryOptions` interface provides the following configuration options:

- `retries`: Number of retry attempts
- `delay`: Delay between retry attempts in milliseconds (default: 0)
- `exponentialBackoff`: Whether to use exponential backoff for delays (default: false)
- `retryOnError`: Function to determine if retry should occur based on error
- `retryOnResult`: Function to determine if retry should occur based on result
- `timeout`: Maximum time in milliseconds for all retry attempts
- `onComplete`: Callback function executed when retry process completes
- `sanitizeRetryReasons`: Controls object sanitization in retry reports (default: true)
- `sanitizationThreshold`: Size threshold in characters for sanitization (default: 500)

## See Also

For full examples, see:

- `src/example.ts` - Basic retry examples
- `src/data-error-payload-example.ts` - Examples using a Result/Either pattern implementation
