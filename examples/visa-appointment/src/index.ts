import { createDefaultDevEnv } from '../sneaker-drop/src/index';

async function run() {
  const env = await createDefaultDevEnv();

  // Visa appointment queue example demonstrating Time-in-Wait advancement.
  console.log('Visa appointment example ready.', {
    factoryContractId: env.factoryContractId,
    queueContractId: env.queueContractId,
  });
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
