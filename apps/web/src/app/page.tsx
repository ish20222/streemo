import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { connectMongo } from "@/lib/db";
import { User } from "@/lib/models";

export default async function HomePage() {
  const user = await getSessionUser();
  if (user) redirect("/devices");

  try {
    await connectMongo();
    const userCount = await User.countDocuments();
    if (userCount === 0) redirect("/setup");
  } catch {
    redirect("/setup");
  }
  redirect("/login");
}
