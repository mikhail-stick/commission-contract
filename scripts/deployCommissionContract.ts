import { toNano } from '@ton/core';
import { CommissionContract } from '../wrappers/CommissionContract';
import { compile, NetworkProvider } from '@ton/blueprint';

export async function run(provider: NetworkProvider) {
    const commissionContract = provider.open(
        CommissionContract.createFromConfig(
            {
                id: Math.floor(Math.random() * 10000),
                counter: 0,
            },
            await compile('CommissionContract')
        )
    );

    await commissionContract.sendDeploy(provider.sender(), toNano('0.05'));

    await provider.waitForDeploy(commissionContract.address);

    console.log('ID', await commissionContract.getID());
}
