import { mkdir, writeFile, readFile, rename } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const root = new URL('../vendor/ai/', import.meta.url);
const revision = '751bff37182d3f1213fa05d7196b954e230abad9';
const modelBase = `https://huggingface.co/Xenova/all-MiniLM-L6-v2/resolve/${revision}/`;
const runtimeBase = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/dist/';
const modelFiles = ['config.json', 'tokenizer.json', 'tokenizer_config.json', 'special_tokens_map.json', 'vocab.txt', 'onnx/model_quantized.onnx', 'README.md'];
const entries = [{ path: 'runtime/LICENSE', url: 'https://raw.githubusercontent.com/microsoft/onnxruntime/v1.22.0/LICENSE' }, ...modelFiles.map(name => ({ path: 'models/minilm/' + name, url: modelBase + name })), ...['ort-wasm-simd-threaded.jsep.mjs', 'ort-wasm-simd-threaded.jsep.wasm'].map(name => ({ path: 'runtime/' + name, url: runtimeBase + name }))];
let old; try { old = JSON.parse(await readFile(new URL('manifest.json', root), 'utf8')); } catch {}
const manifest = { model: 'Xenova/all-MiniLM-L6-v2', revision, runtime: '@huggingface/transformers@3.8.1', files: [] };
for (const entry of entries) {
 const target = new URL(entry.path, root); await mkdir(new URL('.', target), { recursive: true });
 let data; try { data = await readFile(target); } catch {}
 const expected = old?.files.find(f => f.path === entry.path)?.sha256;
 const hash = bytes => createHash('sha256').update(bytes).digest('hex');
 if (!data || expected && hash(data) !== expected) {
  const response = await fetch(entry.url, { signal: AbortSignal.timeout(120000) });
  if (!response.ok) throw Error(`Download failed: ${entry.path}: ${response.status}`);
  data = Buffer.from(await response.arrayBuffer());
  if (expected && hash(data) !== expected) throw Error(`Checksum mismatch: ${entry.path}`);
  await writeFile(new URL(target.href + '.partial'), data); await rename(new URL(target.href + '.partial'), target);
 }
 manifest.files.push({ ...entry, bytes: data.length, sha256: hash(data) }); console.log(`${entry.path}: ${data.length} bytes`);
}
await writeFile(new URL('manifest.json', root), JSON.stringify(manifest, null, 2) + '\n');
console.log('Bundled AI assets verified.');
