// In-memory negative controls: source files on disk remain unchanged.
import { registerHooks } from "node:module";
const mutations = {
  restore: ["atomic.ts", "for (const entry of swapped)", "for (const entry of [])"],
  cleanup: ["atomic.ts", "for (const temp of ownedTemps)", "for (const temp of [])"],
  beforeCheck: ["atomic.ts", "if (entry.before === null ? current !== null : current === null || !entry.before.equals(current))", "if (false)"],
  fingerprintBefore: ["atomic.ts", "if (entry.before !== null) field(entry.before);", "if (entry.before !== null) field(Buffer.alloc(0));"],
  recomputeGba: ["/src/write/save.ts", "prepared ?? prepareSave(proj, session)", "prepareSave(proj, session)"],
  recomputeGbc: ["/gbc/write/save.ts", "prepared ?? prepareGbcSave(proj, session)", "prepareGbcSave(proj, session)"],
};
const mutation = mutations[process.env.TASK2_MUTATION];
if (!mutation) throw new Error("Specify TASK2_MUTATION");
registerHooks({
  load(url, context, nextLoad) {
    const result = nextLoad(url, context);
    if (!url.endsWith(mutation[0]) || url.includes("/test/")) return result;
    const source = typeof result.source === "string" ? result.source : Buffer.from(result.source).toString("utf8");
    if (!source.includes(mutation[1])) throw new Error("Mutation target not found");
    console.log(`MUTATION ${process.env.TASK2_MUTATION} applied to ${url}`);
    return { ...result, source: source.replace(mutation[1], mutation[2]) };
  },
});
