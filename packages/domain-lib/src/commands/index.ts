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
*****/

"use strict";


import {CommandMsg} from "@mojaloop/platform-shared-lib-messaging-types-lib";
import {TRANSFERS_BOUNDED_CONTEXT_NAME, TRANSFERS_AGGREGATE_NAME, TransfersBCTopics} from "@mojaloop/platform-shared-lib-public-messages-lib";


export type PrepareTransferCmdPayload = {
	bulkTransferId: string | null;
	transferId: string;
	amount: string;
	currencyCode: string;
	payerFsp: string;
	payeeFsp: string;
	expiration: number;
	payerIdType: string; 
    payeeIdType: string;
    transferType: string;
	extensions: {
		key: string;
		value: string;
	}[];
}

export class PrepareTransferCmd extends CommandMsg {
	boundedContextName: string = TRANSFERS_BOUNDED_CONTEXT_NAME;
	aggregateId: string;
	aggregateName: string = TRANSFERS_AGGREGATE_NAME;
	msgKey: string;
	msgTopic: string = TransfersBCTopics.DomainRequests;
	payload: PrepareTransferCmdPayload;

	constructor(payload: PrepareTransferCmdPayload) {
		super();

		this.aggregateId = this.msgKey = payload.transferId;
		this.payload = payload;
	}

	validatePayload(): void {
		// TODO
	}
}

export type CommitTransferFulfilCmdPayload = {
	transferId: string;
	transferState: string,
	completedTimestamp: number | null,
	notifyPayee: boolean;
	extensions: {
		key: string;
		value: string;
	}[];
}


export class CommitTransferFulfilCmd extends CommandMsg {
	boundedContextName: string = TRANSFERS_BOUNDED_CONTEXT_NAME;
	aggregateId: string;
	aggregateName: string = TRANSFERS_AGGREGATE_NAME;
	msgKey: string;
	msgTopic: string = TransfersBCTopics.DomainRequests;
	payload: CommitTransferFulfilCmdPayload;

	constructor(payload: CommitTransferFulfilCmdPayload) {
		super();

		this.aggregateId = this.msgKey = payload.transferId;
		this.payload = payload;
	}

	validatePayload(): void {
		// TODO
	}
}

export type RejectTransferCmdPayload = {
	transferId: string;
	errorInformation: {
		errorCode: string;
		errorDescription: string;
		extensions: {
			key: string;
			value: string;
		}[];
	};
}

export class RejectTransferCmd extends CommandMsg {
	boundedContextName: string = TRANSFERS_BOUNDED_CONTEXT_NAME;
	aggregateId: string;
	aggregateName: string = TRANSFERS_AGGREGATE_NAME;
	msgKey: string;
	msgTopic: string = TransfersBCTopics.DomainRequests;
	payload: RejectTransferCmdPayload;

	constructor(payload: RejectTransferCmdPayload) {
		super();

		this.aggregateId = this.msgKey = payload.transferId;
		this.payload = payload;
	}

	validatePayload(): void {
		// TODO
	}
}

export type QueryTransferCmdPayload = {
	transferId: string;
	requesterFspId: string;
    destinationFspId: string;
}

export class QueryTransferCmd extends CommandMsg {
	boundedContextName: string = TRANSFERS_BOUNDED_CONTEXT_NAME;
	aggregateId: string;
	aggregateName: string = TRANSFERS_AGGREGATE_NAME;
	msgKey: string;
	msgTopic: string = TransfersBCTopics.DomainRequests;
	payload: QueryTransferCmdPayload;

	constructor(payload: QueryTransferCmdPayload) {
		super();

		this.aggregateId = this.msgKey = payload.transferId;
		this.payload = payload;
	}

	validatePayload(): void {
		// TODO
	}
}

export type TimeoutTransferCmdPayload = {
	transferId: string;
	timeout: {
		headers: { [key: string]: string };
		payload: string;
	};
}

export class TimeoutTransferCmd extends CommandMsg {
	boundedContextName: string = TRANSFERS_BOUNDED_CONTEXT_NAME;
	aggregateId: string;
	aggregateName: string = TRANSFERS_AGGREGATE_NAME;
	msgKey: string;
	msgTopic: string = TransfersBCTopics.DomainRequests;
	payload: TimeoutTransferCmdPayload;

	constructor(payload: TimeoutTransferCmdPayload) {
		super();

		this.aggregateId = this.msgKey = payload.transferId;
		this.payload = payload;
	}

	validatePayload(): void {
		// TODO
	}
}


export type PrepareBulkTransferCmdPayload = {
    bulkTransferId: string;
    bulkQuoteId: string;
    payeeFsp: string;
    payerFsp: string;
    individualTransfers: {
        transferId: string;
        transferAmount: {
            currency: string;
            amount: string;
        };
		payerIdType: string; 
		payeeIdType: string;
		transferType: string;
		extensions: {
			key: string;
			value: string;
		}[];
    }[];
    expiration: number;
	extensions: {
		key: string;
		value: string;
	}[];
}
export class PrepareBulkTransferCmd extends CommandMsg {
	boundedContextName: string = TRANSFERS_BOUNDED_CONTEXT_NAME;
	aggregateId: string;
	aggregateName: string = TRANSFERS_AGGREGATE_NAME;
	msgKey: string;
	msgTopic: string = TransfersBCTopics.DomainRequests;
	payload: PrepareBulkTransferCmdPayload;

	constructor(payload: PrepareBulkTransferCmdPayload) {
		super();

		this.aggregateId = this.msgKey = payload.bulkTransferId;
		this.payload = payload;
	}

	validatePayload(): void {
		// TODO
	}
}

export type CommitBulkTransferFulfilCmdPayload = {
    bulkTransferId: string;
	completedTimestamp: number,
	bulkTransferState: "PENDING" | "ACCEPTED" | "PROCESSING" | "COMPLETED" | "REJECTED",
    individualTransferResults: {
        transferId: string;
        fulfilment: string | null;
		extensions: {
			key: string;
			value: string;
		}[];
        errorInformation: {
            errorCode: string;
            errorDescription: string;
			extensions: {
				key: string;
				value: string;
			}[];
        } | null;
    }[];
	extensions: {
		key: string;
		value: string;
	}[];
}
export class CommitBulkTransferFulfilCmd extends CommandMsg {
	boundedContextName: string = TRANSFERS_BOUNDED_CONTEXT_NAME;
	aggregateId: string;
	aggregateName: string = TRANSFERS_AGGREGATE_NAME;
	msgKey: string;
	msgTopic: string = TransfersBCTopics.DomainRequests;
	payload: CommitBulkTransferFulfilCmdPayload;

	constructor(payload: CommitBulkTransferFulfilCmdPayload) {
		super();

		this.aggregateId = this.msgKey = payload.bulkTransferId;
		this.payload = payload;
	}

	validatePayload(): void {
		// TODO
	}
}

export type RejectBulkTransferCmdPayload = {
	bulkTransferId: string;
	errorInformation: {
		errorCode: string;
		errorDescription: string;
		extensions: {
			key: string;
			value: string;
		}[];
	};
}

export class RejectBulkTransferCmd extends CommandMsg {
	boundedContextName: string = TRANSFERS_BOUNDED_CONTEXT_NAME;
	aggregateId: string;
	aggregateName: string = TRANSFERS_AGGREGATE_NAME;
	msgKey: string;
	msgTopic: string = TransfersBCTopics.DomainRequests;
	payload: RejectBulkTransferCmdPayload;

	constructor(payload: RejectBulkTransferCmdPayload) {
		super();

		this.aggregateId = this.msgKey = payload.bulkTransferId;
		this.payload = payload;
	}

	validatePayload(): void {
		// TODO
	}
}

export type QueryBulkTransferCmdPayload = {
	bulkTransferId: string;
	requesterFspId: string;
    destinationFspId: string;
}

export class QueryBulkTransferCmd extends CommandMsg {
	boundedContextName: string = TRANSFERS_BOUNDED_CONTEXT_NAME;
	aggregateId: string;
	aggregateName: string = TRANSFERS_AGGREGATE_NAME;
	msgKey: string;
	msgTopic: string = TransfersBCTopics.DomainRequests;
	payload: QueryBulkTransferCmdPayload;

	constructor(payload: QueryBulkTransferCmdPayload) {
		super();

		this.aggregateId = this.msgKey = payload.bulkTransferId;
		this.payload = payload;
	}

	validatePayload(): void {
		// TODO
	}
}