import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import * as fs from 'fs';
import * as path from 'path';

const mobile = !!/android|ios/.exec(process.env.TAURI_ENV_PLATFORM);

function executorSchemasPlugin(): Plugin {
  const VIRTUAL_ID = 'virtual:executor-schemas';
  const RESOLVED_VIRTUAL_ID = '\0' + VIRTUAL_ID;

  return {
    name: 'executor-schemas-plugin',
    resolveId(id) {
      if (id === VIRTUAL_ID) return RESOLVED_VIRTUAL_ID;
      return null;
    },
    load(id) {
      if (id !== RESOLVED_VIRTUAL_ID) return null;

      const schemasDir = path.resolve(__dirname, '../shared/schemas');
      const files = fs.existsSync(schemasDir)
        ? fs.readdirSync(schemasDir).filter((f) => f.endsWith('.json'))
        : [];

      const imports: string[] = [];
      const entries: string[] = [];

      files.forEach((file, i) => {
        const varName = `__schema_${i}`;
        const importPath = `shared/schemas/${file}`;
        const key = file.replace(/\.json$/, '').toUpperCase();
        imports.push(`import ${varName} from "${importPath}";`);
        entries.push(`  "${key}": ${varName}`);
      });

      const code = `
${imports.join('\n')}

export const schemas = {
${entries.join(',\n')}
};

export default schemas;
`;
      return code;
    },
  };
}

export default defineConfig({
  plugins: [react(), executorSchemasPlugin()],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@shared': resolve(__dirname, '../shared'),
      shared: resolve(__dirname, '../shared'),
    },
  },
  define: {
    __TAURI_MOBILE__: JSON.stringify(mobile),
  },
  server: {
    port: 5174,
  },
  build: {
    outDir: '../dist',
  },
});
