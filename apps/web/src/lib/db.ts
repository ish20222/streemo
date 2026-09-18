import { config } from "dotenv";
import path from "path";
import mongoose from "mongoose";

// Load apps/web/.env for scripts and custom server
config({ path: path.join(process.cwd(), ".env") });

const globalForMongo = globalThis as unknown as {
  mongooseConn?: typeof mongoose;
  mongoosePromise?: Promise<typeof mongoose>;
};

function mongoUri() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set");
  // Ensure database name is streemo
  if (uri.includes("/streemo")) return uri;
  // Insert /streemo before query string
  const q = uri.indexOf("?");
  if (q >= 0) {
    const base = uri.slice(0, q).replace(/\/$/, "");
    return `${base}/streemo${uri.slice(q)}`;
  }
  return `${uri.replace(/\/$/, "")}/streemo`;
}

export async function connectMongo() {
  if (globalForMongo.mongooseConn?.connection?.readyState === 1) {
    return globalForMongo.mongooseConn;
  }
  if (!globalForMongo.mongoosePromise) {
    mongoose.set("strictQuery", true);
    const uri = mongoUri();
    globalForMongo.mongoosePromise = mongoose.connect(uri, {
      dbName: "streemo",
    });
  }
  globalForMongo.mongooseConn = await globalForMongo.mongoosePromise;
  return globalForMongo.mongooseConn;
}

export { mongoose };
