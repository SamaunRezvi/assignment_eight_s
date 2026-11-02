import { MongoServerError, type ObjectId } from "mongodb";
import { z } from "zod";
import { collections } from "../../config/db.js";
import type { AuthUser, ReviewDoc } from "../../types/models.js";
import { ApiError } from "../../utils/ApiError.js";
import { toObjectId } from "../../utils/objectId.js";

export const reviewInputSchema = z.object({
  rating: z.coerce.number().int().min(1, "Choose a rating from 1 to 5").max(5, "Choose a rating from 1 to 5"),
  comment: z.string().trim().min(10, "Tell us a bit more (at least 10 characters)").max(1000),
});
export type ReviewInput = z.infer<typeof reviewInputSchema>;

export function toReviewDto(doc: ReviewDoc) {
  return {
    id: doc._id.toString(),
    studioId: doc.studioId.toString(),
    userId: doc.userId,
    userName: doc.userName,
    userPhoto: doc.userPhoto,
    rating: doc.rating,
    comment: doc.comment,
    createdAt: doc.createdAt,
  };
}

async function refreshStudioRating(studioId: ObjectId) {
  const [stats] = await collections.reviews()
    .aggregate<{ average: number; count: number }>([
      { $match: { studioId } },
      { $group: { _id: null, average: { $avg: "$rating" }, count: { $sum: 1 } } },
    ])
    .toArray();

  await collections.studios().updateOne(
    { _id: studioId },
    { $set: { rating: stats ? Math.round(stats.average * 10) / 10 : 0, reviewCount: stats?.count ?? 0 } },
  );
}

export function listReviews(studioId: string) {
  return collections.reviews()
    .find({ studioId: toObjectId(studioId, "studio id") })
    .sort({ createdAt: -1 })
    .limit(100)
    .toArray();
}

export async function createReview(user: AuthUser, studioId: string, input: ReviewInput): Promise<ReviewDoc> {
  const id = toObjectId(studioId, "studio id");
  const studio = await collections.studios().findOne({ _id: id }, { projection: { ownerId: 1 } });
  if (!studio) throw ApiError.notFound("This studio could not be found");
  if (studio.ownerId === user.id) throw ApiError.forbidden("You cannot review your own studio");

  const doc: Omit<ReviewDoc, "_id"> = {
    studioId: id,
    userId: user.id,
    userName: user.name || "StudioSpace member",
    userPhoto: user.image,
    rating: input.rating,
    comment: input.comment,
    createdAt: new Date(),
  };

  try {
    const { insertedId } = await collections.reviews().insertOne(doc as ReviewDoc);
    await refreshStudioRating(id);
    return { ...doc, _id: insertedId };
  } catch (error) {
    if (error instanceof MongoServerError && error.code === 11000) {
      throw ApiError.conflict("You have already reviewed this studio");
    }
    throw error;
  }
}

export async function deleteReview(user: AuthUser, reviewId: string): Promise<void> {
  const review = await collections.reviews().findOneAndDelete({
    _id: toObjectId(reviewId, "review id"),
    userId: user.id,
  });
  if (!review) throw ApiError.notFound("This review could not be found");
  await refreshStudioRating(review.studioId);
}
