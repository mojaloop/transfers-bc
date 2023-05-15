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
import {IMessage,IMessageConsumer, CommandMsg} from "@mojaloop/platform-shared-lib-messaging-types-lib";
import {TransfersBCTopics} from "@mojaloop/platform-shared-lib-public-messages-lib";

import {
	PrepareTransferCmd,
	TransfersAggregate,
	CommitTransferFulfilCmd,
	RejectTransferCmd,
	QueryTransferCmd
} from "@mojaloop/transfers-bc-domain-lib";

export class TransfersCommandHandler{
	private _logger: ILogger;
	private _auditClient: IAuditClient;
	private _messageConsumer: IMessageConsumer;
	private _transfersAgg: TransfersAggregate;

    constructor(logger: ILogger, auditClient:IAuditClient, messageConsumer: IMessageConsumer, transfersAgg: TransfersAggregate) {
		this._logger = logger.createChild(this.constructor.name);
		this._auditClient = auditClient;
		this._messageConsumer = messageConsumer;
		this._transfersAgg = transfersAgg;
	}

	async start():Promise<void>{
		// create and start the consumer handler
		this._messageConsumer.setTopics([TransfersBCTopics.DomainRequests]);

		this._messageConsumer.setCallbackFn(this._msgHandler.bind(this));
		await this._messageConsumer.connect();
		await this._messageConsumer.start();
	}

	private async _msgHandler(message: IMessage): Promise<void>{
		// eslint-disable-next-line no-async-promise-executor
		return await new Promise<void>(async (resolve) => {
			this._logger.debug(`Got message in TransfersCommandHandler with name: ${message.msgName}`);
			try {

				// send to aggregate handler
				switch (message.msgName) {
					case PrepareTransferCmd.name:
					case CommitTransferFulfilCmd.name:
					case RejectTransferCmd.name:
					case QueryTransferCmd.name: {
						await this._transfersAgg.processCommand(message as CommandMsg);
						break;
					}
					default: {
						this._logger.isWarnEnabled() && this._logger.warn(`TransfersCommandHandler - unknown command - msgName: ${message?.msgName} msgKey: ${message?.msgKey} msgId: ${message?.msgId}`);
					}
				}

			}catch(err: unknown){
				this._logger.error(err, `TransfersCommandHandler - processing command - ${message?.msgName}:${message?.msgKey}:${message?.msgId} - Error: ${(err as Error)?.message?.toString()}`);
			}finally {
				resolve();
			}
		});
	}

	async stop():Promise<void>{
		await this._messageConsumer.stop();
	}

}