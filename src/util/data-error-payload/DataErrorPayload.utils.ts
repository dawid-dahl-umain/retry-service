import { DataErrorPayload } from "./types/data-error-payload.types";
import { DataErrorPayloadErr } from "./types/data-error-payload.types";
import { DataErrorPayloadOk } from "./types/data-error-payload.types";

class DataErrorPayloadUtil {
  /** Constructs a successful DataErrorPayload with data */
  static create<D>(data: D): DataErrorPayloadOk<D> {
    return { data, error: null };
  }

  /** Constructs a failed DataErrorPayload with error */
  static createErr<E>(error: E): DataErrorPayloadErr<E> {
    return { data: null, error };
  }

  /** Type guard to check if payload contains data (and no error) */
  static isOk<D, E>(
    payload: DataErrorPayload<D, E>
  ): payload is DataErrorPayloadOk<D> {
    return (
      payload !== null &&
      typeof payload === "object" &&
      "data" in payload &&
      "error" in payload &&
      payload.error === null
    );
  }

  /** Type guard to check if payload contains error */
  static isErr<D, E>(
    payload: DataErrorPayload<D, E>
  ): payload is DataErrorPayloadErr<E> {
    return (
      payload !== null &&
      typeof payload === "object" &&
      "data" in payload &&
      "error" in payload &&
      payload.data === null &&
      payload.error !== null
    );
  }

  /** Extracts the data from a success payload */
  static extractOkPayload<D>(payload: DataErrorPayloadOk<D>): D {
    return payload.data;
  }

  /** Extracts the error from an error payload */
  static extractErrorPayload<E>(payload: DataErrorPayloadErr<E>): E {
    return payload.error;
  }

  /**
   * Type guard to check if a value is a DataErrorPayload
   *
   * Useful e.g. in catch blocks when the error type is unknown
   */
  static isDataErrorPayload(
    value: unknown
  ): value is DataErrorPayload<unknown, unknown> {
    return (
      value !== null &&
      typeof value === "object" &&
      "data" in value &&
      "error" in value &&
      // Ensure that data and error are not *both* non-null
      !((value as any).data !== null && (value as any).error !== null)
    );
  }
}

export default DataErrorPayloadUtil;
