import { ObjectId } from "mongodb";
import { ApiError } from "./ApiError.js";

const OBJECT_ID_PATTERN = /^[0-9a-fA-F]{24}$/;

export function toObjectId(value: string, label = "id"): ObjectId {
  if (!OBJECT_ID_PATTERN.test(value)) {
    throw ApiError.badRequest(`Invalid ${label}`);
  }
  return new ObjectId(value);
}
