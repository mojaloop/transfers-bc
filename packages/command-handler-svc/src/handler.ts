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
    MessageTypes
} from "@mojaloop/platform-shared-lib-messaging-types-lib";
import {TransfersBCTopics} from "@mojaloop/platform-shared-lib-public-messages-lib";
import {IGauge, IHistogram, IMetrics} from "@mojaloop/platform-shared-lib-observability-types-lib";

import {
    TransfersAggregate
} from "@mojaloop/transfers-bc-domain-lib";

export class TransfersCommandHandler{
	private readonly _logger: ILogger;
    private _auditClient: IAuditClient;
    private _messageConsumer: IMessageConsumer;
    private _transfersAgg: TransfersAggregate;
    private _histo:IHistogram;
    private _batchSizeGauge:IGauge;


    private _processingCount = 0;

    constructor(
        logger: ILogger, auditClient:IAuditClient, messageConsumer: IMessageConsumer,
        metrics:IMetrics, transfersAgg: TransfersAggregate
    ) {
		this._logger = logger.createChild(this.constructor.name);
		this._auditClient = auditClient;
		this._messageConsumer = messageConsumer;
		this._transfersAgg = transfersAgg;

        this._histo = metrics.getHistogram("TransfersCommandHandler_Calls", "TransfersCommandHandler calls", ["callName", "success"]);
        this._batchSizeGauge = metrics.getGauge("TransfersCommandHandler_batchSize");
	}

	async start():Promise<void>{
		// create and start the consumer handler
        this._messageConsumer.setTopics([TransfersBCTopics.DomainCommands]);
        this._messageConsumer.setBatchCallbackFn(this._batchMsgHandler.bind(this));
        await this._messageConsumer.connect();
        await this._messageConsumer.startAndWaitForRebalance();
	}

    private async _batchMsgHandler(receivedMessages: IMessage[]): Promise<void>{
        const startTime = Date.now();
        const timerEndFn = this._histo.startTimer({callName: "batchMsgHandler"});

        try {
            this._logger.isDebugEnabled() && this._logger.debug(`Got message batch in TransfersCommandHandler batch size: ${receivedMessages.length}`);
            this._batchSizeGauge.set(receivedMessages.length);

            this._processingCount++;
            if (this._processingCount > 1) {
                this._logger.warn("WARNING - Processing more than one _batchMsgHandler at a time - this shouldn't happen");
            }

            // filter out non-commands
            // note: to remove when we have a dedicated command topic
            receivedMessages = receivedMessages.filter(msg => msg.msgType === MessageTypes.COMMAND);

            if (receivedMessages.length > 0) {
                await this._transfersAgg.processCommandBatch(receivedMessages as CommandMsg[]);
            }

            timerEndFn({success: "true"});
        }catch (err){
            timerEndFn({success: "false"});
            const error = (err as Error);
            this._logger.error(err, `TransfersCommandHandler - failed processing batch - Error: ${error.message || error.toString()}`);

            // Don't suppress the exception - find proper exception but make sure the app dies if not handled
            // TODO: send error to error Topic, only throw if we can't continue
            throw error;
        }finally {
            this._processingCount--;
            this._logger.isDebugEnabled() && this._logger.debug(`  Completed batch in TransfersCommandHandler batch size: ${receivedMessages.length}`);
            this._logger.isDebugEnabled() && this._logger.debug(`  Took: ${Date.now() - startTime} ms \n\n`);
        }
    }

	async stop():Promise<void>{
		await this._messageConsumer.stop();
	}

}
