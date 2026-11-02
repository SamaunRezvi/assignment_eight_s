# StudioSpace API

REST API for **StudioSpace**, a peer-to-peer marketplace where creators rent photo studios, film stages, podcast lounges, music suites and art workshops.

- Client repository: https://github.com/SamaunRezvi/assignment_eight_c
- API base path: `/api`

## Highlights

- **Studios CRUD** with search, category/city/price/capacity filters, sorting and pagination
- **HTTPOnly-cookie JWT** authentication; every mutation answers `401 Unauthorized` without a valid token
- **Double-booking prevention**: a booking is rejected when it overlaps a *Confirmed* slot; checks run inside a MongoDB transaction so concurrent requests cannot race
- **Booking lifecycle** (Pending → Confirmed → Completed / Cancelled) with host and guest permissions
- **PDF invoices** for confirmed bookings
- **Reviews** with automatic rating aggregation, **wishlist**, and a **dashboard summary** built with aggregation pipelines
- **Image upload proxy** (imgbb) with real file-signature checks and size limits

## Tech stack

Node.js 20+, Express 5, TypeScript, MongoDB (native driver), Zod, jose (JWT), Helmet, express-rate-limit, PDFKit, Vitest.

## Project structure

```
src/
  config/        environment validation, database connection and indexes
  middleware/    authentication, CSRF origin guard, rate limiting, error handling
  modules/       feature modules: studios, bookings, reviews, wishlist, dashboard, uploads
  types/         shared domain types
  utils/         ApiError, ObjectId parsing, regex escaping, response helpers
scripts/seed.ts  demo data
tests/           unit tests
```

Each module keeps its schema (validation), service (business logic), controller and routes separate.

## Local setup

```bash
git clone https://github.com/SamaunRezvi/assignment_eight_s.git
cd assignment_eight_s
npm install
cp .env.example .env     # then fill in the values
npm run seed             # optional: load demo studios and reviews
npm run dev              # http://localhost:5000
```

| Variable | Purpose |
| --- | --- |
| `MONGODB_URI`, `MONGODB_DB` | MongoDB Atlas connection (must be a replica set so transactions work) |
| `CLIENT_ORIGIN` | Allowed browser origin(s) for CORS and CSRF checks |
| `JWT_SECRET` | Shared HS256 secret (32+ chars) used to verify the auth cookie |
| `AUTH_COOKIE_NAME` | Name of the HTTPOnly cookie that carries the JWT |
| `IMGBB_API_KEY` | Enables `POST /api/uploads` |

Scripts: `npm run dev`, `npm run build`, `npm start`, `npm run lint`, `npm run typecheck`, `npm test`.

## Endpoints

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/api/health` | – | Liveness check |
| GET | `/api/studios` | – | List with `q`, `category`, `city`, `minPrice`, `maxPrice`, `capacity`, `sort`, `page`, `limit` |
| GET | `/api/studios/featured` | – | Top-rated studios (`limit`, default 6) |
| GET | `/api/studios/cities` | – | Distinct cities for filters |
| GET | `/api/studios/:id` | – | Studio details |
| GET | `/api/studios/mine` | ✔ | Studios owned by the current user |
| POST | `/api/studios` | ✔ | Create a studio |
| PUT | `/api/studios/:id` | ✔ owner | Update a studio |
| DELETE | `/api/studios/:id` | ✔ owner | Delete a studio (cancels open bookings) |
| GET | `/api/studios/:id/reviews` | – | List reviews |
| POST | `/api/studios/:id/reviews` | ✔ | Add a review (one per user) |
| DELETE | `/api/reviews/:id` | ✔ author | Remove a review |
| GET | `/api/bookings/availability?studioId=&date=` | – | Confirmed slots for a day |
| POST | `/api/bookings` | ✔ | Request a booking (status `Pending`) |
| GET | `/api/bookings/mine` | ✔ | Bookings made by the current user |
| GET | `/api/bookings/hosted` | ✔ | Booking requests for the user's studios |
| PATCH | `/api/bookings/:id/status` | ✔ | Confirm, complete or cancel (rules by role) |
| GET | `/api/bookings/:id/invoice` | ✔ | PDF invoice for confirmed/completed bookings |
| GET | `/api/wishlist` · `/api/wishlist/ids` | ✔ | Saved studios |
| PUT / DELETE | `/api/wishlist/:studioId` | ✔ | Save / remove a studio |
| GET | `/api/dashboard/summary` | ✔ | Host and guest statistics |
| POST | `/api/uploads` | ✔ | Upload an image (multipart field `image`) |

## Security notes

- JWT is read only from an HTTPOnly cookie and verified with a pinned algorithm, issuer and audience.
- Owner identity always comes from the verified token, never from the request body.
- Unsafe methods must come from an allow-listed `Origin` (CSRF defence).
- All input is validated with Zod; search text is regex-escaped; request bodies are size-limited.
- Helmet headers, global and per-route rate limits, and generic error messages in production.
- The host's email is never returned from public endpoints.
