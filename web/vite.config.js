import { copyFileSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { defineConfig } from 'vite';

// O runtime ONNX (WebAssembly) é servido pelo próprio site em vez de um CDN de
// terceiros: copiamos os dois arquivos do pacote instalado para public/ort/.
function selfHostOnnxRuntime() {
  return {
    name: 'self-host-onnx-runtime',
    buildStart() {
      const require = createRequire(import.meta.url);
      const dist = join(dirname(require.resolve('onnxruntime-web')), '.');
      mkdirSync('public/ort', { recursive: true });
      for (const ext of ['mjs', 'wasm']) {
        const f = `ort-wasm-simd-threaded.asyncify.${ext}`;
        copyFileSync(join(dist, f), join('public/ort', f));
      }
    },
    // O bundler também emite uma cópia do .wasm em assets/ que nunca é pedida
    // (wasmPaths aponta para ort/). Removê-la economiza 27 MB no deploy.
    closeBundle() {
      for (const f of readdirSync('dist/assets')) {
        if (/^ort-wasm.*\.wasm$/.test(f)) rmSync(join('dist/assets', f));
      }
    },
  };
}

export default defineConfig({
  base: './',                       // funciona em qualquer subpasta do GitHub Pages
  plugins: [selfHostOnnxRuntime()],
  build: { target: 'es2022', chunkSizeWarningLimit: 2500 },
  worker: { format: 'es' },
  server: { proxy: { '/api': 'http://127.0.0.1:8000' } },
});
