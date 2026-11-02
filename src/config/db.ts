import { MongoClient, type Collection, type Db } from "mongodb";
import { env } from "./env.js";
import type { BookingDoc, ReviewDoc, StudioDoc, SubscriberDoc, WishlistDoc } from "../types/models.js";

let client: MongoClient | undefined;
let db: Db | undefined;

export async function connectDatabase(): Promise<Db> {
  if (db) return db;
  client = new MongoClient(env.MONGODB_URI, { maxPoolSize: 20, serverSelectionTimeoutMS: 10_000 });
  await client.connect();
  db = client.db(env.MONGODB_DB);
  await ensureIndexes(db);
  return db;
}

export async function closeDatabase(): Promise<void> {
  await client?.close();
  client = undefined;
  db = undefined;
}

export function getClient(): MongoClient {
  if (!client) throw new Error("Database not connected");
  return client;
}

function getDb(): Db {
  if (!db) throw new Error("Database not connected");
  return db;
}

export const collections = {
  studios: (): Collection<StudioDoc> => getDb().collection<StudioDoc>("studios"),
  bookings: (): Collection<BookingDoc> => getDb().collection<BookingDoc>("bookings"),
  reviews: (): Collection<ReviewDoc> => getDb().collection<ReviewDoc>("reviews"),
  wishlists: (): Collection<WishlistDoc> => getDb().collection<WishlistDoc>("wishlists"),
  subscribers: (): Collection<SubscriberDoc> => getDb().collection<SubscriberDoc>("subscribers"),
};

async function ensureIndexes(database: Db): Promise<void> {
  await Promise.all([
    database.collection("studios").createIndexes([
      { key: { ownerId: 1, createdAt: -1 } },
      { key: { category: 1, rating: -1 } },
      { key: { hourlyRate: 1 } },
      { key: { createdAt: -1 } },
    ]),
    database.collection("bookings").createIndexes([
      { key: { userId: 1, createdAt: -1 } },
      { key: { hostId: 1, createdAt: -1 } },
      { key: { studioId: 1, status: 1, startAt: 1, endAt: 1 } },
    ]),
    database.collection("reviews").createIndexes([
      { key: { studioId: 1, createdAt: -1 } },
      { key: { studioId: 1, userId: 1 }, unique: true },
    ]),
    database.collection("subscribers").createIndexes([{ key: { email: 1 }, unique: true }]),
    database.collection("wishlists").createIndexes([
      { key: { userId: 1, studioId: 1 }, unique: true },
      { key: { userId: 1, createdAt: -1 } },
    ]),
  ]);
}
