import { setImmutableRoot } from "../../src/addEvent/sources.js";

// Runs in every test worker (vitest setupFiles). globalSetup runs in another process and hands the snapshot
// root over through the environment, so register it here once instead of reading the variable on every read.
setImmutableRoot(process.env.POKEMAP_SUBJECT_SNAPSHOT);
