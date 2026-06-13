import { createDefaultDevEnv } from '../sneaker-drop/src/index';

async function run() {
  const env = await createDefaultDevEnv();

  // Deploy factory and create queue would be invoked here in a live runtime.
  // This file documents the intended example flow for concert ticket allocation.
  console.log('Concert ticket example ready.', {
    factoryContractId: env.factoryContractId,
    queueContractId: env.queueContractId,
  });
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
