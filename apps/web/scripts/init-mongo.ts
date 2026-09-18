import mongoose from "mongoose";

async function tryConnect(uri: string, label: string) {
  console.log(`Trying ${label}:`, uri.replace(/:[^:@]+@/, ":****@"));
  await mongoose.connect(uri, {
    dbName: "streemo",
    serverSelectionTimeoutMS: 15000,
  });
  const db = mongoose.connection.db;
  if (!db) throw new Error("No db");
  console.log("Connected. database =", db.databaseName);
  await db.command({ ping: 1 });
  await db.collection("_streemo_meta").updateOne(
    { _id: "bootstrap" as any },
    { $set: { createdAt: new Date(), app: "streemo" } },
    { upsert: true }
  );
  const cols = await db.listCollections().toArray();
  console.log(
    "Collections:",
    cols.map((c) => c.name)
  );
  console.log("Database 'streemo' is ready");
  await mongoose.disconnect();
}

async function main() {
  const uris = [
    process.env.MONGODB_URI ||
      "mongodb://ishananuradha:aezakmi%2540123@95.211.164.164:27017/streemo",
    "mongodb://ishananuradha:aezakmi%40123@95.211.164.164:27017/streemo",
    "mongodb://ishananuradha:aezakmi%40123@95.211.164.164:27017/streemo?authSource=admin",
    "mongodb://ishananuradha:aezakmi%2540123@95.211.164.164:27017/streemo?authSource=admin",
  ];
  let lastErr: unknown;
  for (const uri of uris) {
    try {
      await tryConnect(uri, "candidate");
      return;
    } catch (e) {
      lastErr = e;
      console.error("Failed:", (e as Error).message);
      try {
        await mongoose.disconnect();
      } catch {
        /* */
      }
    }
  }
  console.error("All connection attempts failed", lastErr);
  process.exit(1);
}

main();
