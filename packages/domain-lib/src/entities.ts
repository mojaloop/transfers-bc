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

import { ITransfer, TransferState, IExtensionList, IBulkTransfer, BulkTransferState, IErrorInformation } from "@mojaloop/transfers-bc-public-types-lib";

/** Transfer entity **/
export class Transfer implements ITransfer {
	// NOTE: This data is just used for validation, we don't use it for logic/don't need to understand it
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
	errorCode: string | null;
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

/** BulkTransfer entity **/
export class BulkTransfer implements IBulkTransfer {
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
		extensions: {
			key: string;
			value: string;
		}[];
	}[];
	expiration: number;
	transfersPreparedProcessedIds: string[];
	transfersNotProcessedIds: string[];
	transfersFulfiledProcessedIds: string[];
	status: BulkTransferState;
	errorCode: string | null;
	
	// Protocol Specific
    inboundProtocolType: string;
    inboundProtocolOpaqueState: any | null;
}