import Link from "next/link";
import { redirect } from "next/navigation";
import { clearSessionCookie, getSessionUser } from "@/lib/auth";

const nav = [
  { href: "/devices", label: "Devices" },
  { href: "/library", label: "Library" },
  { href: "/queues", label: "Queues" },
  { href: "/live", label: "Live" },
];

async function logoutAction() {
  "use server";
  await clearSessionCookie();
  redirect("/login");
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  return (
    <div className="min-h-full flex flex-col md:flex-row">
      <aside className="md:w-56 border-b md:border-b-0 md:border-r border-[var(--border)] bg-[var(--bg-elevated)]/80 backdrop-blur p-4 md:min-h-screen flex md:flex-col gap-4">
        <div>
          <Link
            href="/devices"
            className="text-xl font-bold tracking-tight"
            style={{ fontFamily: "var(--font-syne), sans-serif" }}
          >
            Streemo
          </Link>
          <p className="text-xs text-[var(--muted)] mt-0.5 truncate">{user.email}</p>
        </div>
        <nav className="flex md:flex-col gap-1 flex-1 overflow-x-auto">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="px-3 py-2 rounded-lg text-sm text-[var(--muted)] hover:bg-[var(--bg-soft)] hover:text-[var(--fg)] whitespace-nowrap"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <form action={logoutAction}>
          <button className="btn w-full text-sm" type="submit">
            Sign out
          </button>
        </form>
      </aside>
      <main className="flex-1 p-4 md:p-8 max-w-6xl w-full mx-auto">{children}</main>
    </div>
  );
}
