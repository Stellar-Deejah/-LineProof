import { LineProofClient, QueueClient, EnrollmentClient } from '@lineproof/sdk';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. ` +
        'Copy .env.example to .env and fill in your testnet values ' +
        '(see examples/README.md for how to deploy a factory and queue).',
    );
  }
  return value;
}

interface DevEnv {
  client: LineProofClient;
  factoryContractId: string;
  queueContractId: string;
}

async function createDevEnv(): Promise<DevEnv> {
  const factoryContractId = requireEnv('FACTORY_CONTRACT_ID');
  const queueContractId = requireEnv('QUEUE_CONTRACT_ID');

  const client = new LineProofClient({
    horizonUrl: process.env.HORIZON_URL || 'https://horizon-testnet.stellar.org',
    sorobanRpcUrl: process.env.SOROBAN_RPC_URL || 'https://soroban-testnet.stellar.org',
    networkPassphrase: process.env.NETWORK_PASSPHRASE || 'Test SDF Network ; September 2015',
    privateKey: process.env.LINEPROOF_PRIVATE_KEY,
  });

  return { client, factoryContractId, queueContractId };
}

async function run(): Promise<void> {
  const { client, queueContractId } = await createDevEnv();
  const queue = new QueueClient(client, { queueContractId });
  const enrollment = new EnrollmentClient(client, queueContractId);

  // Concert ticket queue example demonstrating Time-in-Wait advancement
  // for a fixed-capacity, escrow-backed, non-transferable ticket allocation.
  console.log('Concert ticket example ready.', { queueContractId });

  // Uncomment once you have a live testnet queue with at least one enrollee:
  // const position = await queue.getPosition(1);
  // console.log('Queue position:', position);
  // const isEnrolled = await enrollment.isEnrolled(queueContractId, '<G... address>');
  // console.log('Is enrolled:', isEnrolled);

  void enrollment;
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
