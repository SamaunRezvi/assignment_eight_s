import { describe, expect, it } from "vitest";
import { ApiError } from "../src/utils/ApiError.js";
import { assertTransition, resolveSlot, roundMoney, toMinutes } from "../src/modules/bookings/bookings.rules.js";

const futureDate = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);

describe("resolveSlot", () => {
  it("computes duration and UTC-encoded slot boundaries", () => {
    const slot = resolveSlot({ date: futureDate, startTime: "09:00", endTime: "12:30" });
    expect(slot.hours).toBe(3.5);
    expect(slot.startAt.toISOString()).toBe(`${futureDate}T09:00:00.000Z`);
    expect(slot.endAt.toISOString()).toBe(`${futureDate}T12:30:00.000Z`);
  });

  it("rejects an end time that is not after the start time", () => {
    expect(() => resolveSlot({ date: futureDate, startTime: "12:00", endTime: "12:00" })).toThrow(ApiError);
    expect(() => resolveSlot({ date: futureDate, startTime: "14:00", endTime: "10:00" })).toThrow(ApiError);
  });

  it("enforces minimum and maximum session length", () => {
    expect(() => resolveSlot({ date: futureDate, startTime: "10:00", endTime: "10:30" })).toThrow(/between/);
    expect(() => resolveSlot({ date: futureDate, startTime: "06:00", endTime: "20:00" })).toThrow(/between/);
  });

  it("rejects dates in the past", () => {
    expect(() => resolveSlot({ date: "2020-01-01", startTime: "10:00", endTime: "12:00" })).toThrow(/past/);
  });
});

describe("assertTransition", () => {
  it("lets a guest cancel only pending bookings", () => {
    expect(() => assertTransition("guest", "Pending", "Cancelled")).not.toThrow();
    expect(() => assertTransition("guest", "Confirmed", "Cancelled")).toThrow(ApiError);
    expect(() => assertTransition("guest", "Pending", "Confirmed")).toThrow(ApiError);
  });

  it("lets a host confirm, complete or cancel along the allowed path", () => {
    expect(() => assertTransition("host", "Pending", "Confirmed")).not.toThrow();
    expect(() => assertTransition("host", "Confirmed", "Completed")).not.toThrow();
    expect(() => assertTransition("host", "Cancelled", "Confirmed")).toThrow(ApiError);
    expect(() => assertTransition("host", "Pending", "Completed")).toThrow(ApiError);
  });
});

describe("helpers", () => {
  it("converts times and rounds money", () => {
    expect(toMinutes("13:30")).toBe(810);
    expect(roundMoney(10.005 * 3)).toBeCloseTo(30.02, 2);
  });
});
