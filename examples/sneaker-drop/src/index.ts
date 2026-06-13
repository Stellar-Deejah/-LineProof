import { LineProofClient, QueueClient, EnrollmentClient, EscrowClient, IdentityClient } from '@lineproof/sdk';

export interface ExampleEnv {
  client: LineProofClient;
  factoryContractId: string;
  queueContractId: string;
  admin: any;
  participant: any;
}

async function createDefaultDevEnv(): Promise<ExampleEnv> {
  const client = new LineProofClient({
    rpcServerUrl: 'http://localhost:8000/soroban/rpc',
    networkPassphrase: 'Standalone Network ; February 2017',
    privateKey: process.env.LINEPROOF_PRIVATE_KEY,
  });

  return {
    client,
    factoryContractId: 'CFACTORY123',
    queueContractId: 'CQUEUE123',
    admin: { id: 'admin', publicKey: 'GADMIN...' },
    participant: { id: 'user', publicKey: 'GUSER...' },
  };
}

export { createDefaultDevEnv };
