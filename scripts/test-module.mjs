import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
let namespace=0;
export function moduleLoader(mocks={}){
 const id=++namespace;
 const cached=new Map();
 function url(filename){
  if(mocks[filename])return mocks[filename];
  if(cached.has(filename))return cached.get(filename);
  let source=fs.readFileSync(filename,'utf8');
  source=source.replace(/(from\s*|import\s*)['"]([^'"]+)['"]/g,(full,prefix,name)=>{
   if(mocks[name])return `${prefix}${JSON.stringify(mocks[name])}`;
   if(name.startsWith('@/')){const target=name.slice(2);return `${prefix}${JSON.stringify(url(fs.existsSync(target)?target:`${target}.ts`))}`;}
   if(name.startsWith('.'))return `${prefix}${JSON.stringify(new URL(path.resolve(path.dirname(filename),name),'file:').href)}`;
   if(name.startsWith('node:'))return full;
   return `${prefix}${JSON.stringify(import.meta.resolve(name==='next/server'?'next/server.js':name))}`;
  });
  const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
  const value='data:text/javascript;base64,'+Buffer.from(compiled+`\n// test namespace ${id}`).toString('base64');cached.set(filename,value);return value;
 }
 return filename=>import(url(filename));
}
