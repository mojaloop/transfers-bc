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
import {CommandMsg, IMessage, IMessageConsumer, MessageTypes} from "@mojaloop/platform-shared-lib-messaging-types-lib";
import {TransfersBCTopics} from "@mojaloop/platform-shared-lib-public-messages-lib";
import {ICounter, IGauge, IHistogram, IMetrics} from "@mojaloop/platform-shared-lib-observability-types-lib";

import {TransfersAggregate} from "@mojaloop/transfers-bc-domain-lib";

export class TransfersCommandHandler{
	private _logger: ILogger;
	private _auditClient: IAuditClient;
	private _messageConsumer: IMessageConsumer;
	private _transfersAgg: TransfersAggregate;
    private _histo:IHistogram;
    private _batchSizeGauge:IGauge;

    constructor(logger: ILogger, auditClient:IAuditClient, messageConsumer: IMessageConsumer, metrics:IMetrics, transfersAgg: TransfersAggregate) {
		this._logger = logger.createChild(this.constructor.name);
		this._auditClient = auditClient;
		this._messageConsumer = messageConsumer;
		this._transfersAgg = transfersAgg;

        this._histo = metrics.getHistogram("TransfersCommandHandler_Calls", "TransfersCommandHandler calls", ["callName", "success"]);
        this._batchSizeGauge = metrics.getGauge("TransfersCommandHandler_batchSize");
	}

	async start():Promise<void>{
		// create and start the consumer handler
        this._messageConsumer.setTopics([TransfersBCTopics.DomainRequests]);
        this._messageConsumer.setBatchCallbackFn(this._batchMsgHandler.bind(this));
        await this._messageConsumer.connect();
        await this._messageConsumer.startAndWaitForRebalance();
	}

    private async _batchMsgHandler(receivedMessages: IMessage[]): Promise<void>{
        return await new Promise<void>(async (resolve) => {
            const startTime = Date.now();
            const timerEndFn = this._histo.startTimer({ callName: "batchMsgHandler"});

            console.log(`Got message batch in TransfersCommandHandler batch size: ${receivedMessages.length}`);
            this._batchSizeGauge.set(receivedMessages.length);

            try{
                await this._transfersAgg.processCommandBatch(receivedMessages as CommandMsg[]);
            }catch(err: any){
                this._logger.error(err, `TransfersCommandHandler - failed processing batch - Error: ${err.message || err.toString()}`);
                // TODO Don't suppress the exception - find proper exception but make sure the app dies
                throw err;
            }finally {
                timerEndFn({ success: "true" });
                console.log(`  Completed batch in TransfersCommandHandler batch size: ${receivedMessages.length}`);
                console.log(`  Took: ${Date.now()-startTime}`);
                console.log("\n\n");
                resolve();
            }
        });
    }

/*    private async _msgHandler_OLD(message: IMessage): Promise<void>{
		// eslint-disable-next-line no-async-promise-executor
		return await new Promise<void>(async (resolve) => {
            if(message.msgType!=MessageTypes.COMMAND){
                return resolve();
            }

            this._logger.debug(`Got message in TransfersCommandHandler with name: ${message.msgName}`);
            const timerEndFn = this._histo.startTimer();
			try {

				switch (message.msgName) {
					case PrepareTransferCmd.name:
						// send to aggregate handler
						await this._transfersAgg.handleTransferCommand(message as CommandMsg);
						break;
					case CommitTransferFulfilCmd.name:
						// send to aggregate handler
						await this._transfersAgg.handleTransferCommand(message as CommandMsg);
						break;
					default: {
						this._logger.isWarnEnabled() && this._logger.warn(`TransfersCommandHandler - unknown command - msgName: ${message?.msgName} msgKey: ${message?.msgKey} msgId: ${message?.msgId}`);
					}
				}

                timerEndFn({ commandName: message.msgName, success: "true" });
			}catch(err: unknown){
				this._logger.error(err, `TransfersCommandHandler - processing command - ${message?.msgName}:${message?.msgKey}:${message?.msgId} - Error: ${(err as Error)?.message?.toString()}`);
                timerEndFn({ commandName: message.msgName, success: "false" });
			}finally {
				resolve();
			}
		});
	}*/

	async stop():Promise<void>{
		await this._messageConsumer.stop();
	}

}
