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

import {IParticipant} from "@mojaloop/participant-bc-public-types-lib";
import { ITransfer } from "../types";
import {
    AccountsAndBalancesAccount,
    AccountsAndBalancesJournalEntry,
    AccountsAndBalancesAccountType, IAccountsBalancesHighLevelRequest, IAccountsBalancesHighLevelResponse
} from "@mojaloop/accounts-and-balances-bc-public-types-lib";

export interface ITransfersRepository {
    init(): Promise<void>;
	destroy(): Promise<void>;
    addTransfer(transfer: ITransfer):Promise<string>;
	addTransfers(transfers: ITransfer[]):Promise<void>;
    updateTransfer(transfer: ITransfer):Promise<void>;
	removeTransfer(id: string):Promise<void>;
    getTransferById(id:string):Promise<ITransfer|null>;
    getTransfers():Promise<ITransfer[]>;
	searchTransfers(
		state?:string,
		currencyCode?:string,
		startDate?:number,
		endDate?:number,
		id?:string
	):Promise<ITransfer[]>

    storeTransfers(transfers:ITransfer[]):Promise<void>;
}

export interface IParticipantsServiceAdapter {
    getParticipantInfo(fspId: string): Promise<IParticipant| null>;
    getParticipantsInfo(fspIds: string[]): Promise<IParticipant[]|null>;
}

export interface IAccountsBalancesAdapter {
	init(): Promise<void>;
	destroy(): Promise<void>;

	setToken(accessToken: string): void;
	setUserCredentials(client_id: string, username: string, password: string): void;
	setAppCredentials(client_id: string, client_secret: string): void;

	createAccount(requestedId: string, ownerId: string, type: AccountsAndBalancesAccountType, currencyCode: string): Promise<string>;
	getAccount(accountId: string): Promise<AccountsAndBalancesAccount | null>;
	getAccounts(accountIds: string[]): Promise<AccountsAndBalancesAccount[]>;
	getParticipantAccounts(participantId: string): Promise<AccountsAndBalancesAccount[]>;

	createJournalEntry(
		requestedId: string,
		ownerId: string,
		currencyCode: string,
		amount: string,
		pending: boolean,
		debitedAccountId: string,
		creditedAccountId: string
	): Promise<string>;

	getJournalEntriesByAccountId(accountId: string): Promise<AccountsAndBalancesJournalEntry[]>;

    processHighLevelBatch(requests:IAccountsBalancesHighLevelRequest[]):Promise<IAccountsBalancesHighLevelResponse[]>;

/*

    // high level
    checkLiquidAndReserve(
        payerPositionAccountId: string, payerLiquidityAccountId: string, hubJokeAccountId: string,
        transferAmount: string, currencyCode: string, payerNetDebitCap: string, transferId: string
    ): Promise<void>;

    cancelReservationAndCommit(
        payerPositionAccountId: string, payeePositionAccountId: string, hubJokeAccountId: string,
        transferAmount: string, currencyCode: string, transferId: string
    ): Promise<void>;

    cancelReservation(
        payerPositionAccountId: string, hubJokeAccountId: string,
        transferAmount: string, currencyCode: string, transferId: string
    ): Promise<void>;

*/
}

export interface ISettlementsServiceAdapter {
    getSettlementModel(transferAmount: bigint, payerCurrency: string | null, payeeCurrency: string | null, extensionList: { key: string; value: string; }[]): Promise<string | null>;
}