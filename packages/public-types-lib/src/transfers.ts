/*****
License
--------------
Copyright © 2020-2025 Mojaloop Foundation
The Mojaloop files are made available by the Mojaloop Foundation under the Apache License, Version 2.0 (the "License") and you may not use these files except in compliance with the License. You may obtain a copy of the License at

 http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, the Mojaloop files are distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.

Contributors
--------------
This is the official list of the Mojaloop project contributors for this file.
Names of the original copyright holders (individuals or organizations)
should be listed with a '*' in the first column. People who have
contributed from an organization can be listed under the organization
that actually holds the copyright for their contributions (see the
Mojaloop Foundation for an example). Those individuals should have
their names indented and be marked with a '-'. Email address can be added
optionally within square brackets <email>.

* Mojaloop Foundation
- Name Surname <name.surname@mojaloop.io>

* Coil
- Jason Bruwer <jason.bruwer@coil.com>

* Crosslake
- Pedro Sousa Barreto <pedrob@crosslaketech.com>
*****/

"use strict";

// NOTE types/enums here are kept as simple string type unions
// If changes are made in the master participant entities and enums, these should be updated

import { IParticipant, IParticipantAccount } from "@mojaloop/participant-bc-public-types-lib";
import { BulkTransferState, TransferState } from "./enums";

export interface IExtensionList {
	extension: {
		key: string;
		value: string;
	}[];
}

export interface IErrorInformation {
	errorCode: string;
	errorDescription: string;
	extensions: {
		key: string;
		value: string;
	}[];
}

export interface ITransfer {
	createdAt: number;
	updatedAt: number;
	transferId: string;
	payeeFspId: string;
	payerFspId: string;
	amount: string;
	currencyCode: string;
	expirationTimestamp: number;
	transferState: TransferState;
	completedTimestamp: number | null;
	errorCode: string | null; // TODO: check if we still need this field
	errorInformation: IErrorInformation | null;

	// populated from the settlements lib during prepare
	settlementModel: string;
	hash: string;
	bulkTransferId: string | null;
	payerIdType: string; 
	payeeIdType: string;
	transferType: string;
	extensions: {
		key: string;
		value: string;
	}[];

	// Protocol Specific
    inboundProtocolType: string;
    inboundProtocolOpaqueState: any | null;
}

export interface ITransferParticipants {
	hub: IParticipant;
	payer: IParticipant;
	payee: IParticipant;
}

export interface ITransferAccounts {
	hubAccount: IParticipantAccount;
	payerPosAccount: IParticipantAccount;
	payerLiqAccount: IParticipantAccount;
	payeePosAccount: IParticipantAccount;
	payeeLiqAccount: IParticipantAccount;
}

export interface IBulkTransfer {
	createdAt: number;
	updatedAt: number;
	bulkTransferId: string;
	bulkQuoteId: string;
	payeeFsp: string;
	payerFsp: string;
	completedTimestamp: number | null;
	individualTransfers: {
		transferId: string;
		transferAmount: {
			currency: string;
			amount: string;
		};
	}[];
	expiration: number;
	transfersPreparedProcessedIds: string[]
	transfersNotProcessedIds: string[];
	transfersFulfiledProcessedIds: string[];
	status: BulkTransferState;
	errorCode: string | null;

	// Protocol Specific
    inboundProtocolType: string;
    inboundProtocolOpaqueState: any | null;
}

export declare type TransfersSearchResults = {
	pageSize: number;
	totalPages: number;
	pageIndex: number;
	items: ITransfer[];
}
