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
import {IAuditClient} from "@mojaloop/auditing-bc-public-types-lib";
import {ILogger} from "@mojaloop/logging-bc-public-types-lib";
import {
    CommandMsg,
    IMessage,
    IMessageConsumer,
    IMessageProducer,
    MessageTypes
} from "@mojaloop/platform-shared-lib-messaging-types-lib";
import {
    TransferFulfilRequestedEvt,
    TransferPrepareRequestedEvt,
    TransferRejectRequestedEvt,
	TransferQueryReceivedEvt,
    TransferTimeoutEvt,
    TransfersBCTopics,
    BulkTransferPrepareRequestedEvt,
    BulkTransferFulfilRequestedEvt,
	BulkTransferRejectRequestedEvt,
	BulkTransferQueryReceivedEvt,
} from "@mojaloop/platform-shared-lib-public-messages-lib";
import {
	CommitTransferFulfilCmd,
	CommitTransferFulfilCmdPayload,
	PrepareTransferCmd,
	PrepareTransferCmdPayload,
	RejectTransferCmd,
	RejectTransferCmdPayload,
	QueryTransferCmd,
	QueryTransferCmdPayload,
    TimeoutTransferCmd,
    TimeoutTransferCmdPayload,
    PrepareBulkTransferCmd,
    PrepareBulkTransferCmdPayload,
	CommitBulkTransferFulfilCmd,
	CommitBulkTransferFulfilCmdPayload,
	RejectBulkTransferCmd,
	RejectBulkTransferCmdPayload,
	QueryBulkTransferCmd,
	QueryBulkTransferCmdPayload
} from "../../domain-lib";

import {ICounter, IGauge, IHistogram, IMetrics} from "@mojaloop/platform-shared-lib-observability-types-lib";

export class TransfersEventHandler{
	private _logger: ILogger;
	private _auditClient: IAuditClient;
	private _messageConsumer: IMessageConsumer;
	private _messageProducer: IMessageProducer;
    private _transferDurationHisto:IHistogram;
    private _histo:IHistogram;
    private _eventsCounter:ICounter;
    private _batchSizeGauge:IGauge;

	constructor(logger: ILogger, auditClient:IAuditClient, messageConsumer: IMessageConsumer, messageProducer: IMessageProducer, metrics:IMetrics) {
		this._logger = logger.createChild(this.constructor.name);
		this._auditClient = auditClient;
		this._messageConsumer = messageConsumer;
		this._messageProducer = messageProducer;

        this._transferDurationHisto = metrics.getHistogram("TransfersDuration", "Transfers duration by leg", ["leg"]);
        this._histo = metrics.getHistogram("TransfersEventHandler_Calls", "Events funcion calls processed the Transfers Event Handler", ["callName", "success"]);
        this._eventsCounter = metrics.getCounter("TransfersEventHandler_EventsProcessed", "Events processed by the Transfers Event Handler", ["eventName"]);
        this._batchSizeGauge = metrics.getGauge("TransfersEventHandler_batchSize");
	}

	async start():Promise<void>{
		// connect the producer
		await this._messageProducer.connect();

		// create and start the consumer handler
		this._messageConsumer.setTopics([TransfersBCTopics.DomainRequests, TransfersBCTopics.DomainEvents, TransfersBCTopics.TimeoutEvents]);

		// this._messageConsumer.setCallbackFn(this._msgHandler.bind(this));
        this._messageConsumer.setBatchCallbackFn(this._batchMsgHandler.bind(this));
        await this._messageConsumer.connect();
        await this._messageConsumer.startAndWaitForRebalance();
    }

    private async _batchMsgHandler(receivedMessages: IMessage[]): Promise<void>{
        // eslint-disable-next-line no-async-promise-executor
        return await new Promise<void>(async (resolve) => {
            console.log(`Got message batch in TransfersEventHandler batch size: ${receivedMessages.length}`);
            this._batchSizeGauge.set(receivedMessages.length);

            const startTime = Date.now();
            const timerEndFn = this._histo.startTimer({ callName: "batchMsgHandler"});

            try{
                const outputCommands:CommandMsg[] = [];
                for(const message of receivedMessages){
                    if(message.msgType!=MessageTypes.DOMAIN_EVENT) continue;

                    const transferCmd: CommandMsg | null = this._getCmdFromEvent(message);
                    if(transferCmd) {
                        outputCommands.push(transferCmd);
                        this._eventsCounter.inc({eventName: message.msgName}, 1);
                    }

                    // metrics
                    if(!message.fspiopOpaqueState) continue;
                    const now = Date.now();
                    if(message.msgName === TransferPrepareRequestedEvt.name && message.fspiopOpaqueState.prepareSendTimestamp){
                        this._transferDurationHisto.observe({"leg": "prepare"}, now - message.fspiopOpaqueState.prepareSendTimestamp);
                    }else if(message.msgName === TransferFulfilRequestedEvt.name && message.fspiopOpaqueState.committedSendTimestamp ){
                        this._transferDurationHisto.observe({"leg": "fulfil"}, now - message.fspiopOpaqueState.committedSendTimestamp);
                        if(message.fspiopOpaqueState.prepareSendTimestamp){
                            this._transferDurationHisto.observe({"leg": "total"}, now - message.fspiopOpaqueState.prepareSendTimestamp);
                        }
                    }
                }

                console.log("before messageProducer.send()...");
                await this._messageProducer.send(outputCommands);
                console.log("after messageProducer.send()");
                timerEndFn({ success: "true" });
            }catch(err: unknown){
                const error = (err as Error);
                this._logger.error(err, `TransfersEventHandler - failed processing batch - Error: ${error.message || error.toString()}`);
                timerEndFn({ success: "false" });
            }finally {
                console.log(`  Completed batch in TransfersEventHandler batch size: ${receivedMessages.length}`);
                console.log(`  Took: ${Date.now()-startTime}`);
                console.log("\n\n");

                resolve();
            }
        });
    }

    private _getCmdFromEvent(message: IMessage):CommandMsg | null{
        if(message.msgName === TransferPrepareRequestedEvt.name) {
            const transferCmd = this._prepareEventToPrepareCommand(message as TransferPrepareRequestedEvt);
            return transferCmd;
        }else if(message.msgName === TransferFulfilRequestedEvt.name){
            const transferCmd = this._fulfilEventToFulfilCommand(message as TransferFulfilRequestedEvt);
            return transferCmd;
        }else if(message.msgName === TransferRejectRequestedEvt.name){
            const transferCmd = this._prepareEventToRejectCommand(message as TransferRejectRequestedEvt);
            return transferCmd;
        }else if(message.msgName === TransferQueryReceivedEvt.name){
            const transferCmd = this._prepareEventToQueryCommand(message as TransferQueryReceivedEvt);
            return transferCmd;
        }else if(message.msgName === TransferTimeoutEvt.name){
            const transferCmd = this._prepareEventToTimeoutCommand(message as TransferTimeoutEvt);
            return transferCmd;
        }else if(message.msgName === BulkTransferPrepareRequestedEvt.name){
            const transferCmd = this._prepareEventToPrepareBulkCommand(message as BulkTransferPrepareRequestedEvt);
            return transferCmd;
        }else if(message.msgName === BulkTransferFulfilRequestedEvt.name){
            const transferCmd = this._fulfilEventToFulfilBulkCommand(message as BulkTransferFulfilRequestedEvt);
            return transferCmd;
		}else if(message.msgName === BulkTransferRejectRequestedEvt.name){
            const transferCmd = this._prepareEventToRejectBulkCommand(message as BulkTransferRejectRequestedEvt);
            return transferCmd;
        }else if(message.msgName === BulkTransferQueryReceivedEvt.name){
            const transferCmd = this._prepareEventToQueryBulkCommand(message as BulkTransferQueryReceivedEvt);
            return transferCmd;
        }else{
            // ignore silently what we don't handle
            return null;
        }

    }

    private _prepareEventToPrepareCommand(evt: TransferPrepareRequestedEvt): PrepareTransferCmd{
		const cmdPayload: PrepareTransferCmdPayload = {
			bulkTransferId: null,
			transferId: evt.payload.transferId,
			amount: evt.payload.amount,
			currencyCode: evt.payload.currencyCode,
			payerFsp: evt.payload.payerFsp,
			payeeFsp: evt.payload.payeeFsp,
			ilpPacket: evt.payload.ilpPacket,
			expiration: evt.payload.expiration,
			condition: evt.payload.condition,
			extensionList: evt.payload.extensionList,
			payerIdType: evt.payload.payerIdType, 
			payeeIdType: evt.payload.payeeIdType,
			transferType: evt.payload.transferType
		};
		const cmd = new PrepareTransferCmd(cmdPayload);
		cmd.fspiopOpaqueState = evt.fspiopOpaqueState;
		return cmd;
	}

	private _fulfilEventToFulfilCommand(evt: TransferFulfilRequestedEvt): CommitTransferFulfilCmd {
		const cmdPayload: CommitTransferFulfilCmdPayload = {
			transferId: evt.payload.transferId,
			transferState: evt.payload.transferState,
			fulfilment: evt.payload.fulfilment,
			completedTimestamp: evt.payload.completedTimestamp,
			extensionList: evt.payload.extensionList,
			notifyPayee: evt.payload.notifyPayee,
		};
		const cmd = new CommitTransferFulfilCmd(cmdPayload);
		cmd.fspiopOpaqueState = evt.fspiopOpaqueState;
		return cmd;
	}

	private _prepareEventToRejectCommand(evt: TransferRejectRequestedEvt): RejectTransferCmd {
		const cmdPayload: RejectTransferCmdPayload = {
			transferId: evt.payload.transferId,
			errorInformation: evt.payload.errorInformation,
		};
		const cmd = new RejectTransferCmd(cmdPayload);
		cmd.fspiopOpaqueState = evt.fspiopOpaqueState;
		return cmd;
	}

	private _prepareEventToQueryCommand(evt: TransferQueryReceivedEvt): QueryTransferCmd {
		const cmdPayload: QueryTransferCmdPayload = {
			transferId: evt.payload.transferId,
		};
		const cmd = new QueryTransferCmd(cmdPayload);
		cmd.fspiopOpaqueState = evt.fspiopOpaqueState;
		return cmd;
	}

    private _prepareEventToTimeoutCommand(evt: TransferTimeoutEvt): TimeoutTransferCmd {
		const cmdPayload: TimeoutTransferCmdPayload = {
			transferId: evt.payload.transferId,
			timeout: evt.fspiopOpaqueState
		};
		const cmd = new TimeoutTransferCmd(cmdPayload);
		cmd.fspiopOpaqueState = evt.fspiopOpaqueState;
		return cmd;
	}
    
    private _prepareEventToPrepareBulkCommand(evt: BulkTransferPrepareRequestedEvt): PrepareBulkTransferCmd{
		const cmdPayload: PrepareBulkTransferCmdPayload = {
			bulkTransferId: evt.payload.bulkTransferId,
            bulkQuoteId: evt.payload.bulkQuoteId,
			payerFsp: evt.payload.payerFsp,
			payeeFsp: evt.payload.payeeFsp,
            individualTransfers: evt.payload.individualTransfers,
			expiration: evt.payload.expiration,
			extensionList: evt.payload.extensionList,
		};
		const cmd = new PrepareBulkTransferCmd(cmdPayload);
		cmd.fspiopOpaqueState = evt.fspiopOpaqueState;
		return cmd;
	}

    private _fulfilEventToFulfilBulkCommand(evt: BulkTransferFulfilRequestedEvt): CommitBulkTransferFulfilCmd {
		const cmdPayload: CommitBulkTransferFulfilCmdPayload = {
			bulkTransferId: evt.payload.bulkTransferId,
			completedTimestamp: evt.payload.completedTimestamp,
			bulkTransferState: evt.payload.bulkTransferState,
			individualTransferResults: evt.payload.individualTransferResults,
			extensionList: evt.payload.extensionList,
		};
		const cmd = new CommitBulkTransferFulfilCmd(cmdPayload);
		cmd.fspiopOpaqueState = evt.fspiopOpaqueState;
		return cmd;
	}

	private _prepareEventToRejectBulkCommand(evt: BulkTransferRejectRequestedEvt): RejectBulkTransferCmd {
		const cmdPayload: RejectBulkTransferCmdPayload = {
			bulkTransferId: evt.payload.bulkTransferId,
			errorInformation: evt.payload.errorInformation,
		};
		const cmd = new RejectBulkTransferCmd(cmdPayload);
		cmd.fspiopOpaqueState = evt.fspiopOpaqueState;
		return cmd;
	}

	private _prepareEventToQueryBulkCommand(evt: BulkTransferQueryReceivedEvt): QueryBulkTransferCmd {
		const cmdPayload: QueryBulkTransferCmdPayload = {
			bulkTransferId: evt.payload.bulkTransferId,
		};
		const cmd = new QueryBulkTransferCmd(cmdPayload);
		cmd.fspiopOpaqueState = evt.fspiopOpaqueState;
		return cmd;
	}

	async stop():Promise<void>{
		await this._messageConsumer.stop();
	}
}
