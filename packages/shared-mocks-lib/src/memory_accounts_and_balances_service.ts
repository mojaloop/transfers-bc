/**
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
 should be listed with a '' in the first column. People who have
 contributed from an organization can be listed under the organization
 that actually holds the copyright for their contributions (see the
 Gates Foundation organization for an example). Those individuals should have
 their names indented and be marked with a '-'. Email address can be added
 optionally within square brackets <email>.

 * Gates Foundation
 - Name Surname <name.surname@gatesfoundation.com>
 
 * Arg Software
 - José Antunes <jose.antunes@arg.software>
 - Rui Rocha <rui.rocha@arg.software>

 --------------
**/

"use strict";

import {ILogger} from "@mojaloop/logging-bc-public-types-lib";
import { IAccountsBalancesAdapter } from "@mojaloop/transfers-bc-domain-lib";
import {AccountsAndBalancesAccountType, AccountsAndBalancesAccount, AccountsAndBalancesJournalEntry } from "@mojaloop/accounts-and-balances-bc-public-types-lib/dist/types";

export class MemoryAccountsAndBalancesService implements IAccountsBalancesAdapter {
	private readonly logger: ILogger;
    private readonly authTokenUrl: string;

	private access_token: string | null = null;
	private client_id: string | null = null;
    private client_secret: string | null = null;
    private username: string | null = null;
    private password: string | null = null;
	
	constructor(
		logger: ILogger,
	) {
		this.logger = logger;
	}

    init(): Promise<void> {
        return Promise.resolve();
    }

    destroy(): Promise<void> {
        return Promise.resolve();
    }

		
	setToken(access_token: string): void	{
        this.access_token = access_token;
    }

	setAppCredentials(client_id: string, client_secret: string): void {
        this.client_id = client_id;
        this.client_secret = client_secret;
    }

	createAccount(requestedId: string, ownerId: string, type: AccountsAndBalancesAccountType, currencyCode: string): Promise<string> {
		return Promise.resolve("accountId");
	}

	getAccount(accountId: string): Promise<AccountsAndBalancesAccount | null> {
		const account:AccountsAndBalancesAccount = {
			id: null,
			ownerId: "",
			state: "ACTIVE",
			type: "FEE",
			currencyCode: "",
			postedDebitBalance: null,
			pendingDebitBalance: null,
			postedCreditBalance: null,
			pendingCreditBalance: null,
			balance: null,
			timestampLastJournalEntry: null
		}; 

		return Promise.resolve(account);
	}

	getAccounts(accountIds: string[]): Promise<AccountsAndBalancesAccount[]> {
		const account:AccountsAndBalancesAccount = {
			id: null,
			ownerId: "",
			state: "ACTIVE",
			type: "FEE",
			currencyCode: "",
			postedDebitBalance: null,
			pendingDebitBalance: null,
			postedCreditBalance: null,
			pendingCreditBalance: null,
			balance: null,
			timestampLastJournalEntry: null
		}; 

		return Promise.resolve([account]);
	}

	getParticipantAccounts(participantId: string): Promise<AccountsAndBalancesAccount[]> {
		const account:AccountsAndBalancesAccount = {
			id: null,
			ownerId: "",
			state: "ACTIVE",
			type: "FEE",
			currencyCode: "",
			postedDebitBalance: null,
			pendingDebitBalance: null,
			postedCreditBalance: null,
			pendingCreditBalance: null,
			balance: null,
			timestampLastJournalEntry: null
		}; 

		return Promise.resolve([account]);
	}

	createJournalEntry(requestedId: string, ownerId: string,
		currencyCode: string,
		amount: string,
		pending: boolean,
		debitedAccountId: string,
		creditedAccountId: string
	): Promise<string> {
		return Promise.resolve("journalEntryId");
	}

	getJournalEntriesByAccountId(accountId: string): Promise<AccountsAndBalancesJournalEntry[]> {
		const journalEntry:AccountsAndBalancesJournalEntry = {
			id: null,
			ownerId: null,
			currencyCode: "",
			amount: "",
			pending: false,
			debitedAccountId: "",
			creditedAccountId: "",
			timestamp: null
		}; 

		return Promise.resolve([journalEntry]);
	}

    checkLiquidAndReserve(
        payerPositionAccountId: string, payerLiquidityAccountId: string, hubJokeAccountId: string,
        transferAmount: string, currencyCode: string, payerNetDebitCap: string, transferId: string
    ): Promise<void> {
		return Promise.resolve();
	}

    cancelReservationAndCommit(
        payerPositionAccountId: string, payeePositionAccountId: string, hubJokeAccountId: string,
        transferAmount: string, currencyCode: string, transferId: string
    ): Promise<void> {
		return Promise.resolve();
	}

    cancelReservation(
        payerPositionAccountId: string, hubJokeAccountId: string,
        transferAmount: string, currencyCode: string, transferId: string
    ): Promise<void> {
		return Promise.resolve();
	}
	
	setUserCredentials(client_id: string, username: string, password: string): void {
        this.client_id = client_id;
        this.username = username;
        this.password = password;
    }

}
