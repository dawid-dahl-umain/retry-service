/**
 * Represents a successful response with data
 */
export type DataErrorPayloadOk<D> = {
  data: D;
  error: null;
};

/**
 * Represents a failed response with error
 */
export type DataErrorPayloadErr<E> = {
  data: null;
  error: E;
};

/**
 * Utility type to create a unified `data` and `error` object for the return type
 * for our services. We will always return an object and it will always have a `data`
 * and `error` property. Only one will be populated with a value, the other will
 * be `null`. The error can be any type, representing the "sad path".
 *
 * DataErrorPayloadUtil can be used for construction and type guards.
 */
export type DataErrorPayload<
  D extends any = unknown,
  E extends unknown = Error
> = DataErrorPayloadOk<D> | DataErrorPayloadErr<E>;

/** Represents a basic serializable error structure, mirroring the standard Error */
export type SerializedError = {
  name: string;
  message: string;
  /** The cause of the error, if any, must also be serializable */
  cause?: unknown;
};

/** Represents a successful serialized payload */
export type SerializedDataErrorPayloadOk<D> = {
  data: D;
  error: null;
};

/** Represents a failed serialized payload */
export type SerializedDataErrorPayloadErr<
  E extends SerializedError = SerializedError
> = {
  data: null;
  error: E;
};

/** The unified serializable payload type */
export type SerializedDataErrorPayload<
  D extends any = unknown,
  E extends SerializedError = SerializedError
> = SerializedDataErrorPayloadOk<D> | SerializedDataErrorPayloadErr<E>;
