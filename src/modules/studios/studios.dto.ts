import type { StudioDoc } from "../../types/models.js";

/** Public representation: the host's email address is never exposed. */
export function toPublicStudio(doc: StudioDoc) {
  return {
    id: doc._id.toString(),
    title: doc.title,
    category: doc.category,
    hourlyRate: doc.hourlyRate,
    securityDeposit: doc.securityDeposit,
    maxCapacity: doc.maxCapacity,
    location: doc.location,
    image: doc.image,
    gallery: doc.gallery,
    amenities: doc.amenities,
    overview: doc.overview,
    host: { id: doc.ownerId, name: doc.ownerName, photo: doc.ownerPhoto },
    rating: doc.rating,
    reviewCount: doc.reviewCount,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

/** Owner representation, used only on endpoints scoped to the authenticated host. */
export function toOwnedStudio(doc: StudioDoc) {
  return { ...toPublicStudio(doc), ownerEmail: doc.ownerEmail };
}
