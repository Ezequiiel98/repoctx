import fs from "node:fs/promises";
import path from "node:path";
import { execSync } from "node:child_process";
import { repoctxDir, ensureDirs } from "./cache.js";

type Checkpoint = {
  head: string;
  branch: string;
  at: string;
};

type RepoctxState = {
  repoRoot: string;
  lastCheckpoint: Checkpoint;
};

function stateFile() {
  return path.join(repoctxDir(), "state.json");
}

export async function saveCheckpoint(): Promise<Checkpoint> {
  const head = execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
  const branch = execSync("git rev-parse --abbrev-ref HEAD", { encoding: "utf8" }).trim();
  const at = new Date().toISOString();

  const state: RepoctxState = {
    repoRoot: process.cwd(),
    lastCheckpoint: { head, branch, at },
  };

  await ensureDirs();
  await fs.writeFile(stateFile(), JSON.stringify(state, null, 2), "utf8");

  return { head, branch, at };
}

export async function loadCheckpoint(): Promise<Checkpoint | null> {
  try {
    const raw = await fs.readFile(stateFile(), "utf8");
    const state: RepoctxState = JSON.parse(raw);
    return state.lastCheckpoint ?? null;
  } catch {
    return null;
  }
}
