import fs from 'node:fs';import ts from 'typescript';import assert from 'node:assert/strict';
const source=ts.transpileModule(fs.readFileSync('lib/media.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {extractMedia,safeMediaUrl}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const video='https://video-test.xx.fbcdn.net/test.mp4',image='https://scontent-test.xx.fbcdn.net/test.jpg';
assert.equal(safeMediaUrl('http://video-test.fbcdn.net/a'),null);assert.equal(safeMediaUrl('https://evil.example/a'),null);assert.equal(safeMediaUrl('https://video-test.fbcdn.net/a?access_token=secret'),null);
const items=extractMedia({snapshot:{videos:[{video_hd_url:video,video_preview_image_url:image}],cards:[{video_sd_url:video},{original_image_url:image}]}});assert.equal(items.length,2);assert.equal(items[0].kind,'video');assert.equal(items[1].kind,'image');assert.deepEqual(extractMedia({snapshot:{}}),[]);assert.equal(extractMedia({data:{snapshot:{cards:[{video_sd_url:video}]}}})[0].url,video);
console.log('Media checks passed: CDN URL validation, credential rejection, video/image variants and deduplication.');
