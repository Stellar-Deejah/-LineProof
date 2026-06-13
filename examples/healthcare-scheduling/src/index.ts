import { createDefaultDevEnv } from '../sneaker-drop/src/index';

async function run() {
  const env = await createDefaultDevEnv();

  // Healthcare scheduling example demonstrating escrow-backed appointments.
  console.log('Healthcare scheduling example ready.', {
    factoryContractId: env.factoryContractId,
    queueContractId: env.queueContractId,
  });
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
