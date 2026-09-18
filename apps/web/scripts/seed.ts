import bcrypt from "bcryptjs";
import { connectMongo } from "../src/lib/db";
import { User } from "../src/lib/models";

async function main() {
  await connectMongo();
  const email = process.env.SEED_EMAIL || "admin@streemo.local";
  const password = process.env.SEED_PASSWORD || "admin123";
  const hash = await bcrypt.hash(password, 10);

  await User.findOneAndUpdate(
    { email },
    {
      $setOnInsert: {
        email,
        passwordHash: hash,
        name: "Admin",
      },
    },
    { upsert: true, new: true }
  );

  console.log(`Seeded user ${email} / ${password} in database streemo`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    const { mongoose } = await import("../src/lib/db");
    await mongoose.disconnect();
  });
