"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Dashboard" },
  { href: "/", label: "Projects" },
  { href: "/settings", label: "Settings" }
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-screen w-64 flex-col border-r border-labBorder bg-[#080808] p-5">
      <div className="mb-8">
        <h1 className="text-lg font-semibold tracking-wide text-labText">Timo Sasaki Lens Lab</h1>
        <p className="mt-1 text-xs uppercase tracking-[0.2em] text-labMuted">Prototype. Print. Test. Tune.</p>
      </div>

      <nav className="space-y-2">
        {links.map((link) => {
          const isActive = link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
          return (
            <Link
              key={`${link.href}-${link.label}`}
              href={link.href}
              className={`block rounded-xl border px-3 py-2 text-sm transition ${
                isActive
                  ? "border-labAccent/70 bg-[#0b1b2a] text-labText"
                  : "border-transparent text-labMuted hover:border-labBorder hover:bg-labPanel hover:text-labText"
              }`}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto rounded-2xl border border-labBorder bg-labPanel p-3 text-xs text-labWarning">
        This tool generates prototype geometry only. Always check clearances, flange depth, mount safety, glass
        retention, and print tolerances before using parts near real camera gear.
      </div>
    </aside>
  );
}
