import Image from "next/image";
import Link from "next/link";
import lakiwinLogo from "@/public/brand/lakiwin-horizontal.png";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-white px-8 py-16">
      <div className="w-full max-w-xs flex flex-col items-center">
        <Image
          src={lakiwinLogo}
          alt="LAKI WIN"
          className="w-full h-auto mb-16"
          priority
        />
        <div className="w-full flex flex-col gap-4">
          <Link
            href="/play/wheel"
            className="w-full rounded-full bg-[#fad403] py-4 text-center font-extrabold uppercase tracking-wide text-black shadow-[0_4px_0_#cc9700] active:translate-y-[2px] active:shadow-[0_2px_0_#cc9700] transition-transform"
          >
            Spin the Wheel
          </Link>
          <Link
            href="/play/color-game"
            className="w-full rounded-full bg-[#fad403] py-4 text-center font-extrabold uppercase tracking-wide text-black shadow-[0_4px_0_#cc9700] active:translate-y-[2px] active:shadow-[0_2px_0_#cc9700] transition-transform"
          >
            Color Game
          </Link>
          <Link
            href="/play/duck-race"
            className="w-full rounded-full bg-[#fad403] py-4 text-center font-extrabold uppercase tracking-wide text-black shadow-[0_4px_0_#cc9700] active:translate-y-[2px] active:shadow-[0_2px_0_#cc9700] transition-transform"
          >
            Duck Race
          </Link>
        </div>
      </div>
    </div>
  );
}
