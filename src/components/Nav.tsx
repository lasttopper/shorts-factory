"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Clapperboard, LayoutDashboard, LogOut, Settings2, Users } from "lucide-react";

export default function Nav({ user }: { user?: { name: string; email: string } | null }) {
  const pathname = usePathname();
  const router = useRouter();
  const links = [
    { href: "/", label: "Control Room", icon: LayoutDashboard },
    { href: "/settings", label: "Connections & Keys", icon: Settings2 },
  ];

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.refresh();
    window.location.href = "/";
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-50 border-b border-[#1e2230] bg-[#0a0b0e]/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-3.5">
        <Link href="/" className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#d4ff3f] text-black">
            <Clapperboard size={18} strokeWidth={2.4} />
          </span>
          <span className="leading-none">
            <span className="block text-[15px] font-bold tracking-[0.18em]">SHORTS FACTORY</span>
            <span className="mono block text-[10px] tracking-[0.28em] text-[#8b93a7]">MULTI-USER PIPELINE</span>
          </span>
        </Link>
        <nav className="flex items-center gap-2">
          {links.map(({ href, label, icon: Icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-2 rounded-lg px-3.5 py-2 text-[13px] font-semibold tracking-wide transition-colors ${
                  active ? "bg-[#d4ff3f] text-black" : "text-[#aab1c5] hover:bg-[#161a24] hover:text-white"
                }`}
              >
                <Icon size={15} />
                <span className="hidden sm:inline">{label}</span>
              </Link>
            );
          })}
          {user && (
            <div className="ml-1 flex items-center gap-2">
              <span className="mono hidden items-center gap-2 rounded-full border border-[#2a3044] py-1.5 pl-1.5 pr-3 text-[11px] text-[#c4cadb] md:flex">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#d4ff3f] text-[10px] font-bold text-black">
                  {user.name.slice(0, 1).toUpperCase()}
                </span>
                {user.name.split(" ")[0]}
              </span>
              <button
                onClick={logout}
                title="Log out"
                className="flex items-center gap-1.5 rounded-lg border border-[#2a3044] px-3 py-2 text-[12px] font-semibold text-[#8b93a7] transition-colors hover:border-[#ff4d4d]/60 hover:text-[#ff8f8f]"
              >
                <LogOut size={14} />
              </button>
            </div>
          )}
        </nav>
      </div>
    </header>
  );
}
