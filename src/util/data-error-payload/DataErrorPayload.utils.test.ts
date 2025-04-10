import DataErrorPayloadUtil from "./DataErrorPayload.utils";
import { DataErrorPayload } from "./types/data-error-payload.types";

describe("DataErrorPayloadUtil", () => {
  describe("Constructors", () => {
    describe("Ok", () => {
      it("creates a valid success payload", () => {
        // Given
        const data = "success data";

        // When
        const result = DataErrorPayloadUtil.create(data);

        // Then
        expect(DataErrorPayloadUtil.isOk(result)).toBe(true);
        expect(result.data).toBe(data);
        expect(result.error).toBeNull();
      });

      it.each([
        { name: "number", value: 123 },
        { name: "object", value: { key: "value" } },
        { name: "array", value: ["array"] },
        { name: "undefined", value: undefined },
      ])("works with $name data type", ({ value }) => {
        const result = DataErrorPayloadUtil.create(value);
        expect(DataErrorPayloadUtil.isOk(result)).toBe(true);
        expect(result.data).toBe(value);
        expect(result.error).toBeNull();
      });
    });

    describe("Err", () => {
      it("creates a valid error payload", () => {
        // Given
        const error = new Error("test error");

        // When
        const result = DataErrorPayloadUtil.createErr(error);

        // Then
        expect(DataErrorPayloadUtil.isErr(result)).toBe(true);
        expect(result.data).toBeNull();
        expect(result.error).toBe(error);
      });

      it.each([
        { name: "standard error", value: new Error("standard error") },
        { name: "type error", value: new TypeError("type error") },
      ])("works with $name", ({ value }) => {
        const result = DataErrorPayloadUtil.createErr(value);
        expect(DataErrorPayloadUtil.isErr(result)).toBe(true);
        expect(result.data).toBeNull();
        expect(result.error).toBe(value);
      });

      it("works with custom error type", () => {
        class CustomError extends Error {
          constructor(message: string) {
            super(message);
            this.name = "CustomError";
          }
        }
        const error = new CustomError("custom error");
        const result = DataErrorPayloadUtil.createErr(error);
        expect(DataErrorPayloadUtil.isErr(result)).toBe(true);
        expect(result.data).toBeNull();
        expect(result.error).toBe(error);
      });
    });
  });

  describe("Type Guards", () => {
    describe("isOk", () => {
      it("identifies valid success payload", () => {
        // Given
        const payload: DataErrorPayload<string, Error> = {
          data: "success",
          error: null,
        };

        // When
        const result = DataErrorPayloadUtil.isOk(payload);

        // Then
        expect(result).toBe(true);
      });

      it("rejects error payload", () => {
        // Given
        const payload: DataErrorPayload<string, Error> = {
          data: null,
          error: new Error("failed"),
        };

        // When
        const result = DataErrorPayloadUtil.isOk(payload);

        // Then
        expect(result).toBe(false);
      });

      it.each([
        { name: "zero", value: 0 },
        { name: "empty string", value: "" },
        { name: "false", value: false },
        { name: "empty array", value: [] },
        { name: "empty object", value: {} },
        { name: "null data", value: null },
        { name: "undefined data", value: undefined },
      ])(
        "accepts falsy or nullish data when error is null: $name",
        ({ value }) => {
          // Given
          const payload: DataErrorPayload<typeof value, Error> = {
            data: value,
            error: null,
          };

          // When
          const result = DataErrorPayloadUtil.isOk(payload);

          // Then
          expect(result).toBe(true);
        }
      );

      it.each([
        { name: "invalid null value", value: null },
        { name: "invalid undefined value", value: undefined },
        { name: "missing error field", value: { data: "missing error" } },
        {
          name: "missing data field",
          value: { error: new Error("missing data") },
        },
        {
          name: "error is not null",
          value: { data: "data", error: new Error("err") },
        },
        { name: "non-object value", value: "not an object" },
      ])(
        "rejects invalid payload structure or non-null error: $name",
        ({ value }) => {
          expect(DataErrorPayloadUtil.isOk(value as any)).toBe(false);
        }
      );
    });

    describe("isErr", () => {
      it("identifies valid error payload", () => {
        // Given
        const payload: DataErrorPayload<string> = {
          data: null,
          error: new Error("failed"),
        };

        // When
        const result = DataErrorPayloadUtil.isErr(payload);

        // Then
        expect(result).toBe(true);
      });

      it("rejects success payload", () => {
        // Given
        const payload: DataErrorPayload<string> = {
          data: "success",
          error: null,
        };

        // When
        const result = DataErrorPayloadUtil.isErr(payload);

        // Then
        expect(result).toBe(false);
      });

      it.each([
        { name: "zero", value: 0 },
        { name: "empty string", value: "" },
        { name: "false", value: false },
        { name: "empty array", value: [] },
        { name: "empty object", value: {} },
      ])("does not classify falsy data as errors: $name", ({ value }) => {
        // Given
        const payload: DataErrorPayload<typeof value> = {
          data: value,
          error: null,
        };

        // When
        const result = DataErrorPayloadUtil.isErr(payload);

        // Then
        expect(result).toBe(false);
      });

      it.each([
        { name: "null", value: null },
        { name: "undefined", value: undefined },
        { name: "empty object", value: {} },
        { name: "missing error field", value: { data: "missing error" } },
        {
          name: "missing data field",
          value: { error: new Error("missing data") },
        },
        { name: "non-object value", value: "not an object" },
      ])("rejects invalid payload: $name", ({ value }) => {
        expect(DataErrorPayloadUtil.isErr(value as any)).toBe(false);
      });
    });

    describe("isDataErrorPayload", () => {
      it("identifies valid success payload as DataErrorPayload", () => {
        const payload = DataErrorPayloadUtil.create("test");
        expect(DataErrorPayloadUtil.isDataErrorPayload(payload)).toBe(true);
      });

      it("identifies valid error payload as DataErrorPayload", () => {
        const payload = DataErrorPayloadUtil.createErr(new Error("test"));
        expect(DataErrorPayloadUtil.isDataErrorPayload(payload)).toBe(true);
      });

      it("identifies payload with both data and error null as DataErrorPayload", () => {
        const payload = { data: null, error: null };
        expect(DataErrorPayloadUtil.isDataErrorPayload(payload)).toBe(true);
      });

      it.each([
        { name: "null", value: null },
        { name: "undefined", value: undefined },
        { name: "string", value: "not a payload" },
        { name: "number", value: 123 },
        { name: "empty object", value: {} },
        { name: "missing error", value: { data: null } },
        { name: "missing data", value: { error: null } },
        { name: "both non-null", value: { data: "test", error: new Error() } },
      ])("rejects invalid payload: $name", ({ value }) => {
        expect(DataErrorPayloadUtil.isDataErrorPayload(value)).toBe(false);
      });
    });
  });

  describe("Payload Extractors", () => {
    describe("extractOkPayload", () => {
      it("extracts data from a success payload", () => {
        // Given
        const data = "success data";
        const payload = DataErrorPayloadUtil.create(data);

        // When
        const result = DataErrorPayloadUtil.extractOkPayload(payload);

        // Then
        expect(result).toBe(data);
      });
    });

    describe("extractErrorPayload", () => {
      it("extracts error from an error payload", () => {
        // Given
        const error = new Error("test error");
        const payload = DataErrorPayloadUtil.createErr(error);

        // When
        const result = DataErrorPayloadUtil.extractErrorPayload(payload);

        // Then
        expect(result).toBe(error);
      });
    });
  });
});
