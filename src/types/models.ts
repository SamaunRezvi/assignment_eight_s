import type { ObjectId } from "mongodb";

export const STUDIO_CATEGORIES = [
  "photo-studio",
  "film-stage",
  "podcast-lounge",
  "music-suite",
  "workshop",
] as const;
export type StudioCategory = (typeof STUDIO_CATEGORIES)[number];

export const BOOKING_STATUSES = ["Pending", "Confirmed", "Completed", "Cancelled"] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export interface StudioDoc {
  _id: ObjectId;
  title: string;
  category: StudioCategory;
  hourlyRate: number;
  securityDeposit: number;
  maxCapacity: number;
  location: { address: string; city: string };
  image: string;
  gallery: string[];
  amenities: string[];
  overview: string;
  ownerId: string;
  ownerEmail: string;
  ownerName: string;
  ownerPhoto: string;
  rating: number;
  reviewCount: number;
  bookingVersion: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface BookingDoc {
  _id: ObjectId;
  studioId: ObjectId;
  studioTitle: string;
  studioImage: string;
  studioLocation: string;
  hostId: string;
  hostEmail: string;
  userId: string;
  userEmail: string;
  userName: string;
  date: string;
  startTime: string;
  endTime: string;
  startAt: Date;
  endAt: Date;
  hours: number;
  guests: number;
  hourlyRate: number;
  subtotal: number;
  securityDeposit: number;
  total: number;
  note: string;
  status: BookingStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface ReviewDoc {
  _id: ObjectId;
  studioId: ObjectId;
  userId: string;
  userName: string;
  userPhoto: string;
  rating: number;
  comment: string;
  createdAt: Date;
}

export interface WishlistDoc {
  _id: ObjectId;
  userId: string;
  studioId: ObjectId;
  createdAt: Date;
}

export interface SubscriberDoc {
  _id: ObjectId;
  email: string;
  createdAt: Date;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  image: string;
}
