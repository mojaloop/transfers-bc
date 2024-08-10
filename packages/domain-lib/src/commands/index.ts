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
	bulkTransferId: string | null;
	transferId: string;
	amount: string;
	currencyCode: string;
	payerFsp: string;
	payeeFsp: string;
	ilpPacket: string;
	expiration: number | null;
	condition: string;
	extensionList: {
		extension: {
			key: string;
			value: string;
		}[];
	} | null;
	payerIdType: string;
    payeeIdType: string;
    transferType: string;
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
	msgTopic: string = TransfersBCTopics.DomainCommands;
	payload: PrepareTransferCmdPayload;

	constructor(payload: PrepareTransferCmdPayload) {
		super();

		this.aggregateId = this.msgKey = payload.transferId;
		this.payload = payload;
	}

  /*
    static encode(msg:PrepareTransferCmd): Uint8Array{
        const protoHeader: CommandMsgHeader = {
          msgId: msg.msgId,
          msgKey: msg.msgKey,
          msgName: msg.msgName,
          msgTopic: msg.msgTopic,
          msgOffset: msg.msgOffset || undefined,
          msgPartition: msg.msgPartition || undefined,
          msgType: messageTypeFromJSON(msg.msgType),
          msgTimestamp: msg.msgTimestamp,
          aggregateId: msg.aggregateId,
          boundedContextName: msg.boundedContextName
        };

        const protoMsg: TransferPrepareCommandMsg = {
            transferId: msg.payload.transferId,
            amount: msg.payload.amount,
            currencyCode: msg.payload.currencyCode,
            payerFsp: msg.payload.payeeFsp,
            payeeFsp: msg.payload.payeeFsp,
            ilpPacket: msg.payload.ilpPacket,
            expiration: msg.payload.expiration,
            condition: msg.payload.condition,
            transferType: msg.payload.transferType,
            payerIdType: msg.payload.payeeIdType,
            payeeIdType: msg.payload.payeeIdType,
            bulkTransferId: msg.payload.bulkTransferId || undefined,
            header: protoHeader,
            extensionList: [],
            prepare: undefined,
            passThroughState: {
                fspiopOpaqueState: undefined,
                tracingInfo: undefined
            }
        };

        // if(this.fspiopOpaqueState) {
        //     msg.passThroughState.fspiopOpaqueState = PassThroughState.fromJSON(this.fspiopOpaqueState);
        // }

        return TransferPrepareCommandMsg.encode(protoMsg).finish();
    }

    static decode(bytes:Uint8Array):PrepareTransferCmd{
        const decoded:TransferPrepareCommandMsg = TransferPrepareCommandMsg.decode(bytes);

        const payload: PrepareTransferCmdPayload ={
            transferId: decoded.transferId,
            amount: decoded.amount,
            currencyCode: decoded.currencyCode,
            payerFsp: decoded.payeeFsp,
            payeeFsp: decoded.payeeFsp,
            ilpPacket: decoded.ilpPacket,
            expiration: decoded.expiration,
            condition: decoded.condition,
            transferType: decoded.transferType,
            payerIdType: decoded.payeeIdType,
            payeeIdType: decoded.payeeIdType,
            bulkTransferId: decoded.bulkTransferId || undefined,
            header: protoHeader,
            extensionList: [],
            prepare: undefined,
            passThroughState: {
                fspiopOpaqueState: undefined,
                tracingInfo: undefined
            }

        }
    }*/


	validatePayload(): void {
		// TODO
	}
}

export type CommitTransferFulfilCmdPayload = {
	transferId: string;
	transferState: string,
	fulfilment: string | null,
	completedTimestamp: number | null,
	extensionList: {
        extension: {
            key: string;
            value: string;
        }[]
    } | null;
	notifyPayee: boolean;
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
	msgTopic: string = TransfersBCTopics.DomainCommands;
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
		extensionList: {
            extension: {
                key: string;
                value: string;
            }[];
        } | null;
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
	msgTopic: string = TransfersBCTopics.DomainCommands;
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
	prepare: {
		headers: { [key: string]: string };
		payload: string;
	};
}

export class QueryTransferCmd extends CommandMsg {
	boundedContextName: string = TRANSFERS_BOUNDED_CONTEXT_NAME;
	aggregateId: string;
	aggregateName: string = TRANSFERS_AGGREGATE_NAME;
	msgKey: string;
	msgTopic: string = TransfersBCTopics.DomainCommands;
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
}

export class TimeoutTransferCmd extends CommandMsg {
	boundedContextName: string = TRANSFERS_BOUNDED_CONTEXT_NAME;
	aggregateId: string;
	aggregateName: string = TRANSFERS_AGGREGATE_NAME;
	msgKey: string;
	msgTopic: string = TransfersBCTopics.DomainCommands;
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
        ilpPacket: string;
        condition: string;
        extensionList: {
            extension: {
                key: string;
                value: string;
            }[]
        } | null;
		payerIdType: string;
		payeeIdType: string;
		transferType: string;
    }[];
    expiration: number | null;
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
export class PrepareBulkTransferCmd extends CommandMsg {
	boundedContextName: string = TRANSFERS_BOUNDED_CONTEXT_NAME;
	aggregateId: string;
	aggregateName: string = TRANSFERS_AGGREGATE_NAME;
	msgKey: string;
	msgTopic: string = TransfersBCTopics.DomainCommands;
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
        errorInformation: {
            errorCode: string;
            errorDescription: string;
            extensionList: {
                extension: {
                    key: string;
                    value: string;
                }[]
            } | null;
        } | null;
        extensionList: {
            extension: {
                key: string;
                value: string;
            }[]
        } | null;
    }[];
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
export class CommitBulkTransferFulfilCmd extends CommandMsg {
	boundedContextName: string = TRANSFERS_BOUNDED_CONTEXT_NAME;
	aggregateId: string;
	aggregateName: string = TRANSFERS_AGGREGATE_NAME;
	msgKey: string;
	msgTopic: string = TransfersBCTopics.DomainCommands;
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
		extensionList: {
			extension: {
				key: string;
				value: string;
			}[]
		} | null;
	};
	prepare: {
		headers: { [key: string]: string };
		payload: string;
	};
}

export class RejectBulkTransferCmd extends CommandMsg {
	boundedContextName: string = TRANSFERS_BOUNDED_CONTEXT_NAME;
	aggregateId: string;
	aggregateName: string = TRANSFERS_AGGREGATE_NAME;
	msgKey: string;
	msgTopic: string = TransfersBCTopics.DomainCommands;
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
	prepare: {
		headers: { [key: string]: string };
		payload: string;
	};
}

export class QueryBulkTransferCmd extends CommandMsg {
	boundedContextName: string = TRANSFERS_BOUNDED_CONTEXT_NAME;
	aggregateId: string;
	aggregateName: string = TRANSFERS_AGGREGATE_NAME;
	msgKey: string;
	msgTopic: string = TransfersBCTopics.DomainCommands;
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
