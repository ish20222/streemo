import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function HomePage() {
  const user = await getSessionUser();
  if (user) redirect("/devices");

  const userCount = await prisma.user.count().catch(() => 0);
  if (userCount === 0) redirect("/setup");
  redirect("/login");
}
