import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { stringify } from 'yaml';
import { openApiDocument } from '../src/openapi.js';

const outputPath = fileURLToPath(
  new URL('../../docs/api-reference/openapi.yaml', import.meta.url),
);
const output = stringify(openApiDocument, {
  lineWidth: 0,
  sortMapEntries: true,
});

if (process.argv.includes('--check')) {
  const committed = await readFile(outputPath, 'utf8').catch(() => '');
  if (committed !== output) {
    console.error('OpenAPI specification is stale. Run pnpm --filter @lineproof/backend openapi:generate.');
    process.exitCode = 1;
  } else {
    console.log('OpenAPI specification is up to date.');
  }
} else {
  await writeFile(outputPath, output);
  console.log(`Wrote ${outputPath}`);
}
