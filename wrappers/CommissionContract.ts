import { Address, beginCell, Cell, Contract, contractAddress, ContractProvider, Sender, SendMode } from '@ton/core';

export type CommissionContractConfig = {
    commission: number;
    adminAddress: Address;
    contractJettonAmount: number;
    jettonMasterAddress: Address;
    jettonWalletCode: Cell;
};

export function commissionContractConfigToCell(config: CommissionContractConfig): Cell {
    return beginCell()
        .storeUint(config.commission, 32)
        .storeAddress(config.adminAddress)
        .storeCoins(config.contractJettonAmount)
        .storeAddress(config.jettonMasterAddress)
        .storeRef(config.jettonWalletCode)
        .endCell();
}

export const Opcodes = {
    chahge_admin: 0x5e35d275,
    withdraw: 0xcb03bfaf,
};

export class CommissionContract implements Contract {
    constructor(readonly address: Address, readonly init?: { code: Cell; data: Cell }) {}

    static createFromAddress(address: Address) {
        return new CommissionContract(address);
    }

    static createFromConfig(config: CommissionContractConfig, code: Cell, workchain = 0) {
        const data = commissionContractConfigToCell(config);
        const init = { code, data };
        return new CommissionContract(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }

    async sendChangeAdmin(
        provider: ContractProvider,
        via: Sender,
        opts: {
            newAdminAddress: Address;
            value: bigint;
            queryID?: number;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(Opcodes.chahge_admin, 32)
                .storeUint(opts.queryID ?? 0, 64)
                .storeAddress(opts.newAdminAddress)
                .endCell(),
        });
    }

    async sendWithdraw(
        provider: ContractProvider,
        via: Sender,
        opts: {
            receiverAddress: Address;
            value: bigint;
            queryID?: number;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(Opcodes.withdraw, 32)
                .storeUint(opts.queryID ?? 0, 64)
                .storeAddress(opts.receiverAddress)
                .endCell(),
        });
    }

    async getData(provider: ContractProvider) {
        const result = await provider.get('get_contract_data', []);
        const commission = result.stack.readNumber();
        const adminAddress = result.stack.readAddress();
        const coins = result.stack.readNumber();
        return { commission, adminAddress, coins }; 
    }

    async getCommission(provider: ContractProvider) {
        const { commission } = await this.getData(provider);
        return commission;
    }

    async getAdmin(provider: ContractProvider) {
        const { adminAddress } = await this.getData(provider);
        return adminAddress;
    }

    async getCoins(provider: ContractProvider) {
        const { coins } = await this.getData(provider);
        return coins;
    }
}
