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
import {IMessage,IMessageConsumer, IMessageProducer, CommandMsg} from "@mojaloop/platform-shared-lib-messaging-types-lib";
import {
	TransfersBCTopics,
	TransferPrepareRequestedEvt,
	TransferFulfilCommittedRequestedEvt,
	TransferRejectRequestedEvt,
	TransferQueryReceivedEvt
} from "@mojaloop/platform-shared-lib-public-messages-lib";
import {
	CommitTransferFulfilCmd,
	CommitTransferFulfilCmdPayload,
	PrepareTransferCmd,
	PrepareTransferCmdPayload,
	RejectTransferCmd,
	RejectTransferCmdPayload,
	QueryTransferCmd,
	QueryTransferCmdPayload
} from "@mojaloop/transfers-bc-domain-lib";

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
		// eslint-disable-next-line no-async-promise-executor
		return await new Promise<void>(async (resolve) => {
			this._logger.debug(`Got message in TransfersEventHandler with name: ${message.msgName}`);
			try {
				//let transferEvt: DomainEventMsg | undefined;
				let transferCmd: CommandMsg | null = null;

				switch (message.msgName) {
					case TransferPrepareRequestedEvt.name:
						transferCmd = this._prepareEventToPrepareCommand(message as TransferPrepareRequestedEvt);
						break;

					case TransferFulfilCommittedRequestedEvt.name:
						transferCmd = this._fulfilEventToFulfilCommand(message as TransferFulfilCommittedRequestedEvt);
						break;

					case TransferRejectRequestedEvt.name:
						transferCmd = this._prepareEventToRejectCommand(message as TransferRejectRequestedEvt);
						break;

					case TransferQueryReceivedEvt.name:
						transferCmd = this._prepareEventToQueryCommand(message as TransferQueryReceivedEvt);
						break;

					default: {
						this._logger.isWarnEnabled() && this._logger.warn(`TransfersEventHandler - Skipping unknown event - msgName: ${message?.msgName} msgKey: ${message?.msgKey} msgId: ${message?.msgId}`);
					}
				}

				if (transferCmd) {
					this._logger.info(`TransfersEventHandler - publishing cmd - ${message?.msgName}:${message?.msgKey}:${message?.msgId} - Cmd: ${transferCmd.msgName}:${transferCmd.msgId}`);
					await this._messageProducer.send(transferCmd);
					this._logger.info(`TransfersEventHandler - publishing cmd Finished - ${message?.msgName}:${message?.msgKey}:${message?.msgId}`);
				}
			}catch(err: unknown){
				this._logger.error(err, `TransfersEventHandler - processing event - ${message?.msgName}:${message?.msgKey}:${message?.msgId} - Error: ${(err as Error)?.message?.toString()}`);
			}finally {
				resolve();
			}
		});
	}

	private _prepareEventToPrepareCommand(evt: TransferPrepareRequestedEvt): PrepareTransferCmd{
		const cmdPayload: PrepareTransferCmdPayload = {
			transferId: evt.payload.transferId,
			amount: evt.payload.amount,
			currencyCode: evt.payload.currencyCode,
			payerFsp: evt.payload.payerFsp,
			payeeFsp: evt.payload.payeeFsp,
			ilpPacket: evt.payload.ilpPacket,
			expiration: evt.payload.expiration as unknown as string,
			condition: evt.payload.condition,
			prepare: evt.fspiopOpaqueState
		};
		const cmd = new PrepareTransferCmd(cmdPayload);
		cmd.fspiopOpaqueState = evt.fspiopOpaqueState;
		return cmd;
	}

	private _fulfilEventToFulfilCommand(evt: TransferFulfilCommittedRequestedEvt): CommitTransferFulfilCmd {
		const cmdPayload: CommitTransferFulfilCmdPayload = {
			transferId: evt.payload.transferId,
			transferState: evt.payload.transferState,
			fulfilment: evt.payload.fulfilment,
			completedTimestamp: evt.payload.completedTimestamp,
			extensionList: evt.payload.extensionList,
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

	async stop():Promise<void>{
		await this._messageConsumer.stop();
	}
}