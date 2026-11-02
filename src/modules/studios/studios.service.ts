import type { Filter, Sort } from "mongodb";
import { collections } from "../../config/db.js";
import type { AuthUser, StudioDoc } from "../../types/models.js";
import { ApiError } from "../../utils/ApiError.js";
import { escapeRegex } from "../../utils/escapeRegex.js";
import { toObjectId } from "../../utils/objectId.js";
import type { ListStudiosQuery, StudioInput } from "./studios.schema.js";

const SORTS: Record<ListStudiosQuery["sort"], Sort> = {
  newest: { createdAt: -1 },
  "top-rated": { rating: -1, reviewCount: -1, createdAt: -1 },
  "price-asc": { hourlyRate: 1, createdAt: -1 },
  "price-desc": { hourlyRate: -1, createdAt: -1 },
};

function buildFilter(query: ListStudiosQuery): Filter<StudioDoc> {
  const filter: Filter<StudioDoc> = {};

  if (query.category) filter.category = query.category;
  if (query.capacity) filter.maxCapacity = { $gte: query.capacity };
  if (query.minPrice !== undefined || query.maxPrice !== undefined) {
    filter.hourlyRate = {
      ...(query.minPrice !== undefined && { $gte: query.minPrice }),
      ...(query.maxPrice !== undefined && { $lte: query.maxPrice }),
    };
  }
  if (query.city) {
    filter["location.city"] = { $regex: `^${escapeRegex(query.city)}$`, $options: "i" };
  }
  if (query.q) {
    const pattern = { $regex: escapeRegex(query.q), $options: "i" };
    filter.$or = [
      { title: pattern },
      { overview: pattern },
      { "location.city": pattern },
      { "location.address": pattern },
      { amenities: pattern },
    ];
  }
  return filter;
}

export async function listStudios(query: ListStudiosQuery) {
  const filter = buildFilter(query);
  const [items, total] = await Promise.all([
    collections.studios()
      .find(filter)
      .sort(SORTS[query.sort])
      .skip((query.page - 1) * query.limit)
      .limit(query.limit)
      .toArray(),
    collections.studios().countDocuments(filter),
  ]);
  return { items, total };
}

export function listFeaturedStudios(limit: number) {
  return collections.studios()
    .find({})
    .sort({ rating: -1, reviewCount: -1, createdAt: -1 })
    .limit(limit)
    .toArray();
}

export async function listStudioCities(): Promise<string[]> {
  const cities = await collections.studios().distinct("location.city");
  return cities.filter((city): city is string => typeof city === "string").sort();
}

export function listStudiosByOwner(ownerId: string) {
  return collections.studios().find({ ownerId }).sort({ createdAt: -1 }).toArray();
}

export async function getStudioOrThrow(id: string): Promise<StudioDoc> {
  const studio = await collections.studios().findOne({ _id: toObjectId(id, "studio id") });
  if (!studio) throw ApiError.notFound("This studio could not be found");
  return studio;
}

export async function createStudio(user: AuthUser, input: StudioInput): Promise<StudioDoc> {
  const now = new Date();
  const doc: Omit<StudioDoc, "_id"> = {
    ...input,
    ownerId: user.id,
    ownerEmail: user.email,
    ownerName: user.name,
    ownerPhoto: user.image,
    rating: 0,
    reviewCount: 0,
    bookingVersion: 0,
    createdAt: now,
    updatedAt: now,
  };
  const { insertedId } = await collections.studios().insertOne(doc as StudioDoc);
  return { ...doc, _id: insertedId };
}

export async function updateStudio(user: AuthUser, id: string, input: StudioInput): Promise<StudioDoc> {
  const existing = await getStudioOrThrow(id);
  if (existing.ownerId !== user.id) throw ApiError.forbidden("Only the host can edit this studio");

  const updated = await collections.studios().findOneAndUpdate(
    { _id: existing._id, ownerId: user.id },
    {
      $set: {
        ...input,
        ownerName: user.name || existing.ownerName,
        ownerPhoto: user.image || existing.ownerPhoto,
        updatedAt: new Date(),
      },
    },
    { returnDocument: "after" },
  );
  if (!updated) throw ApiError.notFound("This studio could not be found");
  return updated;
}

export async function deleteStudio(user: AuthUser, id: string): Promise<void> {
  const existing = await getStudioOrThrow(id);
  if (existing.ownerId !== user.id) throw ApiError.forbidden("Only the host can delete this studio");

  const deleted = await collections.studios().deleteOne({ _id: existing._id, ownerId: user.id });
  if (deleted.deletedCount === 0) throw ApiError.notFound("This studio could not be found");

  const now = new Date();
  await Promise.all([
    collections.reviews().deleteMany({ studioId: existing._id }),
    collections.wishlists().deleteMany({ studioId: existing._id }),
    collections.bookings().updateMany(
      { studioId: existing._id, status: { $in: ["Pending", "Confirmed"] } },
      { $set: { status: "Cancelled", updatedAt: now } },
    ),
  ]);
}
