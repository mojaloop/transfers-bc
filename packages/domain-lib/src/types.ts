/**
 License
 --------------
 Copyright © 2021 Mojaloop Foundation

 The Mojaloop files are made available by the Mojaloop Foundation under the Apache License, Version 2.0 (the "License") and you may not use these files except in compliance with the License.

 You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0

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

import { IParticipant, IParticipantAccount } from "@mojaloop/participant-bc-public-types-lib";



export declare const enum TransferState {
    RECEIVED = "RECEIVED", 		// initial state
	RESERVED = "RESERVED", 		// after prepare
	REJECTED = "REJECTED", 		// could not prepare (ex: no liquidity)
    COMMITTED = "COMMITTED", 	// after fulfil (final state of successful transfer)
    ABORTED = "ABORTED", 		// this should not be called like this
    EXPIRED = "EXPIRED"			// system changed it expired (need the timeout mechanism)
}

export declare const enum AccountType {
	HUB = "HUB_RECONCILIATION",
	POSITION = "POSITION",
	SETTLEMENT = "SETTLEMENT"
}

export interface ITransfer {
	createdAt: number;
	updatedAt: number;
	transferId: string;
	payeeFspId: string;
	payerFspId: string;
	amount: string;
	currencyCode: string;
	ilpPacket: string;				// move to opaque object
	condition: string;				// move to opaque object
	fulFillment: number | null,		// move to opaque object
	expirationTimestamp: number;
	transferState: TransferState,
	completedTimestamp: number | null,
	extensionList: {
        extension: {
            key: string;
            value: string;
        }[]
    } | null;

	// populated from the settlements lib during prepare
	settlementModel: string;
}

export interface ITransferParticipants {
	hub : IParticipant,
	payer : IParticipant,
	payee : IParticipant
}

export interface ITransferAccounts {
	hubAccount: IParticipantAccount,
	payerPosAccount: IParticipantAccount,
	payerLiqAccount: IParticipantAccount,
	payeePosAccount: IParticipantAccount,
	payeeLiqAccount: IParticipantAccount
}

