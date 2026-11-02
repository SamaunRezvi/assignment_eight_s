import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(5000),
  MONGODB_URI: z.string().min(1, "MONGODB_URI is required"),
  MONGODB_DB: z.string().min(1).default("studiospace"),
  CLIENT_ORIGIN: z
    .string()
    .min(1, "CLIENT_ORIGIN is required")
    .transform((value) =>
      value
        .split(",")
        .map((origin) => origin.trim().replace(/\/$/, ""))
        .filter(Boolean),
    ),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  AUTH_COOKIE_NAME: z.string().min(1).default("studiospace_token"),
  IMGBB_API_KEY: z.string().optional().default(""),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`);
  console.error(`Invalid environment configuration:\n${issues.join("\n")}`);
  process.exit(1);
}

export const env = parsed.data;
export const isProduction = env.NODE_ENV === "production";
