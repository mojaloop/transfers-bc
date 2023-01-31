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
import {IMessage,IMessageConsumer, IMessageProducer, DomainEventMsg, CommandMsg} from "@mojaloop/platform-shared-lib-messaging-types-lib";
import {
	TransfersBCTopics,
	TransferPrepareRequestedEvt,
	TransferFulfilCommittedRequestedEvt
} from "@mojaloop/platform-shared-lib-public-messages-lib";
import {PrepareTransferCmd, PrepareTransferCmdPayload, TransferFulfilCommittedCmd} from "@mojaloop/transfers-bc-domain-lib";

export class TransfersEventHandler{
	private _logger: ILogger;
	private _auditClient: IAuditClient;
	private _messageConsumer: IMessageConsumer;
	private _messageProducer: IMessageProducer;

	constructor(logger: ILogger, auditClient:IAuditClient, messageConsumer: IMessageConsumer, messageProducer: IMessageProducer) {
		this._logger = logger.createChild(this.constructor.name);
		this._auditClient = auditClient;
		this._messageConsumer = messageConsumer;
		this._messageProducer = messageProducer;
	}

	async start():Promise<void>{
		// connect the producer
		await this._messageProducer.connect();

		// create and start the consumer handler
		this._messageConsumer.setTopics([TransfersBCTopics.DomainRequests]);

		this._messageConsumer.setCallbackFn(this._msgHandler.bind(this));
		await this._messageConsumer.connect();
		await this._messageConsumer.start();
	}

	private async _msgHandler(message: IMessage): Promise<void>{
		return await new Promise<void>(async (resolve) => {
			//this._logger.debug(`Got message in handler: ${JSON.stringify(message, null, 2)}`);
			console.log("Got message in handler");
			try {
				//let transferEvt: DomainEventMsg | undefined;
				let transferCmd: CommandMsg | null = null;

				switch (message.msgName) {
					case TransferPrepareRequestedEvt.name:
						//const payload: PrepareTransferCmdPayload = message.payload;
						transferCmd = new PrepareTransferCmd(message.payload);
						transferCmd.fspiopOpaqueState = message.fspiopOpaqueState;
						break;

					case TransferFulfilCommittedRequestedEvt.name:
						//const payload: PrepareTransferCmdPayload = message.payload;
						transferCmd = new TransferFulfilCommittedCmd(message.payload);
						transferCmd.fspiopOpaqueState = message.fspiopOpaqueState;
						break;

					default: {
						//this._logger.isWarnEnabled() && this._logger.warn(`TransfersEventHandler - processing event - ${message?.msgName}:${message?.msgKey}:${message?.msgId} (name:key:id) - Skipping unknown event`);
						console.log("TransfersEventHandler - Skipping event");
					}
				}

				if (transferCmd) {
					//this._logger.info(`TransfersEventHandler - publishing cmd - ${message?.msgName}:${message?.msgKey}:${message?.msgId} - Cmd: ${transferCmd.msgName}:${transferCmd.msgId}`);
					console.log("TransfersEventHandler - publishing cmd");
					await this._messageProducer.send(transferCmd);
					console.log("TransfersEventHandler - publishing cmd Finished");
					// this._logger.info(`TransfersEventHandler - publishing cmd Finished - ${message?.msgName}:${message?.msgKey}:${message?.msgId}`);
				}
			}catch(err:any){
				this._logger.error(err, `TransfersEventHandler - processing event - ${message?.msgName}:${message?.msgKey}:${message?.msgId} - Error: ${err?.message?.toString()}`);
			}finally {
				resolve();
			}
		});
	}

	async stop():Promise<void>{
		await this._messageConsumer.stop();
	}
}