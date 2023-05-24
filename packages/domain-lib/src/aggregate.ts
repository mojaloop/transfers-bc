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
	TransferQueryResponseEvtPayload
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
	TransferState,
	TransferUpdatableFields
} from "./types";
import { IParticipant, IParticipantAccount } from "@mojaloop/participant-bc-public-types-lib";
import { createInvalidMessagePayloadErrorEvent, createInvalidMessageTypeErrorEvent, createInvalidPayeeParticipantIdErrorEvent,
	createUnknownErrorEvent,
	createInvalidPayerParticipantIdErrorEvent,
	createLiquidityCheckFailedErrorEvent,
	createParticipantPayeeInvalidErrorEvent,
	createParticipantPayerInvalidErrorEvent,
	createPayeeParticipantNotFoundErrorEvent,
	createPayerParticipantNotFoundErrorEvent,
	createTransferNotFoundErrorEvent,
	createTransferPostCommittedTimedoutErrorEvent,
	createTransferPreCommittedTimedoutErrorEvent,
	createTransferPrepareTimedoutErrorEvent,
	createTransferQueryParticipantPayeeInvalidErrorEvent,
	createTransferQueryParticipantPayerInvalidErrorEvent,
	createUnableToAddTransferToDatabaseErrorEvent,
	createUnableToGetTransferByIdErrorEvent,
	createUnableToUpdateTransferInDatabaseErrorEvent,
	createTransferDuplicateCheckFailedErrorEvent,
	createUnableToCancelReservationAndCommitErrorEvent,
	createPreparePayerParticipantNotFoundErrorEvent,
	createPreparePayeeParticipantNotFoundErrorEvent,
	createPrepareHubParticipantNotFoundErrorEvent,
	createPrepareHubParticipantAccountNotFoundErrorEvent,
	createPreparePayerParticipantPositionAccountNotFoundErrorEvent,
	createPreparePayerParticipantLiquidityAccountNotFoundErrorEvent,
	createPreparePayeeParticipantPositionAccountNotFoundErrorEvent,
	createPreparePayeeParticipantLiquidityAccountNotFoundErrorEvent,
	createUnableToCancelReservationErrorEvent,
	// createPreparePayerParticipantNotActiveErrorEvent,
	createPreparePayerParticipantNotApprovedErrorEvent,
	// createPreparePayeeParticipantNotActiveErrorEvent,
	createPreparePayeeParticipantNotApprovedErrorEvent
} from "./error_events";

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

		this._logger.debug(`Got command in Quoting handler - msg: ${command}`);
		const requesterFspId = command.fspiopOpaqueState?.requesterFspId;
		const transferId = command.payload?.transferId;
		const eventMessage = this.validateMessageOrGetErrorEvent(command);
		let commandEvt = null;
		let eventToPublish = null;

		if(!eventMessage.valid) {
			const errorEvent = eventMessage.errorEvent as TransferErrorEvent;
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
					eventToPublish = createInvalidMessageTypeErrorEvent(errorMessage, requesterFspId, transferId);
					eventToPublish.fspiopOpaqueState = command.fspiopOpaqueState;
				}
			}
		} catch(error:unknown) {
			const errorMessage = `Error while handling message ${command.msgName}`;
			this._logger.error(errorMessage + `- ${error}`);
			eventToPublish = createUnknownErrorEvent(errorMessage, requesterFspId, transferId);
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

		const repeatedTransfer = await this.getTransferByIrOrGetErrorEvent(message.payload.transferId, message.payload.payerFsp);
		if(repeatedTransfer.valid && repeatedTransfer.transfer){
			if(repeatedTransfer.transfer.hash !== hash) {
				const errorMessage = `Transfer hash for ${message.payload.transferId} doesn't match`;
				this._logger.error(errorMessage);
				const errorEvent = createTransferDuplicateCheckFailedErrorEvent(errorMessage,message.payload.transferId, message.payload.payerFsp);
				return errorEvent;
			}

			switch(repeatedTransfer.transfer.transferState) {

				case TransferState.RECEIVED:
				case TransferState.RESERVED: {
					// Ignore the request
					return;
				}
				case TransferState.REJECTED:
				case TransferState.COMMITTED:
				case TransferState.ABORTED:
				case TransferState.EXPIRED: {
					// Send a response event to the payer
					const payload: TransferQueryResponseEvtPayload = {
						transferId: repeatedTransfer.transfer.transferId,
						transferState: repeatedTransfer.transfer.transferState,
						completedTimestamp: repeatedTransfer.transfer.completedTimestamp as unknown as string,
						extensionList: repeatedTransfer.transfer.extensionList
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
			fulFillment: null,
			completedTimestamp: null,
			extensionList: message.payload.extensionList,
			settlementModel: settlementModel,
			errorInformation: null,
			hash: hash
		};

		let transferErrorEvent: TransferErrorEvent|null = null;

		const transferAddedToDatabase = await this.addTransferOrGetErrorEvent(transfer?.payerFspId, transfer);
		if(!transferAddedToDatabase.valid){
			this._logger.error(`Unable to add transfer ${transfer.transferId} to database`);
			transferErrorEvent = transferAddedToDatabase.errorEvent;
		}

		const participantsInfo = await this.getParticipantsInfoOrGetErrorEvent(transfer.transferId, transfer?.payerFspId, transfer?.payeeFspId);
		if(participantsInfo.participants.length === 0){
			this._logger.error(`Invalid participants info for transferId: ${transfer.transferId} payerFspId: ${transfer.payerFspId} and payeeFspId: ${transfer.payeeFspId}`);
			transferErrorEvent = participantsInfo.errorEvent;
		}

		const transferParticipants = this.getTransferParticipantsOrGetErrorEvent(participantsInfo.participants, transfer);
		if(!transferParticipants.valid || !transferParticipants.participants.hub){
			this._logger.error(`Unable to get transfer participants for transferId: ${transfer.transferId} and payerFspId: ${transfer.payerFspId} and payeeFspId: ${transfer.payeeFspId}`);
			transferErrorEvent = transferParticipants.errorEvent;
		}

		const participantAccounts = this.getTransferParticipantsAccountsOrGetErrorEvent(transferParticipants.participants as ITransferParticipants, transfer);
		if(!participantAccounts.valid){
			this._logger.error(`Unable to get transfer participant accounts for transferId: ${transfer.transferId} and payerFspId: ${transfer.payerFspId} and payeeFspId: ${transfer.payeeFspId}`);
			transferErrorEvent = participantAccounts.errorEvent;
		}

		// TODO put net debit cap in the participant struct
		const payerNdc = "0";

		const liquidityCheck = await this.checkLiquidityOrGetErrorEvent(transfer, participantAccounts.participantAccounts as ITransferAccounts, payerNdc);
		if(!liquidityCheck.valid){
			this._logger.error(`Unable to check liquidity and reserve for transferId: ${transfer.transferId}`);
			transferErrorEvent = liquidityCheck.errorEvent;
		}

		const transferResponse: TransferUpdatableFields = {
			transferState: TransferState.RESERVED
		};

		const transferRecord = await this.getTransferByIrOrGetErrorEvent(message.payload.transferId, message.payload.payerFsp);
		if(!transferRecord.valid || !transferRecord.transfer){
			this._logger.error(`Unable to get transfer from Transfers Repository with transferId: ${message.payload.transferId}`);
			transferErrorEvent = transferRecord.errorEvent;
		}

		const updatedTransfer = await this.updateTransferOrGetErrorEvent(transferRecord.transfer as ITransfer, transfer.payerFspId, transferResponse);
		if(!updatedTransfer.valid){
			transferErrorEvent = updatedTransfer.errorEvent;
		}

		// We try to cancel the reservation first and then update the transfer state to ABORTED
		// Since if it fails to cancel it the funds will still be reserved
		if(transferErrorEvent !== null) {
			const transferCanceled = await this.cancelReservationOrGetErrorEvent(transfer, participantAccounts.participantAccounts as ITransferAccounts);
			if(!transferCanceled.valid){
				return transferCanceled.errorEvent as TransferErrorEvent;
			}

			const transferResponse: TransferUpdatableFields = {
				transferState: TransferState.ABORTED
			};
			const updatedTransfer = await this.updateTransferOrGetErrorEvent(transferRecord.transfer as ITransfer, transfer.payerFspId, transferResponse);
			if(!updatedTransfer.valid){
				transferErrorEvent = updatedTransfer.errorEvent;
			}

			return transferErrorEvent as TransferErrorEvent;
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

		const foundTransfer = await this.getTransferByIrOrGetErrorEvent(message.payload.transferId, message.payload.transferId);
		if(!foundTransfer.valid || !foundTransfer.transfer){
			this._logger.error(`Unable to get transfer from Transfers Repository with transferId: ${message.payload.transferId}`);
			return foundTransfer.errorEvent as TransferErrorEvent;
		}

		const transferRecord = foundTransfer.transfer;
		let transferErrorEvent: TransferErrorEvent|null = null;

		const participantsInfo = await this.getParticipantsInfoOrGetErrorEvent(transferRecord.transferId, transferRecord?.payerFspId, transferRecord?.payeeFspId);
		if(participantsInfo.participants.length === 0){
			this._logger.error(`Invalid participants info for payerFspId: ${transferRecord.payerFspId} and payeeFspId: ${transferRecord.payeeFspId}`);
			transferErrorEvent = participantsInfo.errorEvent;
		}

		const transferParticipants = this.getTransferParticipantsOrGetErrorEvent(participantsInfo.participants, transferRecord);
		if(!transferParticipants.valid || !transferParticipants.participants){
			this._logger.error(`Invalid transfer participants for payerFspId: ${transferRecord.payerFspId} and payeeFspId: ${transferRecord.payeeFspId}`);
			transferErrorEvent = transferParticipants.errorEvent;
		}

		const transferParticipantTransferAccounts = this.getTransferParticipantsAccountsOrGetErrorEvent(transferParticipants.participants as ITransferParticipants, transferRecord);
		if(!transferParticipantTransferAccounts.valid || !transferParticipantTransferAccounts.participantAccounts){
			this._logger.error(`Invalid participants accounts for payerFspId: ${transferRecord.payerFspId} and payeeFspId: ${transferRecord.payeeFspId}`);
			transferErrorEvent = transferParticipantTransferAccounts.errorEvent;
		}

		// We try to cancel the reservation first and then update the transfer state to ABORTED
		// Since if it fails to cancel it the funds will still be reserved
		if(transferErrorEvent !== null) {
			const transferCanceled = await this.cancelReservationOrGetErrorEvent(transferRecord, transferParticipantTransferAccounts.participantAccounts as ITransferAccounts);
			if(!transferCanceled.valid){
				this._logger.error(`Unable to cancel reservation transferId: ${transferRecord.transferId}, payer: ${transferRecord.payerFspId}, payeeFspId: ${transferRecord.payeeFspId}`);
				transferErrorEvent = participantsInfo.errorEvent;
			}

			const transferResponse: TransferUpdatableFields = {
				transferState: TransferState.ABORTED
			};
			const updatedTransfer = await this.updateTransferOrGetErrorEvent(transferRecord, transferRecord.payerFspId, transferResponse);
			if(!updatedTransfer.valid){
				transferErrorEvent = updatedTransfer.errorEvent;
			}

			return transferErrorEvent as TransferErrorEvent;
		}

		const canceledAndCommittedTransfer = await this.cancelReservationAndCommitOrGetErrorEvent(transferRecord, transferParticipantTransferAccounts.participantAccounts as ITransferAccounts);
		if(!canceledAndCommittedTransfer.valid){
			this._logger.error(`Couldn't cancel reservation and commit for transfer: ${transferRecord.transferId}`);
			return canceledAndCommittedTransfer.errorEvent as TransferErrorEvent;
		}


		transferRecord.updatedAt = Date.now();
		transferRecord.transferState = TransferState.COMMITTED;

		await this._transfersRepo.updateTransfer({
			...transferRecord,
			transferState: message.payload.transferState as TransferState,
			fulFillment: message.payload.fulfilment,
			completedTimestamp: message.payload.completedTimestamp,
			extensionList: message.payload.extensionList
		});

		const payload: TransferCommittedFulfiledEvtPayload = {
			transferId: message.payload.transferId,
			fulfilment: message.payload.fulfilment,
			completedTimestamp: message.payload.completedTimestamp,
			extensionList: message.payload.extensionList,
			payerFspId: transferRecord.payerFspId,
			payeeFspId: transferRecord.payeeFspId,
			amount: transferRecord.amount,
			currencyCode: transferRecord.currencyCode,
			settlementModel: transferRecord.settlementModel,

		};

		const retEvent = new TransferCommittedFulfiledEvt(payload);

		retEvent.fspiopOpaqueState = message.fspiopOpaqueState;

		return retEvent;
	}
	//#endregion

	private async queryTransfer(message: TransferQueryReceivedEvt):Promise<TransferQueryResponseEvt | TransferErrorEvent> {
		this._logger.debug(`queryTransfer() - Got transferQueryRequestEvt msg for transferId: ${message.payload.transferId}`);

		const requesterFspId = message.fspiopOpaqueState.requesterFspId;
		const destinationFspId = message.fspiopOpaqueState.destinationFspId;
		const transferId = message.payload.transferId;

		const requesterParticipant = await this.validatePayerParticipantInfoOrGetErrorEvent(transferId, requesterFspId);
		if(!requesterParticipant.valid){
			this._logger.error(`Invalid participant info for requesterFspId: ${requesterFspId}`);
			return requesterParticipant.errorEvent as TransferErrorEvent;
		}

		const destinationParticipant = await this.validatePayeeParticipantInfoOrGetErrorEvent(transferId, destinationFspId);
		if(!destinationParticipant.valid){
			this._logger.error(`Invalid participant info for destinationFspId: ${destinationFspId}`);
			return destinationParticipant.errorEvent as TransferErrorEvent;
		}

		const transferRecord = await this.getTransferByIrOrGetErrorEvent(transferId, requesterFspId);
		if(!transferRecord.valid || !transferRecord.transfer){
			this._logger.error(`Unable to get transfer from Transfers Repository with transferId: ${transferId}`);
			return transferRecord.errorEvent as TransferErrorEvent;
		}

		const payload: TransferQueryResponseEvtPayload = {
			transferId: transferRecord.transfer.transferId,
			transferState: transferRecord.transfer.transferState,
			completedTimestamp: transferRecord.transfer.completedTimestamp as unknown as string,
			extensionList: transferRecord.transfer.extensionList
		};

		const event = new TransferQueryResponseEvt(payload);

		event.fspiopOpaqueState = message.fspiopOpaqueState;

		return event;
	}

	private async rejectTransfer(message: TransferRejectRequestedEvt):Promise<TransferRejectRequestProcessedEvt | TransferErrorEvent> {
		this._logger.debug(`rejectTransfer() - Got transferRejectRequesteddEvt msg for transferId: ${message.payload.transferId}`);

		const foundTransfer = await this.getTransferByIrOrGetErrorEvent(message.payload.transferId, message.payload.transferId);
		if(!foundTransfer.valid || !foundTransfer.transfer){
			this._logger.error(`Unable to get transfer from Transfers Repository with transferId: ${message.payload.transferId}`);
			return foundTransfer.errorEvent as TransferErrorEvent;
		}

		const transferRecord = foundTransfer.transfer;

		const participantsInfo = await this.getParticipantsInfoOrGetErrorEvent(transferRecord.transferId, transferRecord?.payerFspId, transferRecord?.payeeFspId);
		if(participantsInfo.participants.length === 0){
			this._logger.error(`Invalid participants info for payerFspId: ${transferRecord.payerFspId} and payeeFspId: ${transferRecord.payeeFspId}`);
			return participantsInfo.errorEvent as TransferErrorEvent;
		}

		const transferParticipants = this.getTransferParticipantsOrGetErrorEvent(participantsInfo.participants, transferRecord);
		if(!transferParticipants.valid || !transferParticipants.participants){
			return transferParticipants.errorEvent as TransferErrorEvent;
		}

		const transferParticipantTransferAccounts = this.getTransferParticipantsAccountsOrGetErrorEvent(transferParticipants.participants as ITransferParticipants, transferRecord);
		if(!transferParticipantTransferAccounts.valid || !transferParticipantTransferAccounts.participantAccounts){
			this._logger.error(`Invalid participants accounts for payerFspId: ${transferRecord.payerFspId} and payeeFspId: ${transferRecord.payeeFspId}`);
			return transferParticipantTransferAccounts.errorEvent as TransferErrorEvent;
		}

		const transferResponse: TransferUpdatableFields = {
			transferState: TransferState.REJECTED
		};

		const updatedTransfer = await this.updateTransferOrGetErrorEvent(foundTransfer.transfer, foundTransfer.transfer.payerFspId, transferResponse);
		if(!updatedTransfer.valid){
			return updatedTransfer.errorEvent as TransferErrorEvent;
		}

		const transferCanceled = await this.cancelReservationOrGetErrorEvent(transferRecord, transferParticipantTransferAccounts.participantAccounts);
		if(!transferCanceled.valid){
			this._logger.error(`Unable to cancel reservation transferId: ${transferRecord.transferId}, payer: ${transferRecord.payerFspId}, payeeFspId: ${transferRecord.payeeFspId}`);
			return transferCanceled.errorEvent as TransferErrorEvent;
		}

		const payload: TransferRejectRequestProcessedEvtPayload = {
			transferId: message.payload.transferId,
			errorInformation: message.payload.errorInformation
		};

		const retEvent = new TransferRejectRequestProcessedEvt(payload);

		retEvent.fspiopOpaqueState = message.fspiopOpaqueState;

		return retEvent;
	}

	private async getParticipantsInfoOrGetErrorEvent(transferId: string, payerFspId:string, payeeFspId: string): Promise<{errorEvent:TransferErrorEvent | null, participants: IParticipant[]}>{
		const participants: IParticipant[] = [];
		let errorEvent!: TransferErrorEvent | null;
		const result = { errorEvent, participants };

		// TODO get all participants in a single call with participantsClient.getParticipantsByIds()
		const participantsInfo = await this._participantAdapter.getParticipantsInfo([payerFspId, payeeFspId, HUB_ID]).catch((err) => {
			this._logger.error("Cannot get participants info " + err);
			return null;
		});

		if (!participantsInfo || participantsInfo?.length === 0)
		{
			const errorMessage = "Cannot get participants info for payer: " + payerFspId + " and payee: " + payeeFspId;
			this._logger.error(errorMessage);
			errorEvent = createParticipantPayerInvalidErrorEvent(errorMessage, transferId, payerFspId);
			result.errorEvent = errorEvent;
			return result;
		}

		for (const participantInfo of participantsInfo) {
			if(participantInfo.id === HUB_ID) {
				break;
			}

			if(participantInfo.id !== payerFspId && participantInfo.id !== payeeFspId){
				this._logger.debug(`Participant id mismatch ${participantInfo.id} ${participantInfo.id}`);

				if(participantInfo.id !== payerFspId) {
					const errorMessage = "Invalid participant id for payer: " + payerFspId;
					errorEvent = createParticipantPayerInvalidErrorEvent(errorMessage, transferId, payerFspId);
				} else if(participantInfo.id !== payeeFspId) {
					const errorMessage = "Invalid participant id for payee: " + payerFspId;
					errorEvent = createParticipantPayeeInvalidErrorEvent(errorMessage, transferId, payerFspId);
				}

				result.errorEvent = errorEvent;
				return result;
			}

			// if(!participantInfo.isActive) {
			// 	this._logger.debug(`${participantInfo.id} is not active`);
			// 	if(participantInfo.id !== payerFspId) {
			// 		const errorMessage = "Payer participant id: " + payerFspId + " is not active";
			// 		errorEvent = createParticipantPayerInvalidErrorEvent(errorMessage, transferId, payerFspId);
			// 	} else if(participantInfo.id !== payeeFspId) {
			// 		const errorMessage = "Payee participant id: " + payerFspId + " is not active";
			// 		errorEvent = createParticipantPayeeInvalidErrorEvent(errorMessage, transferId, payerFspId);
			// 	}
			// 	return result;
			// }

		}

		result.participants = participantsInfo;
		return result;
	}

	private async checkLiquidityOrGetErrorEvent(transfer: ITransfer, participantAccounts: ITransferAccounts, payerNdc: string): Promise<{errorEvent:TransferErrorEvent | null, valid: boolean}>{
		let errorEvent!: TransferErrorEvent | null;
		const result = { errorEvent, valid: false };

		try{
			await this._accountAndBalancesAdapter.checkLiquidAndReserve(
				participantAccounts.payerPosAccount.id, participantAccounts.payerLiqAccount.id, participantAccounts.hubAccount.id,
				transfer.amount, transfer.currencyCode, payerNdc, transfer.transferId
			);
		}catch (err: unknown){
			const error = (err as Error).message;
			const errorMessage = `Unable to check liquidity and reserve for transferId: ${transfer.transferId}`;
			this._logger.error(`${errorMessage}: ${transfer.transferId} - ${error}`);
			errorEvent = createLiquidityCheckFailedErrorEvent(errorMessage, transfer.transferId, transfer.payerFspId);
			result.errorEvent = errorEvent;
			return result;
		}

		result.valid = true;
		return result;
	}

	private getTransferParticipantsOrGetErrorEvent(participants: IParticipant[], transfer: ITransfer): {errorEvent:TransferErrorEvent | null, participants:{hub: IParticipant | null, payer: IParticipant | null, payee: IParticipant | null}, valid: boolean}  {
		let errorEvent!:TransferErrorEvent | null;
		const result:{errorEvent:TransferErrorEvent | null, participants:{hub: IParticipant | null, payer: IParticipant | null, payee: IParticipant | null}, valid: boolean}
			= {errorEvent, valid: false, participants: {hub: null, payer: null, payee: null} };

		const transferPayerParticipant = participants.find((value: IParticipant) => value.id === transfer.payerFspId);

		if(!transferPayerParticipant) {
			const errorMessage = "Payer participant not found " + transfer.payerFspId + " for transfer " + transfer.transferId;
			this._logger.error(errorMessage);
			result.errorEvent = createPreparePayerParticipantNotFoundErrorEvent(errorMessage, transfer.transferId, transfer.payerFspId);
			result.valid = false;
			return result;
		}

		const transferPayeeParticipant = participants.find((value: IParticipant) => value.id === transfer.payeeFspId);

		if(!transferPayeeParticipant) {
			const errorMessage = "Payee participant not found " + transfer.payeeFspId + " for transfer " + transfer.transferId;
			this._logger.error(errorMessage);
			result.errorEvent = createPreparePayeeParticipantNotFoundErrorEvent(errorMessage, transfer.transferId, transfer.payerFspId);
			result.valid = false;
			return result;
		}

		const hub = participants.find((value: IParticipant) => value.id === HUB_ID);

		if(!hub) {
			const errorMessage = "Hub participant not found " + HUB_ID + " for transfer " + transfer.transferId;
			this._logger.error(errorMessage);
			result.errorEvent = createPrepareHubParticipantNotFoundErrorEvent(errorMessage, transfer.transferId, transfer.payerFspId);
			result.valid = false;
			return result;
		}

		// TODO enable participant.isActive check once this is implemented over the participants side
		// if (!transferPayerParticipant.isActive) {
		// 	const errorMessage = `Payer participant is not active for transfer: ${transfer.transferId} and payer: ${transfer.payerFspId}`;
		// 	this._logger.error(errorMessage);
		// 	result.errorEvent = createPreparePayerParticipantNotActiveErrorEvent(errorMessage, transfer.transferId, transfer.payerFspId);
		// 	result.valid = false;
		// 	return result;
		// }

		if (!transferPayerParticipant.approved) {
			const errorMessage = `Payer participant is not approved for transfer: ${transfer.transferId} and payer: ${transfer.payerFspId}`;
			this._logger.error(errorMessage);
			result.errorEvent = createPreparePayerParticipantNotApprovedErrorEvent(errorMessage, transfer.transferId, transfer.payerFspId);
			result.valid = false;
			return result;
		}

		// TODO enable participant.isActive check once this is implemented over the participants side
		// if (!transferPayeeParticipant.isActive) {
		// 	const errorMessage = `Payee participant is not active for transfer: ${transfer.transferId} and payee: ${transfer.payeeFspId}`;
		// 	this._logger.error(errorMessage);
		// 	result.errorEvent = createPreparePayeeParticipantNotActiveErrorEvent(errorMessage, transfer.transferId, transfer.payeeFspId);
		// 	result.valid = false;
		// 	return result;
		// }

		if (!transferPayeeParticipant.approved) {
			const errorMessage = `Payee participant is not approved for transfer: ${transfer.transferId} and payee: ${transfer.payeeFspId}`;
			this._logger.error(errorMessage);
			result.errorEvent = createPreparePayeeParticipantNotApprovedErrorEvent(errorMessage, transfer.transferId, transfer.payeeFspId);
			result.valid = false;
			return result;
		}

		result.participants.payer = transferPayerParticipant;
		result.participants.payee = transferPayeeParticipant;
		result.participants.hub = hub;
		result.valid = true;

		return result;
	}


	private getTransferParticipantsAccountsOrGetErrorEvent(transferParticipants: ITransferParticipants, transfer: ITransfer): {errorEvent:TransferErrorEvent | null, participantAccounts: ITransferAccounts | null, valid: boolean}  {
		let errorEvent!:TransferErrorEvent | null;
		const result = {errorEvent, participantAccounts: null, valid: false };

		const { hub, payer: transferPayerParticipant, payee: transferPayeeParticipant } = transferParticipants;

		const hubAccount = hub.participantAccounts
			.find((value: IParticipantAccount) => value.type === AccountType.HUB && value.currencyCode === transfer.currencyCode) ?? null;

		if(!hubAccount) {
			const errorMessage = "Payer participant not found " + transfer.payerFspId + " for transfer " + transfer.transferId;
			this._logger.error(errorMessage);
			result.errorEvent = createPrepareHubParticipantAccountNotFoundErrorEvent(errorMessage, transfer.transferId, transfer.payerFspId);
			result.valid = false;
			return result;
		}

		const payerPosAccount = transferPayerParticipant.participantAccounts
			.find((value: IParticipantAccount) => value.type === AccountType.POSITION && value.currencyCode === transfer.currencyCode) ?? null;
		if(!payerPosAccount) {
			const errorMessage = "Payer participant not found " + transfer.payerFspId + " for transfer " + transfer.transferId;
			this._logger.error(errorMessage);
			result.errorEvent = createPreparePayerParticipantPositionAccountNotFoundErrorEvent(errorMessage, transfer.transferId, transfer.payerFspId);
			result.valid = false;
			return result;
		}

		const payerLiqAccount = transferPayerParticipant.participantAccounts
			.find((value: IParticipantAccount) => value.type === AccountType.SETTLEMENT && value.currencyCode === transfer.currencyCode) ?? null;
		if(!payerLiqAccount) {
			const errorMessage = "Payer participant not found " + transfer.payerFspId + " for transfer " + transfer.transferId;
			this._logger.error(errorMessage);
			result.errorEvent = createPreparePayerParticipantLiquidityAccountNotFoundErrorEvent(errorMessage, transfer.transferId, transfer.payerFspId);
			result.valid = false;
			return result;
		}

		const payeePosAccount = transferPayeeParticipant.participantAccounts
			.find((value: IParticipantAccount) => value.type === AccountType.POSITION && value.currencyCode === transfer.currencyCode) ?? null;
		if(!payeePosAccount) {
			const errorMessage = "Payer participant not found " + transfer.payerFspId + " for transfer " + transfer.transferId;
			this._logger.error(errorMessage);
			result.errorEvent = createPreparePayeeParticipantPositionAccountNotFoundErrorEvent(errorMessage, transfer.transferId, transfer.payerFspId);
			result.valid = false;
			return result;
		}

		const payeeLiqAccount = transferPayeeParticipant.participantAccounts
			.find((value: IParticipantAccount) => value.type === AccountType.SETTLEMENT && value.currencyCode === transfer.currencyCode) ?? null;
		if(!payeeLiqAccount) {
			const errorMessage = "Payer participant not found " + transfer.payerFspId + " for transfer " + transfer.transferId;
			this._logger.error(errorMessage);
			result.errorEvent = createPreparePayeeParticipantLiquidityAccountNotFoundErrorEvent(errorMessage, transfer.transferId, transfer.payerFspId);
			result.valid = false;
			return result;
		}

		result.valid = true;

		return {
			...result,
			...{
				participantAccounts: {
					hubAccount: hubAccount,
					payerPosAccount: payerPosAccount,
					payerLiqAccount: payerLiqAccount,
					payeePosAccount: payeePosAccount,
					payeeLiqAccount: payeeLiqAccount
				}
			}
		};

	}

	//#region Validations
	private validateMessageOrGetErrorEvent(message:CommandMsg): {errorEvent:TransferErrorEvent | null, valid: boolean} {
		let errorEvent!:TransferErrorEvent | null;
		const requesterFspId = message.fspiopOpaqueState?.requesterFspId;
		const transferId = message.payload?.transferId;
		const result = {errorEvent, valid: false};

		if(!message.payload){
			const errorMessage = "Message payload is null or undefined";
			this._logger.error(errorMessage);
			result.errorEvent = createInvalidMessagePayloadErrorEvent(errorMessage,requesterFspId,transferId);
			return result;
		}

		if(!message.msgName){
			const errorMessage = "Message name is null or undefined";
			this._logger.error(errorMessage);
			result.errorEvent = createInvalidMessageTypeErrorEvent(errorMessage,requesterFspId,transferId);
			return result;
		}

		if(message.msgType !== MessageTypes.COMMAND){
			const errorMessage = `Message type is invalid ${message.msgType}`;
			this._logger.error(errorMessage);
			result.errorEvent = createInvalidMessageTypeErrorEvent(errorMessage,requesterFspId,transferId);
			return result;
		}

		result.valid = true;

		return result;
	}


	private async validatePayerParticipantInfoOrGetErrorEvent(transferId :string, participantId: string | null):Promise<{errorEvent:TransferErrorEvent | null, valid: boolean}>{
		let participant: IParticipant | null = null;
		let errorEvent!: TransferErrorEvent | null;
		const result = { errorEvent, valid: false };

		if(!participantId){
			const errorMessage = "Fsp Id is null or undefined";
			this._logger.error(errorMessage);
			errorEvent = createTransferQueryParticipantPayerInvalidErrorEvent(errorMessage, transferId, participantId);
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
			errorEvent = createPayerParticipantNotFoundErrorEvent(errorMessage, transferId, participantId);
			result.errorEvent = errorEvent;
			return result;
		}

		if(participant.id !== participantId){
			const errorMessage = `Participant id mismatch ${participant.id} ${participantId}`;
			this._logger.error(errorMessage);
			errorEvent = createInvalidPayerParticipantIdErrorEvent(errorMessage, transferId ,participantId);
			result.errorEvent = errorEvent;
			return result;
		}

		// TODO enable participant.isActive check once this is implemented over the participants side
		// if(!participant.isActive) {
			// 	this._logger.debug(`${participant.id} is not active`);
			// 	throw new RequiredParticipantIsNotActive();
		// }
		result.valid = true;

		return result;
	}

	private async validatePayeeParticipantInfoOrGetErrorEvent(transferId :string, participantId: string | null):Promise<{errorEvent:TransferErrorEvent | null, valid: boolean}>{
		let participant: IParticipant | null = null;
		let errorEvent!: TransferErrorEvent | null;
		const result = { errorEvent, valid: false };

		if(!participantId){
			const errorMessage = "Fsp Id is null or undefined";
			this._logger.error(errorMessage);
			errorEvent = createTransferQueryParticipantPayeeInvalidErrorEvent(errorMessage, transferId, participantId);
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
			errorEvent = createPayeeParticipantNotFoundErrorEvent(errorMessage, transferId ,participantId);
			result.errorEvent = errorEvent;
			return result;
		}

		if(participant.id !== participantId){
			const errorMessage = `Participant id mismatch ${participant.id} ${participantId}`;
			this._logger.error(errorMessage);
			errorEvent = createInvalidPayeeParticipantIdErrorEvent(errorMessage, transferId ,participantId);
			result.errorEvent = errorEvent;
			return result;
		}

		// TODO enable participant.isActive check once this is implemented over the participants side
		// if(!participant.isActive) {
			// 	this._logger.debug(`${participant.id} is not active`);
			// 	throw new RequiredParticipantIsNotActive();
		// }
		result.valid = true;

		return result;
	}
	//#endregion

	private async getTransferByIrOrGetErrorEvent(transferId:string, fspId:string): Promise<{errorEvent:TransferErrorEvent | null, valid: boolean, transfer:ITransfer | null}> {
		let transfer!: ITransfer | null;
		let errorEvent!: TransferErrorEvent;

		const result = { errorEvent, transfer, valid: true };

		try {
			transfer = await this._transfersRepo.getTransferById(transferId);
		} catch(err: unknown){
			const error = (err as Error).message;
			const errorMessage = `Unable to get transfer record for transferId: ${transferId} from repository`;
			this._logger.error(errorMessage + error);
			result.errorEvent = createUnableToGetTransferByIdErrorEvent(errorMessage, transferId, fspId);
			result.valid = false;
			return result;
		}

		if(!transfer){
			const errorMessage = `TransferId: ${transferId} could not be found`;
			this._logger.debug(errorMessage);
			result.errorEvent = createTransferNotFoundErrorEvent(errorMessage, transferId, fspId);
			result.valid = false;
		}

		if(!result.valid) {
			return result;
		}

		result.transfer = transfer;
		return result;

	}


	private async abortTransferAndGetErrorEvent(transfer: ITransfer): Promise<{errorEvent:TransferErrorEvent | null, valid: boolean}>{
		let errorEvent!: TransferErrorEvent | null;
		const result = { errorEvent, valid: false };

		const previousState = transfer.transferState;

		transfer.transferState = TransferState.ABORTED;
		await this._transfersRepo.updateTransfer(transfer);

		switch(previousState) {
			case TransferState.RECEIVED: {
				const errorMessage = `TransferPrepareRequestTimedoutEvt for transferId: ${transfer.transferId}`;
				this._logger.error(`${errorMessage}: ${transfer.transferId}`);
				errorEvent = createTransferPrepareTimedoutErrorEvent(errorMessage, transfer.transferId, transfer.payerFspId);
				result.errorEvent = errorEvent;
				break;
			}
			case TransferState.RESERVED: {
				const errorMessage = `TransferFulfilPreCommittedRequestTimedoutEvt for transferId: ${transfer.transferId}`;
				this._logger.error(`${errorMessage}: ${transfer.transferId}`);
				errorEvent = createTransferPreCommittedTimedoutErrorEvent(errorMessage, transfer.transferId, transfer.payerFspId);
				result.errorEvent = errorEvent;
				break;
			}
			case TransferState.COMMITTED: {
				const errorMessage = `TransferFulfilPostCommittedRequestedTimedoutEvt for transferId: ${transfer.transferId}`;
				this._logger.error(`${errorMessage}: ${transfer.transferId}`);
				errorEvent = createTransferPostCommittedTimedoutErrorEvent(errorMessage, transfer.transferId, transfer.payerFspId);
				result.errorEvent = errorEvent;
				break;
			}
		}

		return result;
	}

	private async cancelReservationOrGetErrorEvent(transfer: ITransfer, participantTransferAccounts:ITransferAccounts): Promise<{errorEvent:TransferErrorEvent | null, valid: boolean}>{
		let errorEvent!: TransferErrorEvent | null;
		const result = { errorEvent, valid: false };

		await this._accountAndBalancesAdapter.cancelReservation(
			participantTransferAccounts.payerPosAccount.id, participantTransferAccounts.hubAccount.id,
			transfer.amount, transfer.currencyCode, transfer.transferId
		).catch((err) => {
			const errorMessage = `Unable to cancel reservation with transferId: ${transfer.transferId} for payer: ${transfer.payerFspId} and payee: ${transfer.payeeFspId}`;
			this._logger.error(errorMessage + " " + err.message);
			result.errorEvent = createUnableToCancelReservationErrorEvent(errorMessage, transfer.transferId, transfer.payerFspId);
			result.valid = false;
			return false;
		});

		if(!result.valid) {
			return result;
		}

		result.valid = true;
		return result;
	}

	private async cancelReservationAndCommitOrGetErrorEvent(transfer: ITransfer, participantTransferAccounts:ITransferAccounts): Promise<{errorEvent:TransferErrorEvent | null, valid: boolean}>{
		let errorEvent!: TransferErrorEvent | null;
		const result = { errorEvent, valid: true };

		await this._accountAndBalancesAdapter.cancelReservationAndCommit(
			participantTransferAccounts.payerPosAccount.id, participantTransferAccounts.payeePosAccount.id, participantTransferAccounts.hubAccount.id,
			transfer.amount, transfer.currencyCode, transfer.transferId
		).catch((err) => {
			const errorMessage = `Unable to commit transferId: ${transfer.transferId} for payer: ${transfer.payerFspId} and payee: ${transfer.payeeFspId}`;
			this._logger.error(errorMessage + " " + err.message);
			result.errorEvent = createUnableToCancelReservationAndCommitErrorEvent(errorMessage, transfer.transferId, transfer.payerFspId);
			result.valid = false;
			return false;
		});

		if(!result.valid) {
			return result;
		}

		result.valid = true;
		return result;
	}

	//#region Transfers database operations
	private async addTransferOrGetErrorEvent(fspId:string, transfer: ITransfer): Promise<{errorEvent: TransferErrorEvent| null, valid: boolean}> {
		let errorEvent!: TransferErrorEvent | null;
		const result = { errorEvent, valid: false };

		const transferAddedToDatabase = await this._transfersRepo.addTransfer(transfer).catch((err) => {
			const errorMessage = `Error adding transfer for transferId: ${transfer.transferId}.`;
			this._logger.error(errorMessage + " " + err.message);
			result.errorEvent = createUnableToAddTransferToDatabaseErrorEvent(errorMessage, transfer.transferId, fspId);
			return false;
		});

		if(!transferAddedToDatabase){
			const errorMessage = `Error adding transfer to database: ${transfer.transferId}`;
			result.errorEvent = createUnableToAddTransferToDatabaseErrorEvent(errorMessage, transfer.transferId, fspId);
			return result;
		}

		result.valid = true;
		return result;
	}

	private async updateTransferOrGetErrorEvent(transfer:ITransfer, requesterFspId: string, transferFields: TransferUpdatableFields): Promise<{errorEvent: TransferErrorEvent| null, valid: boolean}> {
		let errorEvent!: TransferErrorEvent | null;
		const result = { errorEvent, valid: false };

		transfer.transferState = transferFields.transferState;
		transfer.updatedAt = Date.now();

		const transferUpdated = await this._transfersRepo.updateTransfer(transfer).catch((err) => {
			const errorMessage = `Error updating transfer for transferId: ${transfer.transferId}.`;
			this._logger.error(errorMessage + " " + err.message);
			result.errorEvent = createUnableToUpdateTransferInDatabaseErrorEvent(errorMessage, requesterFspId, transfer.transferId);
			return false;
		});

		if (!transferUpdated) {
			return result;
		}

		result.valid = true;
		return result;
	}
	//#endregion

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
