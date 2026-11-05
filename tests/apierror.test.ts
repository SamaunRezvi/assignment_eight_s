import { describe, expect, it } from "vitest";
import { ApiError } from "../src/utils/ApiError.js";

describe("ApiError helpers", () => {
  it("map each helper to its HTTP status", () => {
    expect(ApiError.badRequest("x").statusCode).toBe(400);
    expect(ApiError.unauthorized().statusCode).toBe(401);
    expect(ApiError.forbidden().statusCode).toBe(403);
    expect(ApiError.notFound().statusCode).toBe(404);
    expect(ApiError.conflict("x").statusCode).toBe(409);
  });

  it("carry a readable default message and optional details", () => {
    expect(ApiError.unauthorized().message).toBe("Authentication required");
    expect(ApiError.badRequest("Bad", [{ field: "email" }]).details).toEqual([{ field: "email" }]);
    expect(ApiError.conflict("Taken")).toBeInstanceOf(Error);
  });
});
