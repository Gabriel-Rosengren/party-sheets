import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node20',
  clean: true,
  sourcemap: true,
  // The shared workspace package ships TypeScript source, so bundle it in;
  // real npm dependencies stay external and are installed alongside dist/.
  noExternal: ['@party-sheets/shared'],
});
