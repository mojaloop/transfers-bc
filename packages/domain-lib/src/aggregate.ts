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

 * Arg Software
 - José Antunes <jose.antunes@arg.software>
 - Rui Rocha <rui.rocha@arg.software>

 --------------
 ******/

"use strict";

const HUB_ID = "hub"; // move to shared lib

import Crypto from 'crypto';
import {IAuditClient} from "@mojaloop/auditing-bc-public-types-lib";
import {ILogger} from "@mojaloop/logging-bc-public-types-lib";
import {CommandMsg, IMessageProducer, MessageTypes} from "@mojaloop/platform-shared-lib-messaging-types-lib";
import {
	TransferCommittedFulfiledEvt,
	TransferCommittedFulfiledEvtPayload,
	TransferFulfilCommittedRequestedEvt,
	TransferPreparedEvt,
	TransferPreparedEvtPayload,
	TransferPrepareRequestedEvt,
	TransferRejectRequestedEvt,
	TransferRejectRequestProcessedEvt,
	TransferRejectRequestProcessedEvtPayload,
	TransferQueryReceivedEvt,
	TransferQueryResponseEvt,
	TransferQueryResponseEvtPayload,
	TransferInvalidMessagePayloadEvt,
	TransferInvalidMessageTypeEvt,
	TransfersBCUnknownErrorEvent,
	TransferUnableToGetParticipantsInfoEvt,
	TransferPrepareInvalidPayerCheckFailedEvt,
	TransferPrepareInvalidPayeeCheckFailedEvt,
	TransferUnableToAddEvt,
	TransferUnableToUpdateEvt,
	TransferQueryInvalidPayeeParticipantIdEvt,
	TransferQueryPayeeNotFoundFailedEvt,
	TransferQueryPayerNotFoundFailedEvt,
	TransferQueryInvalidPayerParticipantIdEvt,
	TransferQueryInvalidPayerCheckFailedEvt,
	TransferPrepareLiquidityCheckFailedEvt,
	TransferUnableToGetTransferByIdEvt,
	TransferNotFoundEvt,
	TransferDuplicateCheckFailedEvt,
	TransferPayerNotFoundFailedEvt,
	TransferPayeeNotFoundFailedEvt,
	TransferHubNotFoundFailedEvt,
	TransferPayerNotApprovedEvt,
	TransferPayeeNotApprovedEvt,
	TransferHubAccountNotFoundFailedEvt,
	TransferPayerPositionAccountNotFoundFailedEvt,
	TransferPayerLiquidityAccountNotFoundFailedEvt,
	TransferPayeePositionAccountNotFoundFailedEvt,
	TransferPayeeLiquidityAccountNotFoundFailedEvt,
	TransferCancelReservationFailedEvt,
	TransferPrepareRequestTimedoutEvt,
	TransferFulfilCommittedRequestedTimedoutEvt,
	TransferFulfilPostCommittedRequestedTimedoutEvt,
	TransferQueryInvalidPayeeCheckFailedEvt,
	TransferCancelReservationAndCommitFailedEvt
} from "@mojaloop/platform-shared-lib-public-messages-lib";
import {
	PrepareTransferCmd,
	CommitTransferFulfilCmd,
	RejectTransferCmd,
	QueryTransferCmd
} from "./commands";
import {IAccountsBalancesAdapter} from "./interfaces/infrastructure";
import {IParticipantsServiceAdapter, ITransfersRepository} from "./interfaces/infrastructure";
import {
	AccountType,
	ITransfer,
	ITransferAccounts,
	ITransferParticipants,
	TransferErrorEvent,
	TransferState
} from "./types";
import { IParticipant, IParticipantAccount } from "@mojaloop/participant-bc-public-types-lib";

export class TransfersAggregate{
	private _logger: ILogger;
	private _auditClient: IAuditClient;
	private _transfersRepo: ITransfersRepository;
	private _messageProducer: IMessageProducer;
	private _participantAdapter: IParticipantsServiceAdapter;
	private _accountAndBalancesAdapter: IAccountsBalancesAdapter;

	constructor(
		logger: ILogger,
		transfersRepo:ITransfersRepository,
		participantsServiceAdapter: IParticipantsServiceAdapter,
		messageProducer: IMessageProducer,
		accountAndBalancesAdapter: IAccountsBalancesAdapter
	) {
		this._logger = logger.createChild(this.constructor.name);
		this._transfersRepo = transfersRepo;
		this._participantAdapter = participantsServiceAdapter;
		this._messageProducer = messageProducer;
		this._accountAndBalancesAdapter = accountAndBalancesAdapter;

	}

	async init():Promise<void>{
		// TODO
		//await this._messageProducer.connect();
	}

	//#region Command Handlers
	async processCommand(command: CommandMsg){
		// switch command type and call specific private method

		this._logger.debug(`Got command in Transfers handler - msg: ${command}`);
		const requesterFspId = command.fspiopOpaqueState?.requesterFspId;
		const transferId = command.payload?.transferId;
		const eventMessage = this.validateMessageOrGetErrorEvent(command);
		let commandEvt = null;
		let eventToPublish = null;

		if(eventMessage) {
			const errorEvent = eventMessage;
			errorEvent.fspiopOpaqueState = command.fspiopOpaqueState;
			await this.publishEvent(errorEvent);
			return;
		}

		try {
			switch(command.msgName) {
				case PrepareTransferCmd.name:
					commandEvt = new TransferPrepareRequestedEvt(command.payload);
					commandEvt.fspiopOpaqueState = command.fspiopOpaqueState;

					eventToPublish = await this.prepareTransfer(commandEvt);
					break;
				case CommitTransferFulfilCmd.name:
					commandEvt = new TransferFulfilCommittedRequestedEvt(command.payload);
					commandEvt.fspiopOpaqueState = command.fspiopOpaqueState;

					eventToPublish = await this.fulfilTransfer(commandEvt);
					break;
				case RejectTransferCmd.name:
					commandEvt = new TransferRejectRequestedEvt(command.payload);
					commandEvt.fspiopOpaqueState = command.fspiopOpaqueState;

					eventToPublish = await this.rejectTransfer(commandEvt);
					break;
				case QueryTransferCmd.name:
					commandEvt = new TransferQueryReceivedEvt(command.payload);
					commandEvt.fspiopOpaqueState = command.fspiopOpaqueState;

					eventToPublish = await this.queryTransfer(commandEvt);
					break;
				default: {
					const errorMessage = `Message type has invalid format or value ${command.msgName}`;
					this._logger.error(errorMessage);
					eventToPublish = new TransferInvalidMessageTypeEvt({
						transferId: transferId,
						payerFspId: requesterFspId,
						errorDescription: errorMessage
					});
					eventToPublish.fspiopOpaqueState = command.fspiopOpaqueState;
				}
			}
		} catch(err: unknown) {
			const error = (err as Error).message;
			const errorMessage = `Error while handling message ${command.msgName}`;
			this._logger.error(err, `${errorMessage}: ${error}`);
			eventToPublish = new TransfersBCUnknownErrorEvent({
				transferId,
				payerFspId: requesterFspId,
				errorDescription: errorMessage
			});
			eventToPublish.fspiopOpaqueState = command.fspiopOpaqueState;
			await this.publishEvent(eventToPublish);
		}

		// The eventToPublish might be void due to the possibility of a repeated transfer request
		// where we don't want to publish an event and ignore the request
		if(eventToPublish) {
			eventToPublish.fspiopOpaqueState = command.fspiopOpaqueState;
			await this.publishEvent(eventToPublish);
		}
	}

	private async publishEvent(eventToPublish: TransferPreparedEvt | TransferCommittedFulfiledEvt | TransferQueryResponseEvt | TransferRejectRequestProcessedEvt | TransferErrorEvent| TransferErrorEvent[]): Promise<void> {
		if (Array.isArray(eventToPublish)) {
			for await (const event of eventToPublish) {
				await this._messageProducer.send(event);
			}
		} else {
			if (eventToPublish){
				await this._messageProducer.send(eventToPublish);
			}
		}
	}
	//#endregion

	//#region TransfersPrepareRequestedEvt
	private async prepareTransfer(message: TransferPrepareRequestedEvt):Promise<TransferPreparedEvt | TransferQueryResponseEvt | void | TransferErrorEvent> {
		this._logger.debug(`prepareTransfer() - Got transferPreparedReceivedEvt msg for transferId: ${message.payload.transferId}`);

		// TODO call the settlements lib to get the correct settlement model
		// export function obtainSettlementModelFrom(
		// 	transferAmount: bigint,
		// 	debitAccountCurrency: string,
		// 	creditAccountCurrency: string
		// ): Promise<string> {
		const settlementModel = "DEFAULT"; // FIXED for now

		const now = Date.now();

		const hash = this.generateSha256({
			transferId: message.payload.transferId,
			payeeFspId: message.payload.payeeFsp,
			payerFspId: message.payload.payerFsp,
			amount: message.payload.amount,
			expirationTimestamp: message.payload.expiration
		});

		let getTransferRep:ITransfer | null = null;

		try {
			getTransferRep = await this._transfersRepo.getTransferById(message.payload.transferId);
		} catch(err: unknown) {
			const error = (err as Error).message;
			const errorMessage = `Unable to get transfer record for transferId: ${message.payload.transferId} from repository`;
			this._logger.error(err, `${errorMessage}: ${error}`);
			return new TransferUnableToGetTransferByIdEvt({
				transferId: message.payload.transferId,
				errorDescription: errorMessage
			});
		}

		// TODO Use hash repository to fetch the hashes
		if(getTransferRep) {
			if(getTransferRep.hash !== hash) {
				const errorMessage = `Transfer hash for ${message.payload.transferId} doesn't match`;
				this._logger.error(errorMessage);
				const errorEvent =  new TransferDuplicateCheckFailedEvt({
					transferId: message.payload.transferId,
					payerFspId: message.payload.payerFsp,
					errorDescription: errorMessage
				});
				return errorEvent;
			}

			switch(getTransferRep.transferState) {
				case TransferState.RECEIVED:
				case TransferState.RESERVED: {
					// Ignore the request
					return;
				}
				case TransferState.COMMITTED:
				case TransferState.ABORTED: {
					// Send a response event to the payer
					const payload: TransferQueryResponseEvtPayload = {
						transferId: getTransferRep.transferId,
						transferState: getTransferRep.transferState,
						completedTimestamp: getTransferRep.completedTimestamp as unknown as string,
						extensionList: getTransferRep.extensionList
					};

					const event = new TransferQueryResponseEvt(payload);

					event.fspiopOpaqueState = message.fspiopOpaqueState;
					return event;
				}
			}
		}

		const transfer: ITransfer = {
			createdAt: now,
			updatedAt: now,
			transferId: message.payload.transferId,
			payeeFspId: message.payload.payeeFsp,
			payerFspId: message.payload.payerFsp,
			amount: message.payload.amount,
			currencyCode: message.payload.currencyCode,
			ilpPacket: message.payload.ilpPacket,
			condition: message.payload.condition,
			expirationTimestamp: message.payload.expiration,
			transferState: TransferState.RECEIVED,
			extensionList: message.payload.extensionList,
			settlementModel: settlementModel,
			hash: hash,
			fulFillment: null,
			completedTimestamp: null,
			errorInformation: null
		};

		//#region This will be replaced by cached version
		const participantsInfo = await this.getParticipantsInfoOrGetErrorEvent(transfer.transferId, transfer?.payerFspId, transfer?.payeeFspId);
		if(participantsInfo.errorEvent){
			this._logger.error(`Invalid participants info for transferId: ${transfer.transferId} payerFspId: ${transfer.payerFspId} and payeeFspId: ${transfer.payeeFspId}`);
			return participantsInfo.errorEvent;
		}

		const transferParticipants = this.getTransferParticipantsOrGetErrorEvent(participantsInfo.participants, transfer);
		if(transferParticipants.errorEvent){
			this._logger.error(`Unable to get transfer participants for transferId: ${transfer.transferId} and payerFspId: ${transfer.payerFspId} and payeeFspId: ${transfer.payeeFspId}`);
			return transferParticipants.errorEvent;
		}

		const participantAccounts = this.getTransferParticipantsAccountsOrGetErrorEvent(transferParticipants.participants as ITransferParticipants, transfer);
		if(participantAccounts.errorEvent){
			this._logger.error(`Unable to get transfer participant accounts for transferId: ${transfer.transferId} and payerFspId: ${transfer.payerFspId} and payeeFspId: ${transfer.payeeFspId}`);
			return participantAccounts.errorEvent;
		}
		//#endregion This will be replaced by cached version
	
		// TODO put net debit cap in the participant struct
		const payerNdc = "0";

		if(participantAccounts.participantAccounts){
			try {
				await this._accountAndBalancesAdapter.checkLiquidAndReserve(
					participantAccounts.participantAccounts.payerPosAccount.id, participantAccounts.participantAccounts.payerLiqAccount.id, participantAccounts.participantAccounts.hubAccount.id,
					transfer.amount, transfer.currencyCode, payerNdc, transfer.transferId
				);
			} catch(err: unknown) {
				const error = (err as Error).message;
				const errorMessage = `Unable to check liquidity and reserve for transferId: ${transfer.transferId}`;
				this._logger.error(err, `${errorMessage}: ${error}`);
				return new TransferPrepareLiquidityCheckFailedEvt({
					transferId: transfer.transferId,
					payerFspId: transfer.payerFspId,
					amount: transfer.amount,
					currency: transfer.currencyCode,
					errorDescription: errorMessage
				});
			}
		}

		// After everything's done, do a final and what should be the only DB operation
		// If we store it here we save a DB operation in case the 
		try {
			await this._transfersRepo.addTransfer(transfer);
		} catch(err: unknown){
			const error = (err as Error).message;
			const errorMessage = `Error adding transfer for transferId: ${transfer.transferId}.`;
			this._logger.error(err, errorMessage + error);

			if(participantAccounts.participantAccounts) {
				try {
					await this._accountAndBalancesAdapter.cancelReservation(
						participantAccounts.participantAccounts.payerPosAccount.id, participantAccounts.participantAccounts.hubAccount.id,
						transfer.amount, transfer.currencyCode, transfer.transferId
					)
				} catch(err: unknown) {
					const error = (err as Error).message;
					const errorMessage = `Unable to cancel reservation with transferId: ${transfer.transferId} for payer: ${transfer.payerFspId} and payee: ${transfer.payeeFspId}`;
					this._logger.error(err, `${errorMessage}: ${error}`);
					return new TransferCancelReservationFailedEvt({
						transferId: transfer.transferId,
						payerFspId: transfer.payerFspId,
						errorDescription: errorMessage
					});
				}
			}

			return new TransferUnableToAddEvt({
				transferId: transfer.transferId,
				payerFspId: transfer.payerFspId,
				errorDescription: errorMessage
			});
		}
	
		const payload : TransferPreparedEvtPayload = {
			transferId: message.payload.transferId,
			payeeFsp: message.payload.payeeFsp,
			payerFsp: message.payload.payerFsp,
			amount: message.payload.amount,
			currencyCode: message.payload.currencyCode,
			ilpPacket: message.payload.ilpPacket,
			condition: message.payload.condition,
			expiration: message.payload.expiration,
			extensionList: message.payload.extensionList
		};

		const event = new TransferPreparedEvt(payload);

		event.fspiopOpaqueState = message.fspiopOpaqueState;

		this._logger.debug("transferPreparedReceivedEvt completed for transferId: "+transfer.transferId);

		return event;
	}
	//#endregion

	//#region TransfersFulfilCommittedRequestedEvt
	private async fulfilTransfer(message: TransferFulfilCommittedRequestedEvt):Promise<TransferCommittedFulfiledEvt | TransferErrorEvent> {
		this._logger.debug(`fulfilTransfer() - Got transferFulfilCommittedEvt msg for transferId: ${message.payload.transferId}`);

		let getTransferRep:ITransfer | null = null;

		try {
			getTransferRep = await this._transfersRepo.getTransferById(message.payload.transferId);
		} catch(err: unknown) {
			const error = (err as Error).message;
			const errorMessage = `Unable to get transfer record for transferId: ${message.payload.transferId} from repository`;
			this._logger.error(err, `${errorMessage}: ${error}`);
			return new TransferUnableToGetTransferByIdEvt({
				transferId: message.payload.transferId,
				errorDescription: errorMessage
			});
		}

		if(!getTransferRep) {
			const errorMessage = `TransferId: ${message.payload.transferId} could not be found`;
			this._logger.debug(errorMessage);
			return new TransferNotFoundEvt({
				transferId: message.payload.transferId,
				errorDescription: errorMessage
			});
		}

		let transferErrorEvent: TransferErrorEvent|null = null;

		//#region This part will be replaced by cached version
		const participantsInfo = await this.getParticipantsInfoOrGetErrorEvent(getTransferRep.transferId, getTransferRep?.payerFspId, getTransferRep?.payeeFspId);
		if(participantsInfo.errorEvent){
			this._logger.error(`Invalid participants info for payerFspId: ${getTransferRep.payerFspId} and payeeFspId: ${getTransferRep.payeeFspId}`);
			transferErrorEvent = participantsInfo.errorEvent;
		}

		const transferParticipants = this.getTransferParticipantsOrGetErrorEvent(participantsInfo.participants, getTransferRep);
		if(transferParticipants.errorEvent) {
			this._logger.error(`Invalid transfer participants for payerFspId: ${getTransferRep.payerFspId} and payeeFspId: ${getTransferRep.payeeFspId}`);
			transferErrorEvent = transferParticipants.errorEvent;
		}

		const transferParticipantTransferAccounts = this.getTransferParticipantsAccountsOrGetErrorEvent(transferParticipants.participants as ITransferParticipants, getTransferRep);
		if(transferParticipantTransferAccounts.errorEvent) {
			this._logger.error(`Invalid participants accounts for payerFspId: ${getTransferRep.payerFspId} and payeeFspId: ${getTransferRep.payeeFspId}`);
			transferErrorEvent = transferParticipantTransferAccounts.errorEvent;
		}
		//#endregion This part will be replaced by cached version

		// We try to cancel the reservation first and then update the transfer state to ABORTED
		// Since if it fails to cancel it the funds will still be reserved
		if(transferErrorEvent !== null) {
			if(transferParticipantTransferAccounts?.participantAccounts)
			try {
				await this._accountAndBalancesAdapter.cancelReservation(
					transferParticipantTransferAccounts.participantAccounts.payerPosAccount.id, transferParticipantTransferAccounts.participantAccounts.hubAccount.id,
					getTransferRep.amount, getTransferRep.currencyCode, getTransferRep.transferId
				)
			} catch(err: unknown) {
				const error = (err as Error).message;
				const errorMessage = `Unable to cancel reservation with transferId: ${getTransferRep.transferId} for payer: ${getTransferRep.payerFspId} and payee: ${getTransferRep.payeeFspId}`;
				this._logger.error(err, `${errorMessage}: ${error}`);
				return new TransferCancelReservationFailedEvt({
					transferId: getTransferRep.transferId,
					payerFspId: getTransferRep.payerFspId,
					errorDescription: errorMessage
				});
			}

			try {
				getTransferRep.transferState = TransferState.ABORTED;
				await this._transfersRepo.updateTransfer(getTransferRep)
			} catch(err: unknown) {
				const error = (err as Error).message;
				const errorMessage = `Error updating transfer for transferId: ${getTransferRep.transferId}.`;
				this._logger.error(err, `${errorMessage}: ${error}`);
				return new TransferUnableToUpdateEvt({
					transferId: getTransferRep.transferId,
					payerFspId: getTransferRep.payerFspId,
					errorDescription: errorMessage
				});
			}

			return transferErrorEvent as TransferErrorEvent;
		}

		try {
			if(transferParticipantTransferAccounts.participantAccounts) {
				await this._accountAndBalancesAdapter.cancelReservationAndCommit(
					transferParticipantTransferAccounts.participantAccounts.payerPosAccount.id, transferParticipantTransferAccounts.participantAccounts.payeePosAccount.id, transferParticipantTransferAccounts.participantAccounts.hubAccount.id,
					getTransferRep.amount, getTransferRep.currencyCode, getTransferRep.transferId
				)
			}
		} catch(err: unknown) {
			const error = (err as Error).message;
			const errorMessage = `Unable to commit transferId: ${getTransferRep.transferId} for payer: ${getTransferRep.payerFspId} and payee: ${getTransferRep.payeeFspId}`;
			this._logger.error(err, `${errorMessage}: ${error}`);
			return new TransferCancelReservationAndCommitFailedEvt({
				transferId: getTransferRep.transferId,
				payerFspId: getTransferRep.payerFspId,
				errorDescription: errorMessage
			});
	
		}

		getTransferRep.updatedAt = Date.now();
		getTransferRep.transferState = TransferState.COMMITTED;
		getTransferRep.fulFillment = message.payload.fulfilment;
		getTransferRep.completedTimestamp = message.payload.completedTimestamp;
		getTransferRep.extensionList = message.payload.extensionList;

		try {
			await this._transfersRepo.updateTransfer(getTransferRep)
		} catch(err: unknown) {
			const error = (err as Error).message;
			const errorMessage = `Error updating transfer for transferId: ${getTransferRep.transferId}.`;
			this._logger.error(err, `${errorMessage}: ${error}`);
			return new TransferUnableToUpdateEvt({
				transferId: getTransferRep.transferId,
				payerFspId: getTransferRep.payerFspId,
				errorDescription: errorMessage
			});
		}
		
		const payload: TransferCommittedFulfiledEvtPayload = {
			transferId: message.payload.transferId,
			fulfilment: message.payload.fulfilment,
			completedTimestamp: message.payload.completedTimestamp,
			extensionList: message.payload.extensionList,
			payerFspId: getTransferRep.payerFspId,
			payeeFspId: getTransferRep.payeeFspId,
			amount: getTransferRep.amount,
			currencyCode: getTransferRep.currencyCode,
			settlementModel: getTransferRep.settlementModel,

		};

		const retEvent = new TransferCommittedFulfiledEvt(payload);

		retEvent.fspiopOpaqueState = message.fspiopOpaqueState;

		return retEvent;
	}
	//#endregion

	//#region TransferQueryReceivedEvt
	private async queryTransfer(message: TransferQueryReceivedEvt):Promise<TransferQueryResponseEvt | TransferErrorEvent> {
		this._logger.debug(`queryTransfer() - Got transferQueryRequestEvt msg for transferId: ${message.payload.transferId}`);

		const requesterFspId = message.fspiopOpaqueState.requesterFspId;
		const destinationFspId = message.fspiopOpaqueState.destinationFspId;
		const transferId = message.payload.transferId;

		const requesterParticipant = await this.validatePayerParticipantInfoOrGetErrorEvent(transferId, requesterFspId);
		if(requesterParticipant.errorEvent){
			this._logger.error(`Invalid participant info for requesterFspId: ${requesterFspId}`);
			return requesterParticipant.errorEvent as TransferErrorEvent;
		}

		const destinationParticipant = await this.validatePayeeParticipantInfoOrGetErrorEvent(transferId, destinationFspId);
		if(destinationParticipant.errorEvent){
			this._logger.error(`Invalid participant info for destinationFspId: ${destinationFspId}`);
			return destinationParticipant.errorEvent as TransferErrorEvent;
		}

		let getTransferRep:ITransfer | null = null;

		try {
			getTransferRep = await this._transfersRepo.getTransferById(message.payload.transferId);
		} catch(err: unknown) {
			const error = (err as Error).message;
			const errorMessage = `Unable to get transfer record for transferId: ${message.payload.transferId} from repository`;
			this._logger.error(err, `${errorMessage}: ${error}`);
			return new TransferUnableToGetTransferByIdEvt({
				transferId: message.payload.transferId,
				errorDescription: errorMessage
			});
		}

		if(!getTransferRep) {
			const errorMessage = `TransferId: ${message.payload.transferId} could not be found`;
			this._logger.error(errorMessage);
			return new TransferNotFoundEvt({
				transferId: message.payload.transferId,
				errorDescription: errorMessage
			});
		}

		const payload: TransferQueryResponseEvtPayload = {
			transferId: getTransferRep.transferId,
			transferState: getTransferRep.transferState,
			completedTimestamp: getTransferRep.completedTimestamp as unknown as string,
			extensionList: getTransferRep.extensionList
		};

		const event = new TransferQueryResponseEvt(payload);

		event.fspiopOpaqueState = message.fspiopOpaqueState;

		return event;
	}
	//#endregion

	//#region TransferRejectRequestedEvt
	private async rejectTransfer(message: TransferRejectRequestedEvt):Promise<TransferRejectRequestProcessedEvt | TransferErrorEvent> {
		this._logger.debug(`rejectTransfer() - Got transferRejectRequestedEvt msg for transferId: ${message.payload.transferId}`);

		let getTransferRep:ITransfer | null = null;

		try {
			getTransferRep = await this._transfersRepo.getTransferById(message.payload.transferId);
		} catch(err: unknown) {
			const error = (err as Error).message;
			const errorMessage = `Unable to get transfer record for transferId: ${message.payload.transferId} from repository`;
			this._logger.error(err, `${errorMessage}: ${error}`);
			return new TransferUnableToGetTransferByIdEvt({
				transferId: message.payload.transferId,
				errorDescription: errorMessage
			});
		}

		if(!getTransferRep) {
			const errorMessage = `TransferId: ${message.payload.transferId} could not be found`;
			this._logger.error(errorMessage);
			return new TransferNotFoundEvt({
				transferId: message.payload.transferId,
				errorDescription: errorMessage
			});
		}

		//#region This part will be replaced by cached version
		const participantsInfo = await this.getParticipantsInfoOrGetErrorEvent(getTransferRep.transferId, getTransferRep?.payerFspId, getTransferRep?.payeeFspId);
		if(participantsInfo.errorEvent){
			this._logger.error(`Invalid participants info for payerFspId: ${getTransferRep.payerFspId} and payeeFspId: ${getTransferRep.payeeFspId}`);
			return participantsInfo.errorEvent as TransferErrorEvent;
		}

		const transferParticipants = this.getTransferParticipantsOrGetErrorEvent(participantsInfo.participants, getTransferRep);
		if(transferParticipants.errorEvent || !transferParticipants.participants){
			return transferParticipants.errorEvent as TransferErrorEvent;
		}

		const transferParticipantTransferAccounts = this.getTransferParticipantsAccountsOrGetErrorEvent(transferParticipants.participants as ITransferParticipants, getTransferRep);
		if(transferParticipantTransferAccounts.errorEvent || !transferParticipantTransferAccounts.participantAccounts){
			this._logger.error(`Invalid participants accounts for payerFspId: ${getTransferRep.payerFspId} and payeeFspId: ${getTransferRep.payeeFspId}`);
			return transferParticipantTransferAccounts.errorEvent as TransferErrorEvent;
		}
		//#endregion This part will be replaced by cached version

		try {
			await this._accountAndBalancesAdapter.cancelReservation(
				transferParticipantTransferAccounts.participantAccounts.payerPosAccount.id, transferParticipantTransferAccounts.participantAccounts.hubAccount.id,
				getTransferRep.amount, getTransferRep.currencyCode, getTransferRep.transferId
			)
		} catch(err: unknown) {
			const error = (err as Error).message;
			const errorMessage = `Unable to cancel reservation with transferId: ${getTransferRep.transferId} for payer: ${getTransferRep.payerFspId} and payee: ${getTransferRep.payeeFspId}`;
			this._logger.error(err, `${errorMessage}: ${error}`);
			return new TransferCancelReservationFailedEvt({
				transferId: getTransferRep.transferId,
				payerFspId: getTransferRep.payerFspId,
				errorDescription: errorMessage
			});
		}

		try {
			getTransferRep.transferState = TransferState.ABORTED;
			await this._transfersRepo.updateTransfer(getTransferRep)
		} catch(err: unknown) {
			const error = (err as Error).message;
			const errorMessage = `Error updating transfer for transferId: ${getTransferRep.transferId}.`;
			this._logger.error(err, `${errorMessage}: ${error}`);
			return new TransferUnableToUpdateEvt({
				transferId: getTransferRep.transferId,
				payerFspId: getTransferRep.payerFspId,
				errorDescription: errorMessage
			});
		}

		const payload: TransferRejectRequestProcessedEvtPayload = {
			transferId: message.payload.transferId,
			errorInformation: message.payload.errorInformation
		};

		const retEvent = new TransferRejectRequestProcessedEvt(payload);

		retEvent.fspiopOpaqueState = message.fspiopOpaqueState;

		return retEvent;
	}
	//#endregion

	private async getParticipantsInfoOrGetErrorEvent(transferId: string, payerFspId:string, payeeFspId: string): Promise<{errorEvent:TransferErrorEvent | null, participants: IParticipant[]}>{
		const participants: IParticipant[] = [];
		let errorEvent!: TransferErrorEvent | null;
		const result = { errorEvent, participants };

		// TODO get all participants in a single call with participantsClient.getParticipantsByIds()
		let participantsInfo: IParticipant[] | null = null;

		try{ 
			participantsInfo = await this._participantAdapter.getParticipantsInfo([payerFspId, payeeFspId, HUB_ID]);
		} catch(err: unknown) {
			const error = (err as Error).message;
			const errorMessage = `Cannot get participants info ${err}`;
			this._logger.error(err, `${errorMessage}: ${error}`);
			result.errorEvent = new TransferUnableToGetParticipantsInfoEvt({
				transferId: transferId,
				payerFspId: payerFspId,
				payeeFspId: payeeFspId,
				errorDescription: errorMessage
			});
			return result;
		}

		if (!participantsInfo || participantsInfo.length < [payerFspId, payeeFspId, HUB_ID].length) {
			const errorMessage = "Cannot get participants info for payer: " + payerFspId + " and payee: " + payeeFspId;
			this._logger.error(errorMessage);
			errorEvent = new TransferUnableToGetParticipantsInfoEvt({
				transferId: transferId,
				payerFspId: payerFspId,
				payeeFspId: payeeFspId,
				errorDescription: errorMessage
			});
			result.errorEvent = errorEvent;
			return result;
		}

		for (const participantInfo of participantsInfo) {
			if(participantInfo.id === HUB_ID) {
				break;
			}

			if(participantInfo.id === HUB_ID) {
				break;
			}

			if(participantInfo.id !== payerFspId && participantInfo.id !== payeeFspId){
				this._logger.error(`Participant id mismatch ${participantInfo.id} ${participantInfo.id}`);

				if(participantInfo.id !== payerFspId) {
					const errorMessage = "Invalid participant id for payer: " + payerFspId;
					errorEvent = new TransferPrepareInvalidPayerCheckFailedEvt({
						transferId: transferId,
						payerFspId: payerFspId,
						errorDescription: errorMessage
					});
				} else if(participantInfo.id !== payeeFspId) {
					const errorMessage = "Invalid participant id for payee: " + payerFspId;
					errorEvent = new TransferPrepareInvalidPayeeCheckFailedEvt({
						transferId: transferId,
						payeeFspId: payeeFspId,
						errorDescription: errorMessage
					});
				}

				result.errorEvent = errorEvent;
				return result;
			}

			
			// if(!participantInfo.isActive) {
			// 	this._logger.error(`${participantInfo.id} is not active`);
			// 	if(participantInfo.id !== payerFspId) {
			// 		const errorMessage = "Payer participant id: " + payerFspId + " is not active";
			// 		errorEvent = new TransferPrepareInvalidPayeeCheckFailedEvt({
			// 			transferId,
			// 			fspId: payerFspId,
			// 			errorDescription: errorMessage
			// 		})
			// 	} else if(participantInfo.id !== payeeFspId) {
			// 		const errorMessage = "Payee participant id: " + payerFspId + " is not active";
			// 		errorEvent = new TransferPrepareInvalidPayeeCheckFailedEvt({
			// 			transferId,
			// 			fspId: payeeFspId,
			// 			errorDescription: errorMessage
			// 		})
			// 	}
			// 	return result;
			// }

		}

		result.participants = participantsInfo;
		return result;
	}

	private getTransferParticipantsOrGetErrorEvent(participants: IParticipant[], transfer: ITransfer): {errorEvent:TransferErrorEvent | null, participants:{hub: IParticipant | null, payer: IParticipant | null, payee: IParticipant | null}}  {
		let errorEvent!:TransferErrorEvent | null;
		const result:{errorEvent:TransferErrorEvent | null, participants:{hub: IParticipant | null, payer: IParticipant | null, payee: IParticipant | null}}
			= {errorEvent, participants: {hub: null, payer: null, payee: null} };

		const transferPayerParticipant = participants.find((value: IParticipant) => value.id === transfer.payerFspId);

		if(!transferPayerParticipant) {
			const errorMessage = "Payer participant not found " + transfer.payerFspId + " for transfer " + transfer.transferId;
			this._logger.error(errorMessage);
			result.errorEvent = new TransferPayerNotFoundFailedEvt({
				transferId: transfer.transferId,
				payerFspId: transfer.payerFspId,
				errorDescription: errorMessage
			});
			
			return result;
		}

		const transferPayeeParticipant = participants.find((value: IParticipant) => value.id === transfer.payeeFspId);

		if(!transferPayeeParticipant) {
			const errorMessage = "Payee participant not found " + transfer.payeeFspId + " for transfer " + transfer.transferId;
			this._logger.error(errorMessage);
			result.errorEvent = new TransferPayeeNotFoundFailedEvt({
				transferId: transfer.transferId,
				payeeFspId: transfer.payeeFspId,
				errorDescription: errorMessage
			});
			
			return result;
		}

		const hub = participants.find((value: IParticipant) => value.id === HUB_ID);

		if(!hub) {
			const errorMessage = "Hub participant not found " + HUB_ID + " for transfer " + transfer.transferId;
			this._logger.error(errorMessage);
			result.errorEvent = new TransferHubNotFoundFailedEvt({
				transferId: transfer.transferId,
				errorDescription: errorMessage
			});
			
			return result;
		}

		// TODO enable participant.isActive check once this is implemented over the participants side
		// if (!transferPayerParticipant.isActive) {
		// 	const errorMessage = `Payer participant is not active for transfer: ${transfer.transferId} and payer: ${transfer.payerFspId}`;
		// 	this._logger.error(errorMessage);
		// 	result.errorEvent = new TransferPayerNotActiveEvt({
		// 		transferId: transfer.transferId,
		// 		payerFspId: transfer.payerFspId,
		// 		errorDescription: errorMessage
		// });
		// 	result.valid = false;
		// 	return result;
		// }

		if (!transferPayerParticipant.approved) {
			const errorMessage = `Payer participant is not approved for transfer: ${transfer.transferId} and payer: ${transfer.payerFspId}`;
			this._logger.error(errorMessage);
			result.errorEvent = new TransferPayerNotApprovedEvt({
				transferId: transfer.transferId,
				payerFspId: transfer.payerFspId,
				errorDescription: errorMessage
			});
			return result;
		}

		// TODO enable participant.isActive check once this is implemented over the participants side
		// if (!transferPayeeParticipant.isActive) {
		// 	const errorMessage = `Payee participant is not active for transfer: ${transfer.transferId} and payee: ${transfer.payeeFspId}`;
		// 	this._logger.error(errorMessage);
		// 	result.errorEvent = new TransferPayeeNotActiveEvt({
		// 		transferId: transfer.transferId,
		// 		payeeFspId: transfer.payeeFspId,
		// 		errorDescription: errorMessage
		// 	});
		// 	return result;
		// }

		if (!transferPayeeParticipant.approved) {
			const errorMessage = `Payee participant is not approved for transfer: ${transfer.transferId} and payee: ${transfer.payeeFspId}`;
			this._logger.error(errorMessage);
			result.errorEvent = new TransferPayeeNotApprovedEvt({
				transferId: transfer.transferId,
				payeeFspId: transfer.payerFspId,
				errorDescription: errorMessage
			});
			return result;
		}

		result.participants.payer = transferPayerParticipant;
		result.participants.payee = transferPayeeParticipant;
		result.participants.hub = hub;

		return result;
	}


	private getTransferParticipantsAccountsOrGetErrorEvent(transferParticipants: ITransferParticipants, transfer: ITransfer): {errorEvent:TransferErrorEvent | null, participantAccounts: ITransferAccounts | null}  {
		const result:{errorEvent:TransferErrorEvent | null, participantAccounts: ITransferAccounts | null} = {errorEvent: null, participantAccounts: null};

		const { hub, payer: transferPayerParticipant, payee: transferPayeeParticipant } = transferParticipants;

		const hubAccount = hub.participantAccounts
			.find((value: IParticipantAccount) => value.type === AccountType.HUB && value.currencyCode === transfer.currencyCode) ?? null;

		if(!hubAccount) {
			const errorMessage = "Payer participant not found " + transfer.payerFspId + " for transfer " + transfer.transferId;
			this._logger.error(errorMessage);
			result.errorEvent = new TransferHubAccountNotFoundFailedEvt({
				transferId: transfer.transferId,
				errorDescription: errorMessage
			});
			return result;
		}

		const payerPosAccount = transferPayerParticipant.participantAccounts
			.find((value: IParticipantAccount) => value.type === AccountType.POSITION && value.currencyCode === transfer.currencyCode) ?? null;
		if(!payerPosAccount) {
			const errorMessage = "Payer participant not found " + transfer.payerFspId + " for transfer " + transfer.transferId;
			this._logger.error(errorMessage);
			result.errorEvent = new TransferPayerPositionAccountNotFoundFailedEvt({
				transferId: transfer.transferId,
				payerFspId: transfer.payerFspId,
				errorDescription: errorMessage
			});
			return result;
		}

		const payerLiqAccount = transferPayerParticipant.participantAccounts
			.find((value: IParticipantAccount) => value.type === AccountType.SETTLEMENT && value.currencyCode === transfer.currencyCode) ?? null;
		if(!payerLiqAccount) {
			const errorMessage = "Payer participant not found " + transfer.payerFspId + " for transfer " + transfer.transferId;
			this._logger.error(errorMessage);
			result.errorEvent = new TransferPayerLiquidityAccountNotFoundFailedEvt({
				transferId: transfer.transferId,
				payerFspId: transfer.payerFspId,
				errorDescription: errorMessage
			});
			return result;
		}

		const payeePosAccount = transferPayeeParticipant.participantAccounts
			.find((value: IParticipantAccount) => value.type === AccountType.POSITION && value.currencyCode === transfer.currencyCode) ?? null;
		if(!payeePosAccount) {
			const errorMessage = "Payer participant not found " + transfer.payerFspId + " for transfer " + transfer.transferId;
			this._logger.error(errorMessage);
			result.errorEvent = new TransferPayeePositionAccountNotFoundFailedEvt({
				transferId: transfer.transferId,
				payeeFspId: transfer.payeeFspId,
				errorDescription: errorMessage
			});
			return result;
		}

		const payeeLiqAccount = transferPayeeParticipant.participantAccounts
			.find((value: IParticipantAccount) => value.type === AccountType.SETTLEMENT && value.currencyCode === transfer.currencyCode) ?? null;
		if(!payeeLiqAccount) {
			const errorMessage = "Payer participant not found " + transfer.payerFspId + " for transfer " + transfer.transferId;
			this._logger.error(errorMessage);
			result.errorEvent = new TransferPayeeLiquidityAccountNotFoundFailedEvt({
				transferId: transfer.transferId,
				payeeFspId: transfer.payeeFspId,
				errorDescription: errorMessage
			});
			return result;
		}

		result.participantAccounts = {
			hubAccount: hubAccount,
			payerPosAccount: payerPosAccount,
			payerLiqAccount: payerLiqAccount,
			payeePosAccount: payeePosAccount,
			payeeLiqAccount: payeeLiqAccount
			
		}
		
		return result;
	}

	//#region Validations
	private validateMessageOrGetErrorEvent(message:CommandMsg): TransferErrorEvent | null {
		const requesterFspId = message.fspiopOpaqueState?.requesterFspId;
		const transferId = message.payload?.transferId;

		if(!message.payload){
			const errorMessage = "Message payload is null or undefined";
			this._logger.error(errorMessage);
			return new TransferInvalidMessagePayloadEvt({
				transferId: transferId,
				payerFspId: requesterFspId,
				errorDescription: errorMessage
			});
		}

		if(!message.msgName){
			const errorMessage = "Message name is null or undefined";
			this._logger.error(errorMessage);
			return new TransferInvalidMessageTypeEvt({
				transferId: transferId,
				payerFspId: requesterFspId,
				errorDescription: errorMessage
			});
		}

		if(message.msgType !== MessageTypes.COMMAND){
			const errorMessage = `Message type is invalid ${message.msgType}`;
			this._logger.error(errorMessage);
			return new TransferInvalidMessageTypeEvt({
				transferId: transferId,
				payerFspId: requesterFspId,
				errorDescription: errorMessage
			});
		}

		return null;
	}


	private async validatePayerParticipantInfoOrGetErrorEvent(transferId :string, participantId: string | null):Promise<{errorEvent:TransferErrorEvent | null}>{
		let participant: IParticipant | null = null;
		let errorEvent!: TransferErrorEvent | null;
		const result = { errorEvent };

		if(!participantId){
			const errorMessage = `Fsp Id ${participantId} is null or undefined`;
			this._logger.error(errorMessage);
			errorEvent = new TransferQueryInvalidPayerCheckFailedEvt({
				transferId: transferId,
				payerFspId: participantId,
				errorDescription: errorMessage
			});
			result.errorEvent = errorEvent;
			return result;
		}

		participant = await this._participantAdapter.getParticipantInfo(participantId)
			.catch((err: unknown) => {
				const error = (err as Error).message;
				this._logger.error(`Error getting participant info for participantId: ${participantId} - ${error}`);
				return null;
		});

		if(!participant) {
			const errorMessage = `No participant found for fspId: ${participantId}`;
			this._logger.error(errorMessage);
			errorEvent = new TransferQueryPayerNotFoundFailedEvt({
				transferId: transferId,
				payerFspId: participantId,
				errorDescription: errorMessage
			});
			result.errorEvent = errorEvent;
			return result;
		}

		if(participant.id !== participantId){
			const errorMessage = `Participant id mismatch ${participant.id} ${participantId}`;
			this._logger.error(errorMessage);
			errorEvent = new TransferQueryInvalidPayerParticipantIdEvt({
				transferId: transferId,
				payerFspId: participantId,
				errorDescription: errorMessage
			});
			result.errorEvent = errorEvent;
			return result;
		}

		// TODO enable participant.isActive check once this is implemented over the participants side
		// if(!participant.isActive) {
			// 	this._logger.debug(`${participant.id} is not active`);
			// 	throw new RequiredParticipantIsNotActive();
		// }

		return result;
	}

	private async validatePayeeParticipantInfoOrGetErrorEvent(transferId:string, participantId: string | null):Promise<{errorEvent:TransferErrorEvent | null}>{
		let participant: IParticipant | null = null;
		let errorEvent!: TransferErrorEvent | null;
		const result = { errorEvent };

		if(!participantId){
			const errorMessage = `Fsp Id ${participantId} is null or undefined`;
			this._logger.error(errorMessage);
			errorEvent = new TransferQueryInvalidPayeeCheckFailedEvt({
				transferId: transferId,
				payeeFspId: participantId,
				errorDescription: errorMessage
			});
			
			result.errorEvent = errorEvent;
			return result;
		}

		participant = await this._participantAdapter.getParticipantInfo(participantId)
			.catch((err: unknown) => {
				const error = (err as Error).message;
				const errorMessage = `Error getting participant info for participantId: ${participantId}`;
				this._logger.error(err, `${errorMessage}: ${error}`);
				return null;
		});

		if(!participant) {
			const errorMessage = `No participant found for fspId: ${participantId}`;
			this._logger.error(errorMessage);
			errorEvent = new TransferQueryPayeeNotFoundFailedEvt({
				transferId: transferId,
				payeeFspId: participantId,
				errorDescription: errorMessage
			});
			result.errorEvent = errorEvent;
			return result;
		}

		if(participant.id !== participantId){
			const errorMessage = `Participant id mismatch ${participant.id} ${participantId}`;
			this._logger.error(errorMessage);
			errorEvent = new TransferQueryInvalidPayeeParticipantIdEvt({
				transferId: transferId,
				payeeFspId: participantId,
				errorDescription: errorMessage
			});
			result.errorEvent = errorEvent;
			return result;
		}

		// TODO enable participant.isActive check once this is implemented over the participants side
		// if(!participant.isActive) {
			// 	this._logger.error(`${participant.id} is not active`);
			// 	throw new RequiredParticipantIsNotActive();
		// }

		return result;
	}
	//#endregion

	// A SchedulingBC event should be responsible for triggering this
	private async abortTransferAndGetErrorEvent(transfer: ITransfer): Promise<{errorEvent:TransferErrorEvent | null}>{
		let errorEvent!: TransferErrorEvent | null;
		const result = { errorEvent };

		const previousState = transfer.transferState;

		transfer.transferState = TransferState.ABORTED;
		await this._transfersRepo.updateTransfer(transfer);

		switch(previousState) {
			case TransferState.RECEIVED: {
				const errorMessage = `TransferPrepareRequestTimedoutEvt for transferId: ${transfer.transferId}`;
				this._logger.error(`${errorMessage}: ${transfer.transferId}`);
				errorEvent = new TransferPrepareRequestTimedoutEvt({
					transferId: transfer.transferId,
					payerFspId: transfer.payerFspId,
					errorDescription: errorMessage
				});
				result.errorEvent = errorEvent;
				break;
			}
			case TransferState.RESERVED: {
				const errorMessage = `TransferFulfilPreCommittedRequestTimedoutEvt for transferId: ${transfer.transferId}`;
				this._logger.error(`${errorMessage}: ${transfer.transferId}`);
				errorEvent = new TransferFulfilCommittedRequestedTimedoutEvt({
					transferId: transfer.transferId,
					payerFspId: transfer.payerFspId,
					payeeFspId: transfer.payeeFspId,
					errorDescription: errorMessage
				});
				result.errorEvent = errorEvent;
				break;
			}
			case TransferState.COMMITTED: {
				const errorMessage = `TransferFulfilPostCommittedRequestedTimedoutEvt for transferId: ${transfer.transferId}`;
				this._logger.error(`${errorMessage}: ${transfer.transferId}`);
				errorEvent = new TransferFulfilPostCommittedRequestedTimedoutEvt({
					transferId: transfer.transferId,
					payerFspId:transfer.payerFspId,
					payeeFspId:transfer.payeeFspId,
					errorDescription: errorMessage
				});
				result.errorEvent = errorEvent;
				break;
			}
		}

		return result;
	}


	//#region Hash generation
	private generateSha256(object:{[key: string]: string | number}):string {
		const hashSha256 = Crypto.createHash('sha256')

		// updating data
		.update(JSON.stringify(object))

		// Encoding to be used
		.digest("base64");

		// remove trailing '=' as per specification
		return hashSha256.slice(0, -1);
	}
	//#endregion
}
