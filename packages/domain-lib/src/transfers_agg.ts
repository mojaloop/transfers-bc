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
import {IMessageProducer, CommandMsg} from "@mojaloop/platform-shared-lib-messaging-types-lib";
import { TransferPreparedEvt, TransferPreparedEvtPayload, TransferPrepareRequestedEvt } from "@mojaloop/platform-shared-lib-public-messages-lib";
import {PrepareTransferCmdPayload, PrepareTransferCmd} from "@mojaloop/transfers-bc-domain-lib";
import { InvalidMessageTypeError, InvalidParticipantIdError, NoSuchParticipantError, RequiredParticipantIsNotActive, UnableToProcessMessageError } from "./errors";
import {IParticipantService, ITransfersRepository} from "./interfaces/infrastructure";
import { ITransfer } from "./types";

export class TransfersAggregate{
	private _logger: ILogger;
	private _auditClient: IAuditClient;
	private _transfersRepo: ITransfersRepository;
	private _messageProducer: IMessageProducer;
	private readonly _participantService: IParticipantService;

	constructor(
		logger: ILogger,
		participantService: IParticipantService
	) {
		this._logger = logger.createChild(this.constructor.name);
		this._participantService = participantService;
	}

	async init():Promise<void>{
		// TODO
	}

	async processCommand(command: CommandMsg){
		// switch command type and call specific private method
		
		let eventToPublish = null;

		switch(command.msgName){
			case PrepareTransferCmd.name:
				eventToPublish = await this.transferPreparedReceivedEvt(command as TransferPrepareRequestedEvt);
				break;
			default:				
				this._logger.error(`message type has invalid format or value ${command.msgName}`);
				throw new InvalidMessageTypeError();
			}

		if(eventToPublish){
			if(Array.isArray(eventToPublish)){
				for await (const event of eventToPublish){
					await this._messageProducer.send(event);
				}
			}else {
				await this._messageProducer.send(eventToPublish);
			}
		}else{
			throw new UnableToProcessMessageError();
		}

	}

	private async transferPreparedReceivedEvt(message: TransferPrepareRequestedEvt):Promise<TransferPreparedEvt> {
		this._logger.debug(`Got transferPreparedReceivedEvt msg for transferId: ${message.payload.transferId}`);

		await this.validateParticipant(message.payload.payeeFsp);
		await this.validateParticipant(message.payload.payerFsp);

		const transfer: ITransfer = {
			transferId: message.payload.transferId,
			payeeFsp: message.payload.transferId,
			payerFsp: message.payload.transferId,
			amount: message.payload.transferId,
			ilpPacket: message.payload.transferId,
			condition: message.payload.transferId,
			expiration: message.payload.expiration,
			extensionList: message.payload.extensionList
		};

		await this._transfersRepo.addTransfer(transfer);

		const payload : TransferPreparedEvtPayload = {
			transferId: message.payload.transferId,
			payeeFsp: message.payload.transferId,
			payerFsp: message.payload.transferId,
			amount: message.payload.transferId,
			ilpPacket: message.payload.transferId,
			condition: message.payload.transferId,
			expiration: message.payload.expiration,
			extensionList: message.payload.extensionList
		};

		const event = new TransferPreparedEvt(payload);

		event.fspiopOpaqueState = message.fspiopOpaqueState;

		return event;

	}

	private async validateParticipant(participantId: string | null):Promise<void>{
		if(participantId){
			const participant = await this._participantService.getParticipantInfo(participantId);

			if(!participant) {
				this._logger.debug(`No participant found`);
				throw new NoSuchParticipantError();
			}

			if(participant.id !== participantId){
				this._logger.debug(`Participant id mismatch ${participant.id} ${participantId}`);
				throw new InvalidParticipantIdError();
			}

			if(!participant.isActive) {
				this._logger.debug(`${participant.id} is not active`);
				throw new RequiredParticipantIsNotActive();
			}
		}

		return;
	}
}