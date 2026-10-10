import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const root = process.cwd();
const directory = 'docs/superpowers/task-reports/pokemap-plan-7-gbc-editing';
const canvas = 'packages/ui/src/gbc/GbcMapCanvas.tsx';
const app = 'packages/ui/src/gbc/GbcApp.tsx';
const editTest = 'packages/ui/test/gbc/GbcMapCanvasEdit.test.tsx';
const appTest = 'packages/ui/test/gbc/GbcAppContext.test.tsx';
const definitions = [
  ['R1-selection', app, 'if (contextMap !== null && selected !== contextMap) setContextMap(null);', '/* omit selection invariant */', 'packages/ui/test/gbc/GbcAppContextSelection.test.tsx'],
  ['R2-event-props', app, '<GbcMapCanvas {...canvasProps} chromeless view={view} onViewChange={onViewChange} />', '<GbcMapCanvas {...canvasProps} onMoveEvent={undefined} chromeless view={view} onViewChange={onViewChange} />', appTest, 'overlay event drag uses'],
  ['R3-paint-units', canvas, 'x: Math.floor(((e.clientX - rect.left - pan.x) / zoom - originX) / BLOCK_PX),', 'x: Math.floor(((e.clientX - rect.left - pan.x) / zoom - originX) / (controlled ? 16 : BLOCK_PX)),', appTest, 'visible clean overlay paint'],
  ['X7', canvas, 'export const GBC_COMPOSITE_ORIGIN = BORDER_RINGS * BLOCK_PX;', 'export const GBC_COMPOSITE_ORIGIN = 0;', appTest, 'the overlay composite lines up under the world tile'],
  ['B1-first-apply', canvas, 'return paintAt(cell.x, cell.y);\n      }).catch((e)', 'void paintAt(cell.x, cell.y);\n      }).catch((e)', editTest, '(pencil|bucket) immediate mouseup waits'],
  ['B1-drag-queue', canvas, 'pendingPaintRef.current = pendingPaintRef.current.then(() => {\n          if (ownsStroke(stroke) && stroke.begun) return paintAt(cell.x, cell.y);\n        }).catch((e) => { if (ownsStroke(stroke)) fail(e); });', 'pendingPaintRef.current = paintAt(cell.x, cell.y).catch((e) => { if (ownsStroke(stroke)) fail(e); });', editTest, 'queues a held-begin|serializes three independently'],
  ['B1-end-chain', canvas, 'await editSession.endStroke();', 'void editSession.endStroke();', editTest, 'a following stroke waits'],
  ['B1-visit', canvas, 'const ownsStroke = (stroke: NonNullable<typeof strokeRef.current>) => stroke.visit === canvasVisitRef.current;', 'const ownsStroke = (_stroke: NonNullable<typeof strokeRef.current>) => true;', editTest, 'retires queued|unmount retires pending'],
  ['B1-retire-cleanup', canvas, 'if (stroke.begun) await stroke.end();', '/* omit retired stroke cleanup */', editTest, 'without mouseup'],
];
const resultPath = path.join(directory,'b1-coordinator-results.json');
const revision = spawnSync('git', ['rev-parse', 'HEAD'], {encoding:'utf8',windowsHide:true}).stdout.trim();
const results = fs.existsSync(resultPath) ? JSON.parse(fs.readFileSync(resultPath,'utf8')) : { revision, expectedIds: definitions.map(d => d[0]), mutants: [] };
assert.equal(results.revision, revision, 'resume only same frozen revision');
function run(file, filter) {
  const args = ['node_modules/vitest/vitest.mjs', 'run', file, '--reporter=json'];
  if (filter) args.push('-t', filter);
  const execution = spawnSync(process.execPath, args, {cwd: root, encoding:'utf8', timeout:120000, maxBuffer:20*1024*1024,windowsHide:true});
  assert.ifError(execution.error);
  const data = JSON.parse(execution.stdout);
  return { exit:execution.status, passed:data.numPassedTests, failed:data.numFailedTests, failures:data.testResults.flatMap(f=>f.assertionResults.filter(a=>a.status==='failed').map(a=>({name:a.fullName,messages:a.failureMessages}))), stderr:execution.stderr };
}
for (const [id,file,before,after,test,filter] of definitions) {
  if (results.mutants.some(m=>m.id===id)) continue;
  const absolute = path.join(root,file), bytes = fs.readFileSync(absolute);
  const source = bytes.toString('utf8');
  assert(Buffer.from(source).equals(bytes), 'UTF-8 round trip');
  const candidates = [...new Set([before, before.replace(/\n/g,'\r\n')])];
  const anchors = candidates.filter(candidate=>source.split(candidate).length-1===1);
  assert.equal(anchors.length,1,`one exact newline form ${id}`);
  const anchor = anchors[0], replacement=anchor.includes('\r\n') ? after.replace(/\n/g,'\r\n') : after;
  assert.equal(source.split(anchor).length-1,1,`unique literal anchor ${id}`);
  const green=run(test,filter);
  assert(green.exit===0 && green.passed>0 && green.failed===0,`nonempty baseline ${id}`);
  let red, restored;
  try { fs.writeFileSync(absolute,source.replace(anchor,replacement)); red=run(test,filter); }
  finally { fs.writeFileSync(absolute,bytes); restored=fs.readFileSync(absolute).equals(bytes); assert(restored,`byte restoration ${id}`); }
  const final=run(test,filter);
  const row={id,file,anchor,replacement,test,filter,sha256:createHash('sha256').update(bytes).digest('hex'),green,red,restored,final};
  results.mutants.push(row);
  fs.writeFileSync(resultPath,JSON.stringify(results,null,2));
  console.log(JSON.stringify({id,green:green.passed,red:red.failed,restored:final.passed,byteIdentical:restored,failures:red.failures.map(f=>f.name)}));
  assert(final.exit===0 && final.passed>0 && final.failed===0,`nonempty restored green ${id}`);
  assert(red.exit!==0 && red.failed>0 && red.failures.length>0,`assertion kill ${id}`);
}
assert.deepEqual(results.mutants.map(m=>m.id),results.expectedIds);
assert.equal(new Set(results.mutants.map(m=>m.id)).size,definitions.length);
console.log('Exact ID reconciliation passed.');
