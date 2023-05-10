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


import {CommandMsg} from "@mojaloop/platform-shared-lib-messaging-types-lib";
import {TRANSFERS_BOUNDED_CONTEXT_NAME, TRANSFERS_AGGREGATE_NAME, TransfersBCTopics} from "@mojaloop/platform-shared-lib-public-messages-lib";


export type PrepareTransferCmdPayload = {
	transferId: string;
	amount: string;
	currency: string;
	payerId: string;
	payeeId: string;
	expiration: string;
	condition: string;
	prepare: {
		headers: { [key: string]: string };
		payload: string;
	};
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
	fulfilment: number | null,
	completedTimestamp: number | null,
	extensionList: {
        extension: {
            key: string;
            value: string;
        }[]
    } | null;
	prepare: {
		headers: { [key: string]: string };
		payload: string;
	};
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
	};
	prepare: {
		headers: { [key: string]: string };
		payload: string;
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