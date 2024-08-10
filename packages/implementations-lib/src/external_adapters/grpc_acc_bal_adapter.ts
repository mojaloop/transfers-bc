/*****
 License
 --------------
 Copyright © 2017 Bill & Melinda Gates Foundation
 The Mojaloop files are made available by the Bill & Melinda Gates Foundation under the Apache License, Version 2.0 (the "License") and you may not use these files except in compliance with the License. You may obtain a copy of the License at

 http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, the Mojaloop files are distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.

 Contributors
 --------------
 This is the official list (alphabetical ordering) of the Mojaloop project contributors for this file.
 Names of the original copyright holders (individuals or organizations)
 should be listed with a '*' in the first column. People who have
 contributed from an organization can be listed under the organization
 that actually holds the copyright for their contributions (see the
 Gates Foundation organization for an example). Those individuals should have
 their names indented and be marked with a '-'. Email address can be added
 optionally within square brackets <email>.

 * Gates Foundation
 - Name Surname <name.surname@gatesfoundation.com>

 * Crosslake
 - Pedro Sousa Barreto <pedrob@crosslaketech.com>

 --------------
 ******/

 "use strict";
/*

import {GrpcCreateJournalEntryArray} from "@mojaloop/accounts-and-balances-bc-grpc-client-lib";
import {AccountsAndBalancesAccountType} from "@mojaloop/accounts-and-balances-bc-public-types-lib";
import {ILogger} from "@mojaloop/logging-bc-public-types-lib";
import { IAccountsBalancesAdapter } from "@mojaloop/transfers-bc-domain-lib";
import { AccountsAndBalancesAccount,IAccountsBalancesHighLevelRequest, IAccountsBalancesHighLevelResponse} from "@mojaloop/accounts-and-balances-bc-public-types-lib";
import { AccountsAndBalancesGrpcClient, GrpcCreateAccountArray } from "@mojaloop/accounts-and-balances-bc-grpc-client-lib";
import { ILoginHelper, UnauthorizedError } from "@mojaloop/security-bc-public-types-lib";
import {AccountsAndBalancesJournalEntry} from "@mojaloop/accounts-and-balances-bc-public-types-lib";

export class GrpcAccountsAndBalancesAdapter implements IAccountsBalancesAdapter {
    private readonly _grpcUrl: string;
    private _logger: ILogger;
    private _client: AccountsAndBalancesGrpcClient;
    private _loginHelper: ILoginHelper;

    constructor(grpcUrl: string, loginHelper: ILoginHelper, logger: ILogger) {
        this._grpcUrl = grpcUrl;
        this._logger = logger.createChild(this.constructor.name);
        this._loginHelper = loginHelper;
    }

    async init(): Promise<void> {
        this._client = new AccountsAndBalancesGrpcClient(
            this._grpcUrl,
            this._loginHelper,
            this._logger
        );
        await this._client.init();
        this._logger.info("GrpcAccountsAndBalancesAdapter initialised successfully");
    }

    setToken(accessToken: string): void {
        //TODO @jason, put this back:
        this._loginHelper.setToken(accessToken);
    }

    setUserCredentials(client_id: string, username: string, password: string): void {
        //TODO @jason, put this back:
        this._loginHelper.setUserCredentials(client_id, username, password);
    }

    setAppCredentials(client_id: string, client_secret: string): void {
        //TODO @jason, put this back:
        this._loginHelper.setAppCredentials(client_id, client_secret);
    }

    async createAccount(requestedId: string, ownerId: string, type: AccountsAndBalancesAccountType, currencyCode: string): Promise<string> {
        const req: GrpcCreateAccountArray = {
            accountsToCreate: [{
                requestedId: requestedId,
                type: type,
                ownerId: ownerId,
                currencyCode: currencyCode
            }]
        };

        const createdIds = await this._client.createAccounts(req).catch((reason: unknown) => {
            this._logger.error(reason);
            if(reason instanceof Error && reason.constructor.name === "UnauthorizedError"){
                throw new UnauthorizedError(reason.message);
            }

            throw new Error("Could not create account in remote system: "+reason);
        });

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        return createdIds.grpcIdArray![0].grpcId!;
    }

    async createJournalEntry(
        requestedId: string, ownerId: string , currencyCode: string,
        amount: string, pending: boolean, debitedAccountId: string, creditedAccountId: string
    ): Promise<string> {
        const req: GrpcCreateJournalEntryArray = {
            entriesToCreate: [{
                requestedId: requestedId,
                amount: amount,
                pending: pending,
                ownerId: ownerId,
                currencyCode: currencyCode,
                debitedAccountId: debitedAccountId,
                creditedAccountId: creditedAccountId
            }]
        };

        const createdId = await this._client.createJournalEntries(req).catch((reason: unknown) => {
            this._logger.error(reason);
            throw new Error("Could not create journalEntry in remote system: "+reason);
        });

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        return createdId.grpcIdArray![0].grpcId!;
    }

    async getJournalEntriesByAccountId(_accountId: string): Promise<AccountsAndBalancesJournalEntry[]> { // eslint-disable-line @typescript-eslint/no-unused-vars
        // TODO @pedro, please complete:
        return Promise.resolve([]);
    }

    async getAccount(accId: string): Promise<AccountsAndBalancesAccount | null> {
        const foundAccounts = await this._client.getAccountsByIds([accId]);
        if(!foundAccounts || foundAccounts.length<=0){
            return null;
        }
        return foundAccounts[0];
    }

    async getAccounts(accountIds: string[]): Promise<AccountsAndBalancesAccount[]>{
        const foundAccounts: AccountsAndBalancesAccount[] = await this._client.getAccountsByIds(accountIds);
        if (!foundAccounts || foundAccounts.length <= 0) {
            return [];
        }

        return foundAccounts;
    }

    async getParticipantAccounts(externalId: string): Promise<AccountsAndBalancesAccount[]> {
        const foundAccounts: AccountsAndBalancesAccount[] = await this._client.getAccountsByOwnerId(externalId);
        if(!foundAccounts || foundAccounts.length <= 0){
            return [];
        }

        return foundAccounts;
    }

    async destroy (): Promise<void> {
        await this._client.destroy();
    }

    async processHighLevelBatch(requests:IAccountsBalancesHighLevelRequest[]): Promise<IAccountsBalancesHighLevelResponse[]>{
        if(this._logger.isDebugEnabled()) this._logger.debug("GrpcAccountsAndBalancesAdapter.processHighLevelBatch() - start");
        const resp = await this._client.processHighLevelBatch(requests);
        if(this._logger.isDebugEnabled()) this._logger.debug("GrpcAccountsAndBalancesAdapter.processHighLevelBatch() - end");
        return resp;
    }

    /!*

    // high level
    async checkLiquidAndReserve(
        payerPositionAccountId: string, payerLiquidityAccountId: string, hubJokeAccountId: string,
        transferAmount: string, currencyCode: string, payerNetDebitCap: string, transferId: string
    ): Promise<void>{
        await this._client.checkLiquidAndReserve(
            payerPositionAccountId, payerLiquidityAccountId, hubJokeAccountId,
            transferAmount, currencyCode, payerNetDebitCap, transferId);
    }

    async cancelReservationAndCommit(
        payerPositionAccountId: string, payeePositionAccountId: string, hubJokeAccountId: string,
        transferAmount: string, currencyCode: string, transferId: string
    ): Promise<void>{
        await this._client.cancelReservationAndCommit(
            payerPositionAccountId, payeePositionAccountId, hubJokeAccountId,
            transferAmount, currencyCode, transferId);
    }

    async cancelReservation(
        payerPositionAccountId: string, hubJokeAccountId: string,
        transferAmount: string, currencyCode: string, transferId: string
    ): Promise<void>{
        await this._client.cancelReservation(
            payerPositionAccountId, hubJokeAccountId,
            transferAmount, currencyCode, transferId);
    }

    *!/

}
*/
