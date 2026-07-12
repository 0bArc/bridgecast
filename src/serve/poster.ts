import { createHash } from "crypto";
import { execFile } from "child_process";
import fs from "fs";
import path from "path";
import { promisify } from "util";

const exec = promisify(execFile);

let generating = 0;
const genQueue: Array<() => void> = [];
const MAX_GEN = 4;
const inFlight = new Map<string, Promise<string | null>>();

function acquireGen(): Promise<void> {
  return new Promise((resolve) => {
    const start = () => {
      generating++;
      resolve();
    };
    if (generating < MAX_GEN) start();
    else genQueue.push(start);
  });
}

function releaseGen() {
  generating--;
  const next = genQueue.shift();
  if (next) next();
}

export function thumbPathFor(filePath: string): string {
  const hash = createHash("sha256").update(filePath).digest("hex").slice(0, 20);
  const cacheDir = path.join(process.cwd(), ".cache", "thumbnails");
  fs.mkdirSync(cacheDir, { recursive: true });
  return path.join(cacheDir, `${hash}.jpg`);
}

export function customPosterPath(filePath: string): string {
  const hash = createHash("sha256").update(filePath).digest("hex").slice(0, 20);
  const cacheDir = path.join(process.cwd(), ".cache", "thumbnails");
  fs.mkdirSync(cacheDir, { recursive: true });
  return path.join(cacheDir, `${hash}_custom.jpg`);
}

export function hasCustomPoster(filePath: string): boolean {
  const out = customPosterPath(filePath);
  return fs.existsSync(out) && fs.statSync(out).size > 0;
}

export function resolvePosterPath(filePath: string): string | null {
  if (hasCustomPoster(filePath)) return customPosterPath(filePath);
  if (hasThumbnail(filePath)) return thumbPathFor(filePath);
  return null;
}

export function saveCustomPoster(filePath: string, data: Buffer): string {
  const out = customPosterPath(filePath);
  fs.writeFileSync(out, data);
  return out;
}

export function deleteCustomPoster(filePath: string): void {
  const out = customPosterPath(filePath);
  if (fs.existsSync(out)) fs.unlinkSync(out);
}

export function hasThumbnail(filePath: string): boolean {
  const out = thumbPathFor(filePath);
  return fs.existsSync(out) && fs.statSync(out).size > 0;
}

async function generateThumbnail(filePath: string): Promise<string | null> {
  const out = thumbPathFor(filePath);
  if (fs.existsSync(out) && fs.statSync(out).size > 0) return out;

  await acquireGen();
  try {
    if (fs.existsSync(out) && fs.statSync(out).size > 0) return out;

    await exec(
      "ffmpeg",
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-ss",
        "2",
        "-i",
        filePath,
        "-frames:v",
        "1",
        "-vf",
        "scale=480:-2",
        "-q:v",
        "7",
        "-y",
        out,
      ],
      { timeout: 30000 }
    );
    if (fs.existsSync(out) && fs.statSync(out).size > 0) return out;
  } catch {
    return null;
  } finally {
    releaseGen();
  }

  return null;
}

export function getOrCreateThumbnail(filePath: string): Promise<string | null> {
  if (hasThumbnail(filePath)) {
    return Promise.resolve(thumbPathFor(filePath));
  }

  const pending = inFlight.get(filePath);
  if (pending) return pending;

  const promise = generateThumbnail(filePath).finally(() => {
    inFlight.delete(filePath);
  });
  inFlight.set(filePath, promise);
  return promise;
}

export function prewarmThumbnails(filePaths: string[]): void {
  for (const filePath of filePaths) {
    if (!hasThumbnail(filePath)) {
      void getOrCreateThumbnail(filePath);
    }
  }
}
