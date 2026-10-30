"use client";

const SIZED_FILE = /-\d+\.webp$/;

export default function mediaLoader({ src, width }: { src: string; width: number }): string {
  return src.replace(SIZED_FILE, `-${width}.webp`);
}
