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
    PrepareBulkTransferCmd,
    PrepareBulkTransferCmdPayload,
    CommitBulkTransferFulfilCmd,
    CommitBulkTransferFulfilCmdPayload,
    RejectBulkTransferCmd,
    RejectBulkTransferCmdPayload,
    QueryBulkTransferCmd,
    QueryBulkTransferCmdPayload
} from "../../domain-lib";

import {
    Context,
    ICounter,
    IGauge,
    IHistogram,
    IMetrics
} from "@mojaloop/platform-shared-lib-observability-types-lib";
import {OpenTelemetryClient} from "@mojaloop/platform-shared-lib-observability-client-lib";
import * as OpentelemetryApi from "@opentelemetry/api";
import {SpanKind, SpanOptions} from "@opentelemetry/api";
import {ITimeoutAdapter} from "@mojaloop/transfers-bc-domain-lib";
import {CheckExpiredTimerTickEvt} from "./local_types/local_types";

// These need to match the simulator - Should go to the observability types
export const TRACING_REQ_START_TS_HEADER_NAME="tracing-request-start-timestamp";
export const TRACING_RESP_START_TS_HEADER_NAME="tracing-response-start-timestamp";

export class TransfersEventHandler {
    private readonly _logger: ILogger;
    private readonly _messageConsumer: IMessageConsumer;
    private readonly _messageProducer: IMessageProducer;
    private readonly _timeoutAdapter: ITimeoutAdapter;
    private readonly _transferDurationHisto: IHistogram;
    private readonly _expirationCheckIntervalMs:number;
    private readonly _histo: IHistogram;
    private  _expirationSendEvtNodeTimeout: NodeJS.Timeout;
    private _eventsCounter: ICounter;
    private _batchSizeGauge: IGauge;
    private _tracer = OpenTelemetryClient.getInstance().trace.getTracer(this.constructor.name);
    private _expirationControlLoopRunning = false;
    private _lastTimeCheckedForExpired = 0;

    constructor(logger: ILogger, messageConsumer: IMessageConsumer, messageProducer: IMessageProducer, metrics: IMetrics, timeoutAdapter: ITimeoutAdapter, expirationIntervalSecs:number) {
        this._logger = logger.createChild(this.constructor.name);
        this._messageConsumer = messageConsumer;
        this._messageProducer = messageProducer;
        this._timeoutAdapter = timeoutAdapter;
        this._expirationCheckIntervalMs = expirationIntervalSecs * 1000;

        this._transferDurationHisto = metrics.getHistogram("TransfersDuration", "Transfers duration by leg", ["leg"]);
        this._histo = metrics.getHistogram("TransfersEventHandler_Calls", "Events function calls processed the Transfers Event Handler", ["callName", "success"]);
        this._eventsCounter = metrics.getCounter("TransfersEventHandler_EventsProcessed", "Events processed by the Transfers Event Handler", ["eventName"]);
        this._batchSizeGauge = metrics.getGauge("TransfersEventHandler_batchSize");
    }

    async start(): Promise<void> {
        // connect the producer
        await this._messageProducer.connect();

        // create and start the consumer handler
        this._messageConsumer.setTopics([TransfersBCTopics.DomainRequests, TransfersBCTopics.TimeoutEvents]);
        // this._messageConsumer.setTopics([TransfersBCTopics.DomainRequests, TransfersBCTopics.DomainEvents, TransfersBCTopics.TimeoutEvents]);

        this._messageConsumer.setBatchCallbackFn(this._batchMsgHandler.bind(this));
        await this._messageConsumer.connect();
        await this._messageConsumer.startAndWaitForRebalance();

        // start send check expired evt loop
        this._expirationSendEvtNodeTimeout = setInterval(
            this._sendCheckExpiredCommands.bind(this),
            this._expirationCheckIntervalMs
        );
    }

    private async _batchMsgHandler(receivedMessages: IMessage[]): Promise<void> {
        const startTime = Date.now();
        this._logger.isDebugEnabled() && this._logger.debug(`Got message batch in TransfersEventHandler batch size: ${receivedMessages.length}`);
        this._batchSizeGauge.set(receivedMessages.length);
        const timerEndFn = this._histo.startTimer({callName: "batchMsgHandler"});

        try {
            const outputCommands: CommandMsg[] = [];
            let timeoutCmds: CommandMsg[] = [];

            /*
            Remove special CheckExpiredTimerTickEvt events from the list - it's just a signal,
            only one instance in the consumer group will get these CheckExpiredTimerTickEvt events.
            See the CheckExpiredTimerTickEvt.msgKey note for more.
            */

            let hasCheckTimerTickEvents = false;
            for(let i=0; i<receivedMessages.length; i++) {
                if(receivedMessages[i].msgName === CheckExpiredTimerTickEvt.name) {
                    hasCheckTimerTickEvents = true;
                    receivedMessages.splice(i, 1);
                }
            }

            for (const message of receivedMessages) {
                if (message.msgType != MessageTypes.DOMAIN_EVENT) continue;
                this._histo.observe({callName:"msgDelay"}, (Date.now() - message.msgTimestamp)/1000);

                const context =  OpenTelemetryClient.getInstance().propagationExtract(message.tracingInfo);

                const spanName = `processEvent ${message.msgName}`;
                const spanOptions: SpanOptions = {
                    kind: SpanKind.CONSUMER,
                    attributes: {
                        "msgName": message.msgName,
                        "entityId": message.payload.transferId,
                        "transferId": message.payload.transferId,
                        "batchSize": receivedMessages.length
                    }
                };

                await this._tracer.startActiveSpan(spanName, spanOptions, context, async (span) => {
                    const transferCmd: CommandMsg | null = this._getCmdFromEvent(message);

                    if(transferCmd) {
                        // propagate tracingInfo object
                        transferCmd.tracingInfo = {};
                        OpenTelemetryClient.getInstance().propagationInject(transferCmd.tracingInfo);

                        outputCommands.push(transferCmd);
                        this._eventsCounter.inc({eventName: message.msgName}, 1);
                    }

                    // metrics
                    this._recordMetricsFromContext(message.msgName, context);

                    span.end();
                });
            }

            // if we got a tick event, then check for expired
            if(hasCheckTimerTickEvents){
                timeoutCmds = await this._checkForExpiredTransfersAndReturnTimeoutCmds();
                if(timeoutCmds.length) outputCommands.push(...timeoutCmds);
            }

            // now we can send the commands
            const timerEndFn_send = this._histo.startTimer({callName: "batchMsgHandler__messageProducerSend"});
            await this._messageProducer.send(outputCommands);
            timerEndFn_send({success: "true"});

            // if timeout commands were sent, clear the respective timeouts (remove all expired records from redis)
            if(timeoutCmds.length>0) {
                const timerEndFn_clearTimeouts = this._histo.startTimer({callName: "batchMsgHandler_clearTimeouts"});
                const expiredTransferIds = timeoutCmds.map(value => value.payload.transferId);
                await this._timeoutAdapter.clearTimeouts(expiredTransferIds);
                this._logger.isDebugEnabled() && this._logger.debug(`${expiredTransferIds.length} timeouts cleared from the timeout adapter`);
                timerEndFn_clearTimeouts({success: "true"});
            }

            timerEndFn({ success: "true" });
        } catch (err: unknown) {
            const error = (err as Error);
            this._logger.error(err, `TransfersEventHandler - failed processing batch - Error: ${error.message || error.toString()}`);
            timerEndFn({ success: "false" });
        } finally {
            this._logger.isDebugEnabled() && this._logger.debug(`  Completed batch in TransfersEventHandler batch size: ${receivedMessages.length}`);
            this._logger.isDebugEnabled() && this._logger.debug(`  Took: ${Date.now()-startTime} ms \n\n`);
        }
    }

    private async _sendCheckExpiredCommands():Promise<void>{
        if(this._expirationControlLoopRunning) return;
        this._expirationControlLoopRunning = true;

        await this._messageProducer.send(new CheckExpiredTimerTickEvt());

        this._expirationControlLoopRunning = false;
    }

    private async _checkForExpiredTransfersAndReturnTimeoutCmds(): Promise<TimeoutTransferCmd[]> {
        if(Date.now() - this._lastTimeCheckedForExpired <= this._expirationCheckIntervalMs) {
            return [];
        }

        const messagesToSend: TimeoutTransferCmd[] = [];
        const timerEndFn = this._histo.startTimer({callName: "batchMsgHandler_checkTimeouts"});
        this._logger.isDebugEnabled() && this._logger.debug(`Getting expired transfers at ${new Date().toISOString()}...`);

        try {
            const expiredTransferIds: string[] = await this._timeoutAdapter.getOlderThan();
            if (expiredTransferIds.length <= 0) {
                this._logger.debug("No expired transfers found");
                return [];
            }

            this._logger.isDebugEnabled() && this._logger.info(`Got ${expiredTransferIds.length} expired transfers`);

            for (const id of expiredTransferIds) {
                messagesToSend.push(new TimeoutTransferCmd({transferId: id}));
            }

            this._logger.info(`${expiredTransferIds} expired transfers found and timeout commands sent`);
        }catch(error:unknown){
            if(error instanceof Error) {
                this._logger.error(error);
            }else{
                this._logger.error(`Unable to get expired tranafers from redis - ${Object(error).toString()}`);
            }
        }

        timerEndFn({success: "true"});
        this._expirationControlLoopRunning = false;
        return messagesToSend;
    }

    private _recordMetricsFromContext(msgName:string, context:Context){
        const baggage = OpentelemetryApi.propagation.getBaggage(context);
        if(!baggage) return;

        const now = Date.now();
        const startTsBabbageValue = baggage.getEntry(TRACING_REQ_START_TS_HEADER_NAME)?.value;
        const startTs = startTsBabbageValue ? parseInt(startTsBabbageValue) : undefined;
        const respTsBabbageValue = baggage.getEntry(TRACING_RESP_START_TS_HEADER_NAME)?.value;
        const respTs = respTsBabbageValue ? parseInt(respTsBabbageValue) : undefined;

        if(msgName === TransferPrepareRequestedEvt.name && startTs){
            this._transferDurationHisto.observe({"leg": "prepare"}, now - startTs);
        }else if(msgName === TransferFulfilRequestedEvt.name && respTs ){
            this._transferDurationHisto.observe({"leg": "fulfil"}, now - respTs);
            if(startTs){
                this._transferDurationHisto.observe({"leg": "total"}, now - startTs);
            }
        }
    }

    private _getCmdFromEvent(message: IMessage): CommandMsg | null {
        if (message.msgName === TransferPrepareRequestedEvt.name) {
            const transferCmd = this._prepareEventToPrepareCommand(message as TransferPrepareRequestedEvt);
            return transferCmd;
        } else if (message.msgName === TransferFulfilRequestedEvt.name) {
            const transferCmd = this._fulfilEventToFulfilCommand(message as TransferFulfilRequestedEvt);
            return transferCmd;
        } else if (message.msgName === TransferRejectRequestedEvt.name) {
            const transferCmd = this._prepareEventToRejectCommand(message as TransferRejectRequestedEvt);
            return transferCmd;
        } else if (message.msgName === TransferQueryReceivedEvt.name) {
            const transferCmd = this._prepareEventToQueryCommand(message as TransferQueryReceivedEvt);
            return transferCmd;
        // } else if (message.msgName === TransferTimeoutEvt.name) {
        //     const transferCmd = this._prepareEventToTimeoutCommand(message as TransferTimeoutEvt);
        //     return transferCmd;
        } else if (message.msgName === BulkTransferPrepareRequestedEvt.name) {
            const transferCmd = this._prepareEventToPrepareBulkCommand(message as BulkTransferPrepareRequestedEvt);
            return transferCmd;
        } else if (message.msgName === BulkTransferFulfilRequestedEvt.name) {
            const transferCmd = this._fulfilEventToFulfilBulkCommand(message as BulkTransferFulfilRequestedEvt);
            return transferCmd;
        } else if (message.msgName === BulkTransferRejectRequestedEvt.name) {
            const transferCmd = this._prepareEventToRejectBulkCommand(message as BulkTransferRejectRequestedEvt);
            return transferCmd;
        } else if (message.msgName === BulkTransferQueryReceivedEvt.name) {
            const transferCmd = this._prepareEventToQueryBulkCommand(message as BulkTransferQueryReceivedEvt);
            return transferCmd;
        } else {
            // ignore silently what we don't handle
            return null;
        }

    }

    private _prepareEventToPrepareCommand(evt: TransferPrepareRequestedEvt): PrepareTransferCmd {
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
            prepare: evt.fspiopOpaqueState,
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
            prepare: evt.fspiopOpaqueState
        };
        const cmd = new CommitTransferFulfilCmd(cmdPayload);
        cmd.fspiopOpaqueState = evt.fspiopOpaqueState;
        return cmd;
    }

    private _prepareEventToRejectCommand(evt: TransferRejectRequestedEvt): RejectTransferCmd {
        const cmdPayload: RejectTransferCmdPayload = {
            transferId: evt.payload.transferId,
            errorInformation: evt.payload.errorInformation,
            prepare: evt.fspiopOpaqueState
        };
        const cmd = new RejectTransferCmd(cmdPayload);
        cmd.fspiopOpaqueState = evt.fspiopOpaqueState;
        return cmd;
    }

    private _prepareEventToQueryCommand(evt: TransferQueryReceivedEvt): QueryTransferCmd {
        const cmdPayload: QueryTransferCmdPayload = {
            transferId: evt.payload.transferId,
            prepare: evt.fspiopOpaqueState
        };
        const cmd = new QueryTransferCmd(cmdPayload);
        cmd.fspiopOpaqueState = evt.fspiopOpaqueState;
        return cmd;
    }

/*    private _prepareEventToTimeoutCommand(evt: TransferTimeoutEvt): TimeoutTransferCmd {
        const cmdPayload: TimeoutTransferCmdPayload = {
            transferId: evt.payload.transferId,
            timeout: evt.fspiopOpaqueState
        };
        const cmd = new TimeoutTransferCmd(cmdPayload);
        cmd.fspiopOpaqueState = evt.fspiopOpaqueState;
        return cmd;
    }*/

    private _prepareEventToPrepareBulkCommand(evt: BulkTransferPrepareRequestedEvt): PrepareBulkTransferCmd {
        const cmdPayload: PrepareBulkTransferCmdPayload = {
            bulkTransferId: evt.payload.bulkTransferId,
            bulkQuoteId: evt.payload.bulkQuoteId,
            payerFsp: evt.payload.payerFsp,
            payeeFsp: evt.payload.payeeFsp,
            individualTransfers: evt.payload.individualTransfers,
            expiration: evt.payload.expiration,
            extensionList: evt.payload.extensionList,
            prepare: evt.fspiopOpaqueState

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
            prepare: evt.fspiopOpaqueState
        };
        const cmd = new CommitBulkTransferFulfilCmd(cmdPayload);
        cmd.fspiopOpaqueState = evt.fspiopOpaqueState;
        return cmd;
    }

    private _prepareEventToRejectBulkCommand(evt: BulkTransferRejectRequestedEvt): RejectBulkTransferCmd {
        const cmdPayload: RejectBulkTransferCmdPayload = {
            bulkTransferId: evt.payload.bulkTransferId,
            errorInformation: evt.payload.errorInformation,
            prepare: evt.fspiopOpaqueState
        };
        const cmd = new RejectBulkTransferCmd(cmdPayload);
        cmd.fspiopOpaqueState = evt.fspiopOpaqueState;
        return cmd;
    }

    private _prepareEventToQueryBulkCommand(evt: BulkTransferQueryReceivedEvt): QueryBulkTransferCmd {
        const cmdPayload: QueryBulkTransferCmdPayload = {
            bulkTransferId: evt.payload.bulkTransferId,
            prepare: evt.fspiopOpaqueState
        };
        const cmd = new QueryBulkTransferCmd(cmdPayload);
        cmd.fspiopOpaqueState = evt.fspiopOpaqueState;
        return cmd;
    }

    async stop(): Promise<void> {
        if(this._expirationSendEvtNodeTimeout) clearInterval(this._expirationSendEvtNodeTimeout);
        await this._messageConsumer.stop();
        await this._timeoutAdapter.destroy();
    }
}
