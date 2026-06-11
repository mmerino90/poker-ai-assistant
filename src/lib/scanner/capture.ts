// Screen capture for the live scanner.
//
// Uses the browser's screen-share API (getDisplayMedia) to capture a window or
// screen the user chooses (e.g. their Discord window showing the poker table),
// then lets us pull still frames onto a canvas for image processing.
//
// All of this is client-only — guard calls behind `typeof window`/effects.

import type { NormRect } from "./regions";

export function screenCaptureSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices &&
    typeof navigator.mediaDevices.getDisplayMedia === "function"
  );
}

/** Prompt the user to pick a window/screen and start capturing it. */
export async function startScreenCapture(): Promise<MediaStream> {
  if (!screenCaptureSupported()) {
    throw new Error(
      "Screen capture isn't supported in this browser. Use desktop Chrome or Edge.",
    );
  }
  return navigator.mediaDevices.getDisplayMedia({
    video: { frameRate: 10 },
    audio: false,
  });
}

export function stopStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((t) => t.stop());
}

/** Draw the current video frame onto `canvas` at the video's native size. */
export function grabFrame(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
): boolean {
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h) return false;
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return false;
  ctx.drawImage(video, 0, 0, w, h);
  return true;
}

/** Crop a normalized region (0..1 coords) out of a source canvas into a new one. */
export function cropRegion(
  src: HTMLCanvasElement,
  region: NormRect,
  scale = 1,
): HTMLCanvasElement {
  const sx = Math.round(region.x * src.width);
  const sy = Math.round(region.y * src.height);
  const sw = Math.max(1, Math.round(region.w * src.width));
  const sh = Math.max(1, Math.round(region.h * src.height));

  const out = document.createElement("canvas");
  out.width = Math.max(1, Math.round(sw * scale));
  out.height = Math.max(1, Math.round(sh * scale));
  const ctx = out.getContext("2d");
  if (ctx) {
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(src, sx, sy, sw, sh, 0, 0, out.width, out.height);
  }
  return out;
}
