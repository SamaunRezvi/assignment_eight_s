import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { SignJWT } from "jose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const SECRET = "integration-test-secret-with-32-plus-characters";
const ORIGIN = "http://localhost:3000";
const COOKIE = "studiospace_token";

let replSet: MongoMemoryReplSet;
let server: Server;
let base: string;
let closeDatabase: () => Promise<void>;

async function tokenFor(id: string, name: string) {
  return new SignJWT({ email: `${id}@example.com`, name, picture: "" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(id)
    .setIssuer("studiospace")
    .setAudience("studiospace-api")
    .setExpirationTime("10m")
    .sign(new TextEncoder().encode(SECRET));
}

interface CallOptions {
  method?: string;
  token?: string;
  body?: unknown;
  origin?: string | null;
}

async function call(path: string, { method = "GET", token, body, origin = ORIGIN }: CallOptions = {}) {
  const headers: Record<string, string> = {};
  if (token) headers.cookie = `${COOKIE}=${token}`;
  if (body !== undefined) headers["content-type"] = "application/json";
  if (origin) headers.origin = origin;

  const response = await fetch(`${base}/api${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const type = response.headers.get("content-type") ?? "";
  // Response bodies are asserted field by field, so a loose shape keeps the tests readable.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json = type.includes("application/json") ? ((await response.json()) as Record<string, any>) : null;
  return { status: response.status, type, json };
}

const studioInput = {
  title: "Integration Test Cyclorama",
  category: "photo-studio",
  hourlyRate: 60,
  securityDeposit: 100,
  maxCapacity: 6,
  location: { address: "12 Test Street", city: "Testville" },
  image: "https://images.example.com/cover.jpg",
  gallery: [],
  amenities: ["Natural light"],
  overview: "A fully equipped studio used only for automated integration tests.",
};

const day = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
const slot = (startTime: string, endTime: string, extra: object = {}) => ({
  date: day,
  startTime,
  endTime,
  guests: 2,
  note: "",
  ...extra,
});

let hostToken: string;
let guestA: string;
let guestB: string;
let studioId: string;

beforeAll(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });

  process.env.NODE_ENV = "test";
  process.env.MONGODB_URI = replSet.getUri();
  process.env.MONGODB_DB = "studiospace_test";
  process.env.CLIENT_ORIGIN = ORIGIN;
  process.env.JWT_SECRET = SECRET;
  process.env.AUTH_COOKIE_NAME = COOKIE;
  process.env.IMGBB_API_KEY = "test-key-never-sent-anywhere";

  const db = await import("../src/config/db.js");
  const { createApp } = await import("../src/app.js");
  await db.connectDatabase();
  closeDatabase = db.closeDatabase;
  server = createApp().listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  hostToken = await tokenFor("host-1", "Hannah Host");
  guestA = await tokenFor("guest-a", "Gina Guest");
  guestB = await tokenFor("guest-b", "Gabe Guest");
});

afterAll(async () => {
  await new Promise((resolve) => server?.close(resolve));
  await closeDatabase?.();
  await replSet?.stop();
});

describe("authentication", () => {
  it("rejects unauthenticated mutations with 401", async () => {
    expect((await call("/studios", { method: "POST", body: studioInput })).status).toBe(401);
    expect((await call("/studios/64b000000000000000000001", { method: "DELETE" })).status).toBe(401);
    expect((await call("/bookings", { method: "POST", body: {} })).status).toBe(401);
  });

  it("rejects a token signed with the wrong secret", async () => {
    const forged = await new SignJWT({ email: "x@example.com" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("host-1")
      .setIssuer("studiospace")
      .setAudience("studiospace-api")
      .sign(new TextEncoder().encode("a-completely-different-secret-value-123456"));
    expect((await call("/studios", { method: "POST", token: forged, body: studioInput })).status).toBe(401);
  });

  it("blocks cross-site writes from an untrusted origin", async () => {
    const result = await call("/studios", { method: "POST", token: hostToken, body: studioInput, origin: "https://evil.example" });
    expect(result.status).toBe(403);
  });
});

describe("studios", () => {
  it("creates a studio for the host and hides the owner email publicly", async () => {
    const created = await call("/studios", { method: "POST", token: hostToken, body: studioInput });
    expect(created.status).toBe(201);
    studioId = created.json?.data.id;
    expect(created.json?.data.ownerEmail).toBe("host-1@example.com");

    const publicView = await call(`/studios/${studioId}`);
    expect(publicView.status).toBe(200);
    expect(publicView.json?.data.ownerEmail).toBeUndefined();
    expect(publicView.json?.data.host.name).toBe("Hannah Host");
  });

  it("validates input and ignores client-supplied owner fields", async () => {
    const bad = await call("/studios", { method: "POST", token: hostToken, body: { ...studioInput, hourlyRate: -5 } });
    expect(bad.status).toBe(400);

    const spoof = await call("/studios", {
      method: "POST",
      token: hostToken,
      body: { ...studioInput, title: "Spoof Attempt", ownerId: "someone-else", ownerEmail: "victim@example.com" },
    });
    expect(spoof.status).toBe(201);
    expect(spoof.json?.data.ownerEmail).toBe("host-1@example.com");
  });

  it("prevents other users from updating or deleting a studio", async () => {
    expect((await call(`/studios/${studioId}`, { method: "PUT", token: guestA, body: studioInput })).status).toBe(403);
    expect((await call(`/studios/${studioId}`, { method: "DELETE", token: guestA })).status).toBe(403);
  });

  it("treats regex characters in search text as literals", async () => {
    const result = await call("/studios?q=.*(");
    expect(result.status).toBe(200);
    expect(result.json?.data).toEqual([]);
  });
});

describe("bookings and double-booking prevention", () => {
  it("rejects the host booking their own studio and over-capacity requests", async () => {
    const own = await call("/bookings", { method: "POST", token: hostToken, body: { studioId, ...slot("09:00", "11:00") } });
    expect(own.status).toBe(403);

    const crowded = await call("/bookings", { method: "POST", token: guestA, body: { studioId, ...slot("09:00", "11:00", { guests: 99 }) } });
    expect(crowded.status).toBe(400);
  });

  it("only blocks a slot once an overlapping booking is Confirmed", async () => {
    const first = await call("/bookings", { method: "POST", token: guestA, body: { studioId, ...slot("10:00", "13:00") } });
    expect(first.status).toBe(201);
    expect(first.json?.data.status).toBe("Pending");
    expect(first.json?.data.total).toBe(60 * 3 + 100);

    // A pending booking does not block anyone.
    const second = await call("/bookings", { method: "POST", token: guestB, body: { studioId, ...slot("12:00", "14:00") } });
    expect(second.status).toBe(201);

    // The host confirms the first booking.
    const confirmed = await call(`/bookings/${first.json?.data.id}/status`, { method: "PATCH", token: hostToken, body: { status: "Confirmed" } });
    expect(confirmed.status).toBe(200);
    expect(confirmed.json?.data.status).toBe("Confirmed");

    // Confirming the overlapping request now collides.
    const collision = await call(`/bookings/${second.json?.data.id}/status`, { method: "PATCH", token: hostToken, body: { status: "Confirmed" } });
    expect(collision.status).toBe(409);
    expect(collision.json?.message).toMatch(/already booked/i);

    // New overlapping requests are rejected up front.
    const direct = await call("/bookings", { method: "POST", token: guestB, body: { studioId, ...slot("11:00", "12:00") } });
    expect(direct.status).toBe(409);
    expect(direct.json?.message).toMatch(/already booked/i);

    // Back-to-back slots (end equals start) do not overlap.
    const adjacent = await call("/bookings", { method: "POST", token: guestA, body: { studioId, ...slot("13:00", "15:00") } });
    expect(adjacent.status).toBe(201);

    const availability = await call(`/bookings/availability?studioId=${studioId}&date=${day}`);
    expect(availability.json?.data).toEqual([{ startTime: "10:00", endTime: "13:00" }]);
  });

  it("lets only the right party change a booking's status", async () => {
    const created = await call("/bookings", { method: "POST", token: guestA, body: { studioId, ...slot("18:00", "20:00") } });
    const id = created.json?.data.id;

    expect((await call(`/bookings/${id}/status`, { method: "PATCH", token: guestA, body: { status: "Confirmed" } })).status).toBe(409);
    expect((await call(`/bookings/${id}/status`, { method: "PATCH", token: guestB, body: { status: "Cancelled" } })).status).toBe(404);
    expect((await call(`/bookings/${id}/status`, { method: "PATCH", token: guestA, body: { status: "Cancelled" } })).status).toBe(200);
  });

  it("serves a PDF invoice only for confirmed bookings", async () => {
    const mine = await call("/bookings/mine", { token: guestA });
    const confirmed = mine.json?.data.find((item: { status: string }) => item.status === "Confirmed");
    const pending = await call("/bookings", { method: "POST", token: guestA, body: { studioId, ...slot("21:00", "22:00") } });

    expect((await call(`/bookings/${pending.json?.data.id}/invoice`, { token: guestA })).status).toBe(409);
    const invoice = await call(`/bookings/${confirmed.id}/invoice`, { token: guestA });
    expect(invoice.status).toBe(200);
    expect(invoice.type).toContain("application/pdf");
    expect((await call(`/bookings/${confirmed.id}/invoice`, { token: guestB })).status).toBe(404);
  });

  it("allows exactly one winner when overlapping requests are confirmed concurrently", async () => {
    const raceDay = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);
    const body = (startTime: string, endTime: string) => ({ studioId, date: raceDay, startTime, endTime, guests: 1, note: "" });
    const a = await call("/bookings", { method: "POST", token: guestA, body: body("09:00", "12:00") });
    const b = await call("/bookings", { method: "POST", token: guestB, body: body("10:00", "13:00") });

    const results = await Promise.all([
      call(`/bookings/${a.json?.data.id}/status`, { method: "PATCH", token: hostToken, body: { status: "Confirmed" } }),
      call(`/bookings/${b.json?.data.id}/status`, { method: "PATCH", token: hostToken, body: { status: "Confirmed" } }),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
  });
});

describe("reviews and wishlist", () => {
  it("keeps one review per user and updates the studio rating", async () => {
    const review = await call(`/studios/${studioId}/reviews`, { method: "POST", token: guestA, body: { rating: 4, comment: "Spacious and very well kept." } });
    expect(review.status).toBe(201);
    expect((await call(`/studios/${studioId}/reviews`, { method: "POST", token: guestA, body: { rating: 5, comment: "Trying to review twice." } })).status).toBe(409);
    expect((await call(`/studios/${studioId}/reviews`, { method: "POST", token: hostToken, body: { rating: 5, comment: "Reviewing my own studio." } })).status).toBe(403);

    const studio = await call(`/studios/${studioId}`);
    expect(studio.json?.data.rating).toBe(4);
    expect(studio.json?.data.reviewCount).toBe(1);
  });

  it("saves and removes wishlist entries idempotently", async () => {
    expect((await call(`/wishlist/${studioId}`, { method: "PUT", token: guestA })).status).toBe(200);
    expect((await call(`/wishlist/${studioId}`, { method: "PUT", token: guestA })).status).toBe(200);
    expect((await call("/wishlist/ids", { token: guestA })).json?.data).toEqual([studioId]);
    expect((await call(`/wishlist/${studioId}`, { method: "DELETE", token: guestA })).status).toBe(200);
    expect((await call("/wishlist/ids", { token: guestA })).json?.data).toEqual([]);
  });
});

describe("deleting a studio", () => {
  it("cascades to reviews and cancels open bookings", async () => {
    expect((await call(`/studios/${studioId}`, { method: "DELETE", token: hostToken })).status).toBe(200);
    expect((await call(`/studios/${studioId}`)).status).toBe(404);

    const mine = await call("/bookings/mine", { token: guestA });
    const open = mine.json?.data.filter((item: { status: string }) => item.status === "Pending" || item.status === "Confirmed");
    expect(open).toEqual([]);
  });
});

describe("newsletter", () => {
  it("subscribes an address once and treats repeats as already subscribed", async () => {
    const first = await call("/newsletter", { method: "POST", body: { email: "  Maker@Example.com " } });
    expect(first.status).toBe(201);
    expect(first.json?.data.alreadySubscribed).toBe(false);

    const repeat = await call("/newsletter", { method: "POST", body: { email: "maker@example.com" } });
    expect(repeat.status).toBe(200);
    expect(repeat.json?.data.alreadySubscribed).toBe(true);
  });

  it("rejects malformed addresses", async () => {
    expect((await call("/newsletter", { method: "POST", body: { email: "not-an-email" } })).status).toBe(400);
    expect((await call("/newsletter", { method: "POST", body: {} })).status).toBe(400);
  });
});

describe("image uploads", () => {
  async function upload(bytes: Uint8Array, token?: string) {
    const form = new FormData();
    form.append("image", new Blob([bytes], { type: "image/png" }), "photo.png");
    const response = await fetch(`${base}/api/uploads`, {
      method: "POST",
      headers: { origin: ORIGIN, ...(token ? { cookie: `${COOKIE}=${token}` } : {}) },
      body: form,
    });
    return { status: response.status, json: (await response.json()) as Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any
  }

  it("requires authentication", async () => {
    expect((await upload(new Uint8Array(32))).status).toBe(401);
  });

  it("rejects a request without a file", async () => {
    const response = await fetch(`${base}/api/uploads`, {
      method: "POST",
      headers: { origin: ORIGIN, cookie: `${COOKIE}=${guestA}` },
      body: new FormData(),
    });
    expect(response.status).toBe(400);
  });

  it("rejects files whose bytes are not a real image, whatever the declared type", async () => {
    const script = new TextEncoder().encode("<script>alert(1)</script> padded to pass the length check");
    const result = await upload(script, guestA);
    expect(result.status).toBe(400);
    expect(result.json.message).toMatch(/JPEG, PNG or WebP/);
  });
});

describe("dashboard summary", () => {
  it("reports host revenue and guest spending from confirmed work only", async () => {
    const owner = await tokenFor("dash-host", "Dana Dash");
    const guest = await tokenFor("dash-guest", "Gus Dash");

    const studio = await call("/studios", { method: "POST", token: owner, body: { ...studioInput, title: "Dashboard Fixture Studio" } });
    const id = studio.json?.data.id;

    const confirmedBooking = await call("/bookings", { method: "POST", token: guest, body: { studioId: id, ...slot("09:00", "11:00") } });
    const pendingBooking = await call("/bookings", { method: "POST", token: guest, body: { studioId: id, ...slot("14:00", "15:00") } });
    expect(pendingBooking.status).toBe(201);
    await call(`/bookings/${confirmedBooking.json?.data.id}/status`, { method: "PATCH", token: owner, body: { status: "Confirmed" } });

    const host = (await call("/dashboard/summary", { token: owner })).json?.data.host;
    expect(host.listings).toBe(1);
    expect(host.bookingsByStatus).toMatchObject({ Pending: 1, Confirmed: 1, Completed: 0, Cancelled: 0 });
    expect(host.revenue).toBe(60 * 2);
    expect(host.monthly).toHaveLength(1);

    const guestView = (await call("/dashboard/summary", { token: guest })).json?.data.guest;
    expect(guestView.bookingsByStatus).toMatchObject({ Pending: 1, Confirmed: 1 });
    expect(guestView.totalSpent).toBe(60 * 2 + 100);
  });

  it("requires authentication", async () => {
    expect((await call("/dashboard/summary")).status).toBe(401);
  });
});
