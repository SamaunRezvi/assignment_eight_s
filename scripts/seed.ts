/**
 * Populates the database with realistic demo studios and reviews.
 * Safe to re-run: it only replaces documents owned by the synthetic "seed-" accounts.
 */
import { ObjectId } from "mongodb";
import { closeDatabase, collections, connectDatabase } from "../src/config/db.js";
import type { ReviewDoc, StudioCategory, StudioDoc } from "../src/types/models.js";

const photo = (id: string) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=1400&q=80`;

const IMAGES = {
  photo: ["1527011046414-4781f1f94f8c", "1581591524425-c7e0978865fc", "1516035069371-29a1b244cc32"],
  film: ["1485846234645-a62644f84728", "1574267432553-4b4628081c31", "1536440136628-849c177e76a1"],
  podcast: ["1478737270239-2f02b77fc618", "1590602847861-f357a9332bbc", "1598653222000-6b7b7a552625"],
  music: ["1598488035139-bdbb2231ce04", "1519892300165-cb5542fb47c7", "1520523839897-bd0b52f945a0", "1471478331149-c72f17e33c73"],
  workshop: ["1460661419201-fd4cecdf8a8b", "1513364776144-60967b0f800f", "1558618666-fcd25c85cd64"],
} as const;

const HOSTS = [
  { id: "seed-host-maya", name: "Maya Fernandez", email: "maya.fernandez@studiospace.demo" },
  { id: "seed-host-jonas", name: "Jonas Whitfield", email: "jonas.whitfield@studiospace.demo" },
  { id: "seed-host-priya", name: "Priya Raman", email: "priya.raman@studiospace.demo" },
] as const;

interface SeedStudio {
  title: string;
  category: StudioCategory;
  hourlyRate: number;
  securityDeposit: number;
  maxCapacity: number;
  address: string;
  city: string;
  images: readonly string[];
  amenities: string[];
  overview: string;
  host: 0 | 1 | 2;
  reviews: Array<[name: string, rating: number, comment: string]>;
}

const STUDIOS: SeedStudio[] = [
  {
    title: "Northlight Cyclorama Studio",
    category: "photo-studio",
    hourlyRate: 65,
    securityDeposit: 150,
    maxCapacity: 12,
    address: "214 Mercer Street, Unit 3",
    city: "New York",
    images: IMAGES.photo,
    amenities: ["Infinity cyc wall", "Profoto strobes", "Seamless paper rolls", "Makeup station", "Fast Wi-Fi", "Tethering station"],
    overview:
      "A bright 1,800 sq ft white cyclorama studio with floor-to-ceiling north-facing windows, built for fashion, e-commerce and portrait work. Four Profoto heads, a full modifier kit and a dedicated tethering station are included in the hourly rate, and the freight elevator makes load-in painless.",
    host: 0,
    reviews: [
      ["Elena Brooks", 5, "Spotless cyc and the strobes were already dialed in. We shot a full lookbook in four hours without a single hiccup."],
      ["Tom Alvarez", 4, "Great natural light and an easy load-in. The makeup station was a lifesaver for our team of six."],
      ["Hana Sato", 5, "Honestly the cleanest cyclorama I have rented in the city. The host replied within minutes."],
    ],
  },
  {
    title: "Golden Hour Loft",
    category: "photo-studio",
    hourlyRate: 48,
    securityDeposit: 100,
    maxCapacity: 8,
    address: "88 Alameda Avenue",
    city: "Los Angeles",
    images: [IMAGES.photo[1], IMAGES.photo[0], IMAGES.photo[2]],
    amenities: ["Natural light", "Props closet", "Backdrop stands", "Changing room", "Parking"],
    overview:
      "A warm, plant-filled loft with west-facing windows that glow from mid-afternoon onward. Ideal for lifestyle portraits, brand campaigns and content days. A curated props closet with vintage furniture and linen backdrops is open to every booking.",
    host: 1,
    reviews: [
      ["Marcus Lee", 5, "The light after 4 pm is unreal. Our client loved the vintage props and we wrapped early."],
      ["Isla Novak", 4, "Cozy, clean and very well equipped for the price. Parking right outside was a bonus."],
    ],
  },
  {
    title: "Stage 7 Sound & Cinema Stage",
    category: "film-stage",
    hourlyRate: 140,
    securityDeposit: 500,
    maxCapacity: 40,
    address: "1200 Burbank Boulevard",
    city: "Los Angeles",
    images: IMAGES.film,
    amenities: ["Soundproofed stage", "Green screen", "Grip & lighting package", "Power distribution", "Green room", "Loading dock"],
    overview:
      "A 4,500 sq ft soundproofed stage with a 16-foot grid, a permanent green screen wall and three-phase power on tap. Built for commercials, short films and music videos, with a green room, catering area and direct loading dock access.",
    host: 1,
    reviews: [
      ["Dara Okafor", 5, "Quiet, spacious and the grip package saved us a rental. Our two-day commercial shoot ran perfectly."],
      ["Lucas Meyer", 5, "Power distribution and dock access made load-in effortless. Will book again for our next short."],
      ["Sofia Marin", 4, "Excellent stage. The only thing I would add is more seating in the green room."],
    ],
  },
  {
    title: "The Screening Room",
    category: "film-stage",
    hourlyRate: 90,
    securityDeposit: 250,
    maxCapacity: 60,
    address: "17 Gower Place",
    city: "London",
    images: [IMAGES.film[1], IMAGES.film[2], IMAGES.film[0]],
    amenities: ["4K laser projector", "Dolby 7.1 sound", "Tiered seating", "Green room", "Blackout curtains"],
    overview:
      "A restored 60-seat cinema with a 4K laser projector and Dolby 7.1 sound. Perfect for private premieres, dailies reviews, table reads and shooting cinema interiors, with blackout curtains and a quiet foyer for interviews.",
    host: 2,
    reviews: [
      ["Oliver Grant", 5, "We held our short film premiere here. Sound and picture were flawless and the team handled everything."],
      ["Amara Diallo", 4, "Beautiful room. Great for a client screening and a cast Q&A afterwards."],
    ],
  },
  {
    title: "Echo Podcast Lounge",
    category: "podcast-lounge",
    hourlyRate: 35,
    securityDeposit: 60,
    maxCapacity: 5,
    address: "402 Pine Street, Suite 12",
    city: "Seattle",
    images: IMAGES.podcast,
    amenities: ["4 Shure SM7B mics", "Rodecaster Pro", "Acoustic treatment", "Video recording", "Free coffee", "Fast Wi-Fi"],
    overview:
      "A cozy treated lounge for up to five guests, wired with four Shure SM7B microphones and a Rodecaster Pro. Two 4K cameras are set up for video episodes, and an on-site engineer can be added for a flat fee.",
    host: 2,
    reviews: [
      ["Noah Bennett", 5, "Plug in, hit record. The room sounds incredible and the camera setup made our video episode look professional."],
      ["Chloe Park", 5, "Comfortable seating, great mics, and the host left a thoughtful snack basket."],
      ["Ravi Menon", 4, "Perfect for a weekly show. Booking the same slot each week was very easy."],
    ],
  },
  {
    title: "Quiet Room Audio Booth",
    category: "podcast-lounge",
    hourlyRate: 28,
    securityDeposit: 50,
    maxCapacity: 3,
    address: "9 Canal Street",
    city: "Austin",
    images: [IMAGES.podcast[2], IMAGES.podcast[1], IMAGES.podcast[0]],
    amenities: ["Isolation booth", "Neumann TLM 103", "Audio interface", "Headphone amps", "Voice-over script stand"],
    overview:
      "A compact, fully isolated booth tuned for voice-over, audiobooks and solo podcasts. A Neumann TLM 103, a pro interface and individual headphone mixes are ready when you arrive.",
    host: 0,
    reviews: [
      ["Grace Holloway", 5, "Dead-silent booth and the Neumann is a dream for voice-over. I recorded a full audiobook chapter in one sitting."],
      ["Ethan Cole", 4, "Tight but comfortable. Great value for solo recordings."],
    ],
  },
  {
    title: "Analog Dreams Recording Suite",
    category: "music-suite",
    hourlyRate: 85,
    securityDeposit: 200,
    maxCapacity: 10,
    address: "55 Music Row",
    city: "Nashville",
    images: IMAGES.music,
    amenities: ["SSL console", "Live room", "Vintage outboard gear", "Drum kit", "Grand piano", "Engineer on request"],
    overview:
      "A full-service recording suite built around an SSL console, a spacious live room and a curated collection of vintage microphones and outboard gear. A Yamaha grand piano and a tuned drum kit are included, and an in-house engineer can run the session.",
    host: 1,
    reviews: [
      ["Jake Morrison", 5, "Tracked a five-piece band live in one day. The live room sounds huge and the console is a joy."],
      ["Lena Fischer", 5, "The piano is beautifully maintained and the engineer was patient and creative."],
      ["Diego Alvarado", 4, "Fantastic gear and atmosphere. Book early, weekends fill up quickly."],
    ],
  },
  {
    title: "Beatmaker's Den",
    category: "music-suite",
    hourlyRate: 42,
    securityDeposit: 80,
    maxCapacity: 4,
    address: "73 Hawthorne Lane",
    city: "Chicago",
    images: [IMAGES.music[2], IMAGES.music[0], IMAGES.music[3]],
    amenities: ["Studio monitors", "MIDI controllers", "Vocal booth", "Synth collection", "Acoustic panels"],
    overview:
      "A producer-focused suite with calibrated monitors, a wall of synths, MIDI controllers and a small vocal booth. Designed for writing sessions, beat making and mixing in a distraction-free space.",
    host: 2,
    reviews: [
      ["Zara Khan", 5, "The monitoring is honest and the synth wall is inspiring. I finished two tracks in a single session."],
      ["Miles Turner", 4, "Great vibe, solid gear. The vocal booth is a bit snug but sounds clean."],
    ],
  },
  {
    title: "Rehearsal Hall Nine",
    category: "music-suite",
    hourlyRate: 30,
    securityDeposit: 60,
    maxCapacity: 8,
    address: "301 Industrial Way",
    city: "Portland",
    images: [IMAGES.music[1], IMAGES.music[3], IMAGES.music[0]],
    amenities: ["Full backline", "PA system", "Drum kit", "Air conditioning", "Street parking"],
    overview:
      "A spacious, air-conditioned rehearsal room with a full backline, PA and drum kit included. Great for band practice, showcase run-throughs and live-stream rehearsals.",
    host: 0,
    reviews: [
      ["Ruby Sanders", 4, "Big room, loud and clear PA, and the backline was in good shape. Perfect for our rehearsal week."],
      ["Andre Williams", 5, "Cheap, clean and professional. Our drummer was thrilled with the kit."],
    ],
  },
  {
    title: "Palette & Clay Art Workshop",
    category: "workshop",
    hourlyRate: 32,
    securityDeposit: 75,
    maxCapacity: 14,
    address: "26 Gallery Walk",
    city: "San Francisco",
    images: IMAGES.workshop,
    amenities: ["Easels", "Pottery wheels", "Kiln access", "Washing station", "North light", "Storage lockers"],
    overview:
      "A bright, well-ventilated art workshop with north light, a full set of easels, two pottery wheels and kiln access. Popular for classes, painting retreats and small-batch ceramics.",
    host: 1,
    reviews: [
      ["Nina Rossi", 5, "Hosted a ceramics class here. The wheels, kiln and storage lockers made it easy to run."],
      ["Paul Henderson", 4, "Lovely light and plenty of space. Cleanup station was a nice touch."],
    ],
  },
  {
    title: "Forge & Timber Maker Space",
    category: "workshop",
    hourlyRate: 38,
    securityDeposit: 120,
    maxCapacity: 10,
    address: "140 Dockside Road",
    city: "Brooklyn",
    images: [IMAGES.workshop[2], IMAGES.workshop[0], IMAGES.workshop[1]],
    amenities: ["Woodworking bench", "Lathe", "Band saw", "Dust extraction", "Safety gear", "Hand tools"],
    overview:
      "A fully equipped woodworking and prop-building workshop with a lathe, band saw, dust extraction and a full set of hand tools. A safety briefing and protective gear are included with every booking.",
    host: 2,
    reviews: [
      ["Victor Haas", 5, "We built props for a short film here. The lathe and dust extraction are top notch."],
      ["Mei Lin", 4, "Well maintained and the safety briefing was thorough. Plenty of bench space."],
    ],
  },
  {
    title: "Daylight Product Studio",
    category: "photo-studio",
    hourlyRate: 55,
    securityDeposit: 120,
    maxCapacity: 6,
    address: "12 Riverside Drive",
    city: "Miami",
    images: [IMAGES.photo[2], IMAGES.photo[1], IMAGES.photo[0]],
    amenities: ["Tabletop sets", "Continuous lights", "Light tent", "Reflectors", "Steamer"],
    overview:
      "A compact studio tuned for product and still-life photography, with tabletop sets, continuous lighting, light tents and a garment steamer on site. Daylight pours in from a large east window for clean, natural looks.",
    host: 0,
    reviews: [
      ["Tara Collins", 5, "Perfect for our skincare launch. Everything we needed was already set up and the light is lovely."],
      ["Ben Foster", 4, "Compact but smart. We shot 60 SKUs in one afternoon."],
    ],
  },
];

async function main() {
  await connectDatabase();
  const studios = collections.studios();
  const reviews = collections.reviews();

  const previous = await studios.find({ ownerId: { $in: HOSTS.map((host) => host.id) } }, { projection: { _id: 1 } }).toArray();
  if (previous.length > 0) {
    const ids = previous.map((studio) => studio._id);
    await Promise.all([
      reviews.deleteMany({ studioId: { $in: ids } }),
      collections.wishlists().deleteMany({ studioId: { $in: ids } }),
      collections.bookings().deleteMany({ studioId: { $in: ids } }),
      studios.deleteMany({ _id: { $in: ids } }),
    ]);
  }

  const now = Date.now();
  const studioDocs: StudioDoc[] = [];
  const reviewDocs: ReviewDoc[] = [];

  STUDIOS.forEach((seed, index) => {
    const host = HOSTS[seed.host];
    const [cover = "", ...rest] = seed.images.map(photo);
    const average = seed.reviews.reduce((sum, [, rating]) => sum + rating, 0) / seed.reviews.length;
    const createdAt = new Date(now - (STUDIOS.length - index) * 36 * 60 * 60 * 1000);
    const _id = new ObjectId();

    studioDocs.push({
      _id,
      title: seed.title,
      category: seed.category,
      hourlyRate: seed.hourlyRate,
      securityDeposit: seed.securityDeposit,
      maxCapacity: seed.maxCapacity,
      location: { address: seed.address, city: seed.city },
      image: cover,
      gallery: rest,
      amenities: seed.amenities,
      overview: seed.overview,
      ownerId: host.id,
      ownerEmail: host.email,
      ownerName: host.name,
      ownerPhoto: "",
      rating: Math.round(average * 10) / 10,
      reviewCount: seed.reviews.length,
      bookingVersion: 0,
      createdAt,
      updatedAt: createdAt,
    });

    seed.reviews.forEach(([name, rating, comment], reviewIndex) => {
      reviewDocs.push({
        _id: new ObjectId(),
        studioId: _id,
        userId: `seed-reviewer-${index}-${reviewIndex}`,
        userName: name,
        userPhoto: "",
        rating,
        comment,
        createdAt: new Date(createdAt.getTime() + (reviewIndex + 1) * 6 * 60 * 60 * 1000),
      });
    });
  });

  await studios.insertMany(studioDocs);
  await reviews.insertMany(reviewDocs);
  console.info(`Seeded ${studioDocs.length} studios and ${reviewDocs.length} reviews.`);
}

main()
  .catch((error) => {
    console.error("Seeding failed:", error);
    process.exitCode = 1;
  })
  .finally(closeDatabase);
