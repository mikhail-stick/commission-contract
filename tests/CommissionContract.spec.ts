import { Blockchain, BlockchainContractProvider, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Address, beginCell, Cell, toNano } from '@ton/core';
import { CommissionContract } from '../wrappers/CommissionContract';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';
import { JettonMinter, JettonWallet } from "@ton-community/assets-sdk";

describe('CommissionContract', () => {
    let code: Cell;

    beforeAll(async () => {
        code = await compile('CommissionContract');
    });

    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let adminWallet: SandboxContract<TreasuryContract>;
    let userWallet: SandboxContract<TreasuryContract>;

    let commissionContract: SandboxContract<CommissionContract>;
    let jettonMinter: SandboxContract<JettonMinter>;

    let adminJettonWallet: SandboxContract<JettonWallet>;
    let contractJettonWallet: SandboxContract<JettonWallet>;
    let userJettonWallet: SandboxContract<JettonWallet>

    const commisionPercent = 23;

    beforeEach(async () => {
        blockchain = await Blockchain.create();

        adminWallet = await blockchain.treasury('admin');
        userWallet = await blockchain.treasury('user');
        deployer = await blockchain.treasury('deployer');

        jettonMinter = blockchain.openContract(
            JettonMinter.createFromConfig(
                {
                    jettonWalletCode: JettonWallet.code,
                    admin: deployer.address,
                    content: beginCell().storeStringTail('minter').endCell()
                },
                JettonMinter.code
            )
        )

        const jettonMinterResult =  await jettonMinter.sendDeploy(deployer.getSender(), toNano(5));

        expect(jettonMinterResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: jettonMinter.address,
            deploy: true,
        });

        commissionContract = blockchain.openContract(
            CommissionContract.createFromConfig(
                {
                    commission: commisionPercent,
                    adminAddress: adminWallet.address,
                    contractJettonAmount: 0,
                    jettonMasterAddress: jettonMinter.address,
                    jettonWalletCode: JettonWallet.code,
                },
                code
            )
        );

        const deployResult = await commissionContract.sendDeploy(deployer.getSender(), toNano('5'));

        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: commissionContract.address,
            deploy: true,
            success: true,
        });

        adminJettonWallet = blockchain.openContract(
            JettonWallet.createFromAddress(
                await jettonMinter.getWalletAddress(adminWallet.address)
            )
        );

        contractJettonWallet = blockchain.openContract(
            JettonWallet.createFromAddress(
                await jettonMinter.getWalletAddress(commissionContract.address)
            )
        );

        userJettonWallet = blockchain.openContract(
            JettonWallet.createFromAddress(
                await jettonMinter.getWalletAddress(userWallet.address)
            )
        );

        await jettonMinter.sendMint(deployer.getSender(), userWallet.address, toNano(100n), { value: toNano(2), queryId: toNano(9) });
    });

    it('send tokens', async () => {        
        const sendAmount = 0.00000002;
        
        const sendJettonsResult = await userJettonWallet.send(userWallet.getSender(), commissionContract.address, toNano(sendAmount), { value: toNano(2), notify: {amount: toNano(2)}});

        expect(sendJettonsResult.transactions).toHaveTransaction({
            from: userJettonWallet.address,
            to: contractJettonWallet.address,
            success: true,
        });
        expect(sendJettonsResult.transactions).toHaveTransaction({
            from: contractJettonWallet.address,
            to: commissionContract.address,
            success: true,
        });
        expect(sendJettonsResult.transactions).toHaveTransaction({
            from: commissionContract.address,
            to: contractJettonWallet.address,
            success: true,
        });
        expect(sendJettonsResult.transactions).toHaveTransaction({
            from: contractJettonWallet.address,
            to: adminJettonWallet.address,
            success: true,
        });

        const balanceAdminJettonWallet = Math.floor((sendAmount * commisionPercent / 100) * 1_000_000_000) / 1_000_000_000;

        expect((await adminJettonWallet.getData()).balance).toEqual(toNano(balanceAdminJettonWallet));
        expect((await contractJettonWallet.getData()).balance).toEqual(toNano(sendAmount - balanceAdminJettonWallet));
    })

    it ('withdraw tokens', async () => {
        const sendAmount = 0.00000002;
        
        await userJettonWallet.send(userWallet.getSender(), commissionContract.address, toNano(sendAmount), { value: toNano(2), notify: {amount: toNano(2)}});

        const balanceUserJettonWallet = (await userJettonWallet.getData()).balance;
        const balanceContractJettonWallet = (await contractJettonWallet.getData()).balance;        
    
        const withdrawResult = await commissionContract.sendWithdraw(adminWallet.getSender(), {
            receiverAddress: userWallet.address,
            value: toNano('0.05')
        });

        expect(withdrawResult.transactions).toHaveTransaction({
            from: adminWallet.address,
            to: commissionContract.address,
            success: true,
        });
        expect(withdrawResult.transactions).toHaveTransaction({
            from: commissionContract.address,
            to: contractJettonWallet.address,
            success: true,
        });
        expect(withdrawResult.transactions).toHaveTransaction({
            from: contractJettonWallet.address,
            to: userJettonWallet.address,
            success: true,
        });
        expect(withdrawResult.transactions).toHaveTransaction({
            from: userJettonWallet.address,
            to: userWallet.address,
            success: true,
        });

        expect((await contractJettonWallet.getData()).balance).toEqual(toNano(0));
        expect(balanceContractJettonWallet + balanceUserJettonWallet).toEqual((await userJettonWallet.getData()).balance);
    })

    it ('[fail] withdraw tokens', async () => {
        const sendAmount = 0.000002;
        
        await userJettonWallet.send(userWallet.getSender(), commissionContract.address, toNano(sendAmount), { value: toNano(2), notify: {amount: toNano(2)}});

        const withdrawResult = await commissionContract.sendWithdraw(userWallet.getSender(), {
            receiverAddress: userWallet.address,
            value: toNano('0.05')
        });

        expect(withdrawResult.transactions).toHaveTransaction({
            from: userWallet.address,
            to: commissionContract.address,
            success: false,
            exitCode: 73,
        });
    })

    it ('change admin', async () => {
        const newAdminWallet = await blockchain.treasury('newAdmin');

        const changeAdminResult = await commissionContract.sendChangeAdmin(adminWallet.getSender(), {
            newAdminAddress: newAdminWallet.address,
            value: toNano('0.05')
        });

        expect(changeAdminResult.transactions).toHaveTransaction({
            from: adminWallet.address,
            to: commissionContract.address,
            success: true,
        });

        const newAdminAddress = await commissionContract.getAdmin();        
        
        expect(newAdminAddress).toEqualAddress(newAdminWallet.address);
    })

    it('[fail] change admin', async () => {
        const newAdminWallet = await blockchain.treasury('newAdmin');

        const changeAdminResult = await commissionContract.sendChangeAdmin(newAdminWallet.getSender(), {
            newAdminAddress: newAdminWallet.address,
            value: toNano('0.05')
        });

        expect(changeAdminResult.transactions).toHaveTransaction({
            from: newAdminWallet.address,
            to: commissionContract.address,
            success: false,
            exitCode: 73
        });
    })
});
