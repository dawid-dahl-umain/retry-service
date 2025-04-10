# Retry Module

A TypeScript utility for managing retry logic in asynchronous operations with comprehensive testing.

## Features

- Configurable retry attempts with customizable delay
- Optional exponential backoff for delays
- Timeout functionality
- Conditional retrying based on errors or results
- Detailed reporting on retry attempts
- Error sanitization for logging

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
```

## Environment Variables

- `LOG_LEVEL`: Sets the logging level. Available options are:
  - `trace`: Most verbose, shows all logs
  - `debug`: Shows detailed debugging information
  - `info`: Default level, shows informational messages
  - `warn`: Shows only warnings and errors
  - `error`: Shows only errors

## Usage Example

```typescript
import { retryService } from "./src/Retry.service";

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

// Using with exponential backoff
const result = await retryService.retry(
  async () => {
    // Your async function here
    return "success";
  },
  {
    retries: 3,
    delay: 100,
    exponentialBackoff: true,
  }
);

// With conditional retrying
const result = await retryService.retry(
  async () => {
    // Your async function here
    return { status: "pending" };
  },
  {
    retries: 5,
    delay: 100,
    retryOnResult: (result) => result.status === "pending",
    timeout: 30000, // 30 seconds timeout
    onComplete: (report) => {
      console.log(`Retry completed after ${report.attempts} attempts`);
    },
  }
);
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
