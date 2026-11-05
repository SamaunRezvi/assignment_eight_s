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
    form.append("image", new Blob([new Uint8Array(bytes)], { type: "image/png" }), "photo.png");
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

describe("listing query limits", () => {
  it("rejects out-of-range pagination and unknown sort or category values", async () => {
    expect((await call("/studios?limit=500")).status).toBe(400);
    expect((await call("/studios?page=0")).status).toBe(400);
    expect((await call("/studios?sort=cheapest-first")).status).toBe(400);
    expect((await call("/studios?category=castle")).status).toBe(400);
  });

  it("answers malformed ids with a clean 400 instead of a server error", async () => {
    expect((await call("/studios/not-an-object-id")).status).toBe(400);
  });
});

describe("transport hardening", () => {
  it("sends security headers and does not advertise the framework", async () => {
    const response = await fetch(`${base}/api/health`);
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("x-powered-by")).toBeNull();
  });

  it("returns a JSON 404 for unknown routes", async () => {
    const missing = await call("/does-not-exist");
    expect(missing.status).toBe(404);
    expect(missing.type).toContain("application/json");
  });
});

async function createStudio(token: string, overrides: Record<string, unknown> = {}) {
  const created = await call("/studios", { method: "POST", token, body: { ...studioInput, ...overrides } });
  expect(created.status).toBe(201);
  return created.json?.data.id as string;
}

describe("studio discovery filters", () => {
  const city = "Filterton";
  let discoveryHost: string;

  beforeAll(async () => {
    discoveryHost = await tokenFor("discovery-host", "Dora Discovery");
    const location = (address: string) => ({ address, city });
    await createStudio(discoveryHost, { title: "Filterton Budget Photo Room", category: "photo-studio", hourlyRate: 30, maxCapacity: 3, location: location("1 Budget Road") });
    await createStudio(discoveryHost, { title: "Filterton Mid Music Suite", category: "music-suite", hourlyRate: 60, maxCapacity: 8, location: location("2 Middle Road") });
    await createStudio(discoveryHost, { title: "Filterton Grand Photo Hall", category: "photo-studio", hourlyRate: 90, maxCapacity: 12, location: location("3 Grand Road") });
  });

  const titlesFor = async (query: string) => {
    const result = await call(`/studios?city=${city}&${query}`);
    expect(result.status).toBe(200);
    return (result.json?.data as Array<{ title: string }>).map((item) => item.title);
  };

  it("matches the city exactly and ignores letter case", async () => {
    expect(await titlesFor("")).toHaveLength(3);
    const lower = await call("/studios?city=filterton");
    expect(lower.json?.meta.total).toBe(3);
    expect((await call("/studios?city=Filter")).json?.meta.total).toBe(0);
  });

  it("narrows results by category", async () => {
    expect(await titlesFor("category=music-suite")).toEqual(["Filterton Mid Music Suite"]);
    expect(await titlesFor("category=photo-studio")).toHaveLength(2);
    expect(await titlesFor("category=workshop")).toEqual([]);
  });
});

describe("studio price, capacity and sort", () => {
  const titles = async (query: string) => {
    const result = await call(`/studios?city=Filterton&${query}`);
    expect(result.status).toBe(200);
    return (result.json?.data as Array<{ title: string }>).map((item) => item.title);
  };

  it("keeps listings inside an inclusive price range", async () => {
    expect(await titles("minPrice=60&maxPrice=90")).toHaveLength(2);
    expect(await titles("maxPrice=29")).toEqual([]);
    expect(await titles("minPrice=91")).toEqual([]);
  });

  it("requires enough capacity for the whole group", async () => {
    expect(await titles("capacity=10")).toEqual(["Filterton Grand Photo Hall"]);
    expect(await titles("capacity=3")).toHaveLength(3);
  });

  it("sorts by price in both directions", async () => {
    expect(await titles("sort=price-asc")).toEqual(["Filterton Budget Photo Room", "Filterton Mid Music Suite", "Filterton Grand Photo Hall"]);
    expect(await titles("sort=price-desc")).toEqual(["Filterton Grand Photo Hall", "Filterton Mid Music Suite", "Filterton Budget Photo Room"]);
  });

  it("paginates and reports the total", async () => {
    const first = await call("/studios?city=Filterton&sort=price-asc&limit=2&page=1");
    const second = await call("/studios?city=Filterton&sort=price-asc&limit=2&page=2");
    expect(first.json?.data).toHaveLength(2);
    expect(second.json?.data).toHaveLength(1);
    expect(first.json?.meta).toMatchObject({ total: 3, page: 1, limit: 2, totalPages: 2 });
  });
});

describe("featured and owned studio lists", () => {
  it("returns the requested number of featured studios, best rated first", async () => {
    const result = await call("/studios/featured?limit=2");
    expect(result.status).toBe(200);
    const items = result.json?.data as Array<{ rating: number }>;
    expect(items).toHaveLength(2);
    expect(items[0]!.rating).toBeGreaterThanOrEqual(items[1]!.rating);
    expect((await call("/studios/featured?limit=50")).status).toBe(400);
  });

  it("lists only the caller's own studios, with the owner email visible to them", async () => {
    const mine = await call("/studios/mine", { token: await tokenFor("discovery-host", "Dora Discovery") });
    expect(mine.status).toBe(200);
    const items = mine.json?.data as Array<{ title: string; ownerEmail: string }>;
    expect(items).toHaveLength(3);
    expect(items.every((item) => item.ownerEmail === "discovery-host@example.com")).toBe(true);

    const stranger = await call("/studios/mine", { token: await tokenFor("nobody", "No Body") });
    expect(stranger.json?.data).toEqual([]);
    expect((await call("/studios/mine")).status).toBe(401);
  });

  it("offers the distinct city list for filters", async () => {
    const cities = (await call("/studios/cities")).json?.data as string[];
    expect(cities).toContain("Filterton");
    expect(new Set(cities).size).toBe(cities.length);
  });
});

describe("booking request validation", () => {
  let target: string;
  let validationHost: string;
  let validationGuest: string;

  beforeAll(async () => {
    validationHost = await tokenFor("validation-host", "Vera Validate");
    validationGuest = await tokenFor("validation-guest", "Vic Validate");
    target = await createStudio(validationHost, { title: "Validation Fixture Studio", maxCapacity: 4 });
  });

  const book = (body: object) => call("/bookings", { method: "POST", token: validationGuest, body: { studioId: target, guests: 2, note: "", ...body } });

  it("rejects sessions that are too short, too long or end before they start", async () => {
    expect((await book({ date: day, startTime: "10:00", endTime: "10:30" })).status).toBe(400);
    expect((await book({ date: day, startTime: "06:00", endTime: "20:00" })).status).toBe(400);
    expect((await book({ date: day, startTime: "12:00", endTime: "10:00" })).status).toBe(400);
  });

  it("rejects dates in the past and malformed dates or times", async () => {
    const past = new Date(Date.now() - 5 * 86_400_000).toISOString().slice(0, 10);
    expect((await book({ date: past, startTime: "10:00", endTime: "12:00" })).json?.message).toMatch(/past/i);
    expect((await book({ date: "2026-02-31", startTime: "10:00", endTime: "12:00" })).status).toBe(400);
    expect((await book({ date: day, startTime: "10:15", endTime: "12:00" })).status).toBe(400);
  });

  it("rejects unknown studios and notes that are too long", async () => {
    const missing = await call("/bookings", { method: "POST", token: validationGuest, body: { studioId: "64b000000000000000000009", date: day, startTime: "10:00", endTime: "12:00", guests: 1 } });
    expect(missing.status).toBe(404);
    expect((await book({ date: day, startTime: "10:00", endTime: "12:00", note: "x".repeat(501) })).status).toBe(400);
  });

  it("prices a booking from the hourly rate plus the refundable deposit", async () => {
    const created = await book({ date: day, startTime: "09:00", endTime: "11:30" });
    expect(created.status).toBe(201);
    expect(created.json?.data).toMatchObject({ status: "Pending", subtotal: 150, total: 250 });
  });
});

describe("host booking lifecycle", () => {
  it("walks a booking from Pending to Confirmed to Completed and then freezes it", async () => {
    const owner = await tokenFor("lifecycle-host", "Lena Lifecycle");
    const guest = await tokenFor("lifecycle-guest", "Leo Lifecycle");
    const studio = await createStudio(owner, { title: "Lifecycle Fixture Studio" });
    const created = await call("/bookings", { method: "POST", token: guest, body: { studioId: studio, ...slot("09:00", "11:00") } });
    const id = created.json?.data.id as string;
    const setStatus = (token: string, status: string) => call(`/bookings/${id}/status`, { method: "PATCH", token, body: { status } });

    // A guest may only cancel; completing is the host's call once the session is confirmed.
    expect((await setStatus(guest, "Completed")).status).toBe(409);
    expect((await setStatus(owner, "Completed")).status).toBe(409);

    expect((await setStatus(owner, "Confirmed")).json?.data.status).toBe("Confirmed");
    expect((await setStatus(guest, "Cancelled")).status).toBe(409);
    expect((await setStatus(owner, "Completed")).json?.data.status).toBe("Completed");

    expect((await setStatus(owner, "Cancelled")).status).toBe(409);
    expect((await setStatus(owner, "Confirmed")).status).toBe(409);
  });

  it("lets the host decline a pending request and shows it to both sides", async () => {
    const owner = await tokenFor("decline-host", "Dev Decline");
    const guest = await tokenFor("decline-guest", "Dee Decline");
    const studio = await createStudio(owner, { title: "Decline Fixture Studio" });
    const created = await call("/bookings", { method: "POST", token: guest, body: { studioId: studio, ...slot("14:00", "16:00") } });
    const id = created.json?.data.id as string;

    const hosted = await call("/bookings/hosted", { token: owner });
    expect((hosted.json?.data as Array<{ id: string }>).some((item) => item.id === id)).toBe(true);

    expect((await call(`/bookings/${id}/status`, { method: "PATCH", token: owner, body: { status: "Cancelled" } })).json?.data.status).toBe("Cancelled");
    const mine = await call("/bookings/mine", { token: guest });
    expect((mine.json?.data as Array<{ id: string; status: string }>).find((item) => item.id === id)?.status).toBe("Cancelled");
  });

  it("rejects status values outside the allowed set", async () => {
    const guest = await tokenFor("decline-guest", "Dee Decline");
    expect((await call("/bookings/64b000000000000000000001/status", { method: "PATCH", token: guest, body: { status: "Pending" } })).status).toBe(400);
    expect((await call("/bookings/64b000000000000000000001/status", { method: "PATCH", token: guest, body: { status: "Teleported" } })).status).toBe(400);
  });
});

describe("review rules", () => {
  let reviewStudio: string;
  let reviewOwner: string;
  let reviewer: string;

  beforeAll(async () => {
    reviewOwner = await tokenFor("review-owner", "Rae Owner");
    reviewer = await tokenFor("reviewer-1", "Rex Reviewer");
    reviewStudio = await createStudio(reviewOwner, { title: "Review Fixture Studio" });
  });

  const post = (token: string | undefined, body: object, studio = reviewStudio) => call(`/studios/${studio}/reviews`, { method: "POST", token, body });

  it("requires a login and a rating from 1 to 5 with a real comment", async () => {
    expect((await post(undefined, { rating: 5, comment: "Great place to record." })).status).toBe(401);
    expect((await post(reviewer, { rating: 0, comment: "Great place to record." })).status).toBe(400);
    expect((await post(reviewer, { rating: 6, comment: "Great place to record." })).status).toBe(400);
    expect((await post(reviewer, { rating: 4.5, comment: "Great place to record." })).status).toBe(400);
    expect((await post(reviewer, { rating: 5, comment: "short" })).status).toBe(400);
  });

  it("stops hosts reviewing their own studio and reviews of missing studios", async () => {
    expect((await post(reviewOwner, { rating: 5, comment: "My own place is the best." })).status).toBe(403);
    expect((await post(reviewer, { rating: 5, comment: "Great place to record." }, "64b000000000000000000008")).status).toBe(404);
  });

  it("averages ratings across reviewers and lets only the author delete", async () => {
    const first = await post(reviewer, { rating: 5, comment: "Spotless and well equipped." });
    const second = await post(await tokenFor("reviewer-2", "Ria Reviewer"), { rating: 2, comment: "Noisy during the afternoon." });
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);

    const studio = await call(`/studios/${reviewStudio}`);
    expect(studio.json?.data).toMatchObject({ rating: 3.5, reviewCount: 2 });

    const reviewId = second.json?.data.id as string;
    expect((await call(`/reviews/${reviewId}`, { method: "DELETE", token: reviewer })).status).toBe(404);
    expect((await call(`/reviews/${reviewId}`, { method: "DELETE", token: await tokenFor("reviewer-2", "Ria Reviewer") })).status).toBe(200);
    expect((await call(`/studios/${reviewStudio}`)).json?.data).toMatchObject({ rating: 5, reviewCount: 1 });
  });
});

describe("wishlist access", () => {
  it("requires authentication on every wishlist route", async () => {
    expect((await call("/wishlist")).status).toBe(401);
    expect((await call("/wishlist/ids")).status).toBe(401);
    expect((await call("/wishlist/64b000000000000000000001", { method: "PUT" })).status).toBe(401);
    expect((await call("/wishlist/64b000000000000000000001", { method: "DELETE" })).status).toBe(401);
  });

  it("refuses to save a studio that does not exist and keeps lists private per user", async () => {
    const saver = await tokenFor("saver-1", "Sam Saver");
    const other = await tokenFor("saver-2", "Sia Saver");
    expect((await call("/wishlist/64b000000000000000000007", { method: "PUT", token: saver })).status).toBe(404);

    const studio = await createStudio(await tokenFor("saver-host", "Sol Host"), { title: "Wishlist Fixture Studio" });
    expect((await call(`/wishlist/${studio}`, { method: "PUT", token: saver })).status).toBeLessThan(300);

    expect((await call("/wishlist/ids", { token: saver })).json?.data).toContain(studio);
    expect((await call("/wishlist/ids", { token: other })).json?.data).not.toContain(studio);
  });
});
