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
    TransferFulfilCommittedRequestedEvt,
    TransferPrepareRequestedEvt,
    TransfersBCTopics
} from "@mojaloop/platform-shared-lib-public-messages-lib";
import {CommitTransferFulfilCmd, PrepareTransferCmd,} from "@mojaloop/transfers-bc-domain-lib";
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
		this._messageConsumer.setTopics([TransfersBCTopics.DomainRequests, TransfersBCTopics.DomainEvents]);

		// this._messageConsumer.setCallbackFn(this._msgHandler.bind(this));
        this._messageConsumer.setBatchCallbackFn(this._batchMsgHandler.bind(this));
        await this._messageConsumer.connect();
        await this._messageConsumer.startAndWaitForRebalance();
    }

    private async _batchMsgHandler(receivedMessages: IMessage[]): Promise<void>{
        return await new Promise<void>(async (resolve) => {
            console.log(`Got message batch in TransfersEventHandler batch size: ${receivedMessages.length}`);
            this._batchSizeGauge.set(receivedMessages.length);

            const startTime = Date.now();
            const timerEndFn = this._histo.startTimer({ callName: "batchMsgHandler"});

            try{
                const outputCommands:CommandMsg[] = [];
                for(const message of receivedMessages){
                    if(message.msgType!=MessageTypes.DOMAIN_EVENT) continue;

                    let transferCmd: CommandMsg | null = this._getCmdFromEvent(message);
                    if(transferCmd) {
                        outputCommands.push(transferCmd)
                        this._eventsCounter.inc({eventName: message.msgName}, 1);
                    }

                    // metrics
                    if(!message.fspiopOpaqueState) continue;
                    const now = Date.now();
                    if(message.msgName === "TransferPreparedEvt" && message.fspiopOpaqueState.prepareSendTimestamp){
                        this._transferDurationHisto.observe({"leg": "prepare"}, now - message.fspiopOpaqueState.prepareSendTimestamp);
                    }else if(message.msgName === "TransferCommittedFulfiledEvt" && message.fspiopOpaqueState.committedSendTimestamp ){
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
            }catch(err: any){
                this._logger.error(err, `TransfersEventHandler - failed processing batch - Error: ${err.message || err.toString()}`);
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
            // TODO: use this._prepareEventToPrepareCommand() to properly create the cmd from the event (cast is not allowed)
            //const payload: PrepareTransferCmdPayload = message.payload;
            const transferCmd = new PrepareTransferCmd(message.payload);
            transferCmd.fspiopOpaqueState = message.fspiopOpaqueState;
            transferCmd.msgKey = message.payload.transferId;
            return transferCmd;
        }else if(message.msgName === TransferFulfilCommittedRequestedEvt.name){
            // TODO: use this._fulfilEventToFulfilCommand() to properly create the cmd from the event (cast is not allowed)
            //const payload: PrepareTransferCmdPayload = message.payload;
            const transferCmd = new CommitTransferFulfilCmd(message.payload);
            transferCmd.fspiopOpaqueState = message.fspiopOpaqueState;
            transferCmd.msgKey = message.payload.transferId;
            return transferCmd;
        }else{
            // ignore silently what we don't handle
            return null;
        }

    }

	async stop():Promise<void>{
		await this._messageConsumer.stop();
	}
}
