import Link from "next/link";

const links = [
  {
    href: "/play/wheel",
    title: "Play: Spin the Wheel",
    description: "Public play screen for the wheel game.",
  },
  {
    href: "/play/color-game",
    title: "Play: Color Game",
    description: "Public play screen for the color game.",
  },
  {
    href: "/admin/wheel",
    title: "Admin: Spin the Wheel",
    description: "Configure wheel slots and prizes.",
  },
  {
    href: "/admin/color-game",
    title: "Admin: Color Game",
    description: "Configure color combo and merch prizes.",
  },
];

export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-zinc-50 dark:bg-black px-6 py-16">
      <div className="w-full max-w-2xl">
        <h1 className="text-2xl font-semibold tracking-tight text-black dark:text-zinc-50 mb-8 text-center">
          Laki-Game
        </h1>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="block rounded-lg border border-black/[.08] dark:border-white/[.145] bg-white dark:bg-zinc-900 p-5 transition-colors hover:border-black/[.2] dark:hover:border-white/[.3]"
            >
              <h2 className="font-medium text-black dark:text-zinc-50">
                {link.title}
              </h2>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                {link.description}
              </p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
