import ts from 'typescript';
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
const root=path.resolve('.sites-runtime/unit-tests');
try {
  await mkdir(root,{recursive:true});
  await writeFile(path.join(root,'package.json'),'{"type":"commonjs"}');
  for(const name of ['lib/stats','lib/session-memo-server','lib/session-memos-store','tests/session-memo.test','lib/punch-layout','tests/punch-layout.test','lib/daily-note','lib/daily-note-validation','lib/daily-note-server','lib/daily-notes-store','tests/daily-notes.test','lib/model','lib/punch-state','lib/punch-server','lib/bootstrap','lib/time','lib/errors','lib/validation','lib/records','tests/core.test','tests/bootstrap.test','tests/punch.test']) {
    const out=path.join(root,name+'.js');await mkdir(path.dirname(out),{recursive:true});
    const source=await readFile(name+'.ts','utf8');
    await writeFile(out,ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText);
  }
  execFileSync(process.execPath,['--test',path.join(root,'tests/session-memo.test.js'),path.join(root,'tests/punch-layout.test.js'),path.join(root,'tests/daily-notes.test.js'),path.join(root,'tests/core.test.js'),path.join(root,'tests/bootstrap.test.js'),path.join(root,'tests/punch.test.js')],{stdio:'inherit'});
} finally { await rm(root,{recursive:true,force:true}); }
