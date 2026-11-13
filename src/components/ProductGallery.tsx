"use client";
import { useState } from "react";
import Ornament from "./Ornament";

export default function ProductGallery({
  photos,
  color,
  name,
  soldOut,
}: {
  photos: string[];
  color: string;
  name: string;
  soldOut: boolean;
}) {
  const [i, setI] = useState(0);
  const current = photos[i];

  return (
    <div>
      <div
        className="aspect-[4/5] rounded-2xl relative overflow-hidden flex items-center justify-center"
        style={{ background: color }}
      >
        {current ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={current} alt={name} className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <>
            <div className="absolute top-4 left-4 opacity-25">
              <Ornament size={70} opacity={0.5} />
            </div>
            <Ornament size={260} opacity={0.75} />
          </>
        )}
        {soldOut && (
          <div className="absolute bottom-4 right-4 text-xs uppercase tracking-widest bg-ink/80 text-champagne rounded px-3 py-1.5">
            Sin stock
          </div>
        )}
      </div>
      {photos.length > 1 ? (
        <div className="grid grid-cols-4 gap-2 mt-3">
          {photos.slice(0, 8).map((src, k) => (
            <button
              key={src}
              onClick={() => setI(k)}
              className={
                "aspect-square rounded-lg overflow-hidden border-2 " +
                (k === i ? "border-thyme" : "border-transparent")
              }
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      ) : (
        !current && (
          <div className="grid grid-cols-4 gap-2 mt-3">
            {[0, 1, 2, 3].map((k) => (
              <div key={k} className="aspect-square rounded-lg" style={{ background: color, opacity: 1 - k * 0.15 }} />
            ))}
          </div>
        )
      )}
    </div>
  );
}
