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
import {
	CheckLiquidityAndReserveFailedError,
	InvalidMessagePayloadError,
	InvalidMessageTypeError,
	InvalidParticipantIdError,
	NoSuchAccountError,
	NoSuchParticipantError,
	NoSuchTransferError,
	RequiredParticipantIsNotActive,
	UnableToCancelTransferError,
	UnableToCommitTransferError,
	UnableToGetParticipantAccountsError,
	UnableToProcessMessageError
} from "./errors";
import {IParticipantsServiceAdapter, ITransfersRepository} from "./interfaces/infrastructure";
import {AccountType, ITransfer, ITransferAccounts, ITransferParticipants, TransferErrorEvent, TransferState} from "./types";
import { IParticipant, IParticipantAccount } from "@mojaloop/participant-bc-public-types-lib";
import { createInvalidPayeeParticipantIdErrorEvent,
	createInvalidPayerParticipantIdErrorEvent,
	createLiquidityCheckFailedErrorEvent,
	createParticipantPayeeInvalidErrorEvent,
	createParticipantPayerInvalidErrorEvent,
	createPayeeParticipantNotFoundErrorEvent,
	createPayerParticipantNotFoundErrorEvent,
	createTransferNotFoundErrorEvent,
	createTransferPrepareTimedoutErrorEvent,
	createTransferQueryParticipantPayeeInvalidErrorEvent,
	createTransferQueryParticipantPayerInvalidErrorEvent,
	createUnableToGetTransferByIdErrorEvent
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

	async handleTransferCommand(message: CommandMsg): Promise<void> {
		this._logger.debug(`Got message in handleTransfersEvent handler - msgName: ${message.msgName}`);

		try{
			const isMessageValid = this.validateMessage(message);
			if(isMessageValid) {
				await this.processCommand(message);
			}
		} catch(error:unknown) {
			const errorMessage = error instanceof Error ? error.constructor.name : "Unexpected Error";
			this._logger.error(`Error processing event : ${message.msgName} -> ` + errorMessage);

			// const errorPayload: TransferErrorEvtPayload = {
			// 	errorMsg: errorMessage,
			// 	transferId: message.payload?.transferId,
			// 	sourceEvent: message.msgName,
			// 	requesterFspId: message.fspiopOpaqueState?.requesterFspId ?? null,
			// 	destinationFspId: message.fspiopOpaqueState?.destinationFspId ?? null,

			// };

			// const messageToPublish = new TransferErrorEvt(errorPayload);
			// messageToPublish.fspiopOpaqueState = message.fspiopOpaqueState;
			// await this._messageProducer.send(messageToPublish);
		}
	}

	private validateMessage(message:CommandMsg): boolean {
		if(!message.payload){
			this._logger.error(`TransferCommandHandler: message payload has invalid format or value`);
			throw new InvalidMessagePayloadError();
		}

		if(!message.msgName){
			this._logger.error(`TransferCommandHandler: message name is invalid`);
			throw new InvalidMessageTypeError();
		}

		// if(message.msgType !== MessageTypes.DOMAIN_EVENT){
		// 	this._logger.error(`TransferCommandHandler: message type is invalid : ${message.msgType}`);
		// 	throw new InvalidMessageTypeError();
		// }

		return true;
	}

	async processCommand(command: CommandMsg){
		// switch command type and call specific private method

		let eventToPublish:any = null;
		let commandEvt = null;

		switch(command.msgName){
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
			default:
				this._logger.error(`message type has invalid format or value ${command.msgName}`);
				throw new InvalidMessageTypeError();
			}

		if(eventToPublish){
			if(Array.isArray(eventToPublish)){
				for await (const event of eventToPublish){
					event.fspiopOpaqueState = commandEvt.fspiopOpaqueState;
					await this._messageProducer.send(event);
				}
			}else {
				eventToPublish.fspiopOpaqueState = commandEvt.fspiopOpaqueState;
				await this._messageProducer.send(eventToPublish);
			}
		}else{
			throw new UnableToProcessMessageError();
		}

	}

	private async prepareTransfer(message: TransferPrepareRequestedEvt):Promise<TransferPreparedEvt | TransferErrorEvent> {
		this._logger.debug(`prepareTransfer() - Got transferPreparedReceivedEvt msg for transferId: ${message.payload.transferId}`);

		// TODO call the settlements lib to get the correct settlement model
		// export function obtainSettlementModelFrom(
		// 	transferAmount: bigint,
		// 	debitAccountCurrency: string,
		// 	creditAccountCurrency: string
		// ): Promise<string> {
		const settlementModel = "DEFAULT"; // FIXED for now

		const now = Date.now();

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
			errorInformation: null
		};

		await this._transfersRepo.addTransfer(transfer);

		// Replace this code with corresponding SchedulingBC function call
		const transferExpiryTime = new Date(transfer.expirationTimestamp).valueOf();
		const transferTimeout = await this._transfersRepo.getTransferById(message.payload.transferId);
		const currentTime = Date.now();

		if(currentTime > transferExpiryTime) {
			this._logger.error("Throwing a TransferPrepareRequestTimedout event!")
			
			const abortedTransfer = await this.abortTransferAndGetErrorEvent(transfer);

			if(!abortedTransfer.valid){
				this._logger.error(`Aborted transfer for transferId: ${transfer.transferId}`);
				return abortedTransfer.errorEvent as TransferErrorEvent;
			}
			this._logger.debug("Current state of transfer during TransferPrepareRequestedEvt: ", transferTimeout?.transferState);
		}
		
		

		const participantsInfo = await this.getParticipantsInfoOrGetErrorEvent(transfer.transferId, transfer?.payerFspId, transfer?.payeeFspId);

		if(participantsInfo.participants.length === 0){
			this._logger.error(`Invalid participants info for payerFspId: ${transfer.payerFspId} and payeeFspId: ${transfer.payeeFspId}`);
			return participantsInfo.errorEvent as TransferErrorEvent;
		}


		const transferParticipants = this.getTransferParticipants(participantsInfo.participants, transfer);

		// if(transferParticipants.=== 0){
		// 	this._logger.error(`Invalid participants info for payerFspId: ${transfer.payerFspId} and payeeFspId: ${transfer.payeeFspId}`);
		// 	return participantsInfo.errorEvent as TransferErrorEvent;
		// }

		const participantAccounts = this.getTransferParticipantsAccounts(transferParticipants,transfer);

		// TODO put net debit cap in the participant struct
		const payerNdc = "0";

		const liquidityCheck = await this.checkLiquidityOrGetErrorEvent(transfer, participantAccounts, payerNdc);

		if(!liquidityCheck.valid){
			this._logger.error(`Unable to check liquidity and reserve for transferId: ${transfer.transferId}`);
			return liquidityCheck.errorEvent as TransferErrorEvent;
		}

		transfer.transferState = TransferState.RESERVED;
		await this._transfersRepo.updateTransfer(transfer);

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

	private async fulfilTransfer(message: TransferFulfilCommittedRequestedEvt):Promise<any> {
		this._logger.debug(`fulfilTransfer() - Got transferFulfilCommittedEvt msg for transferId: ${message.payload.transferId}`);

		let participantTransferAccounts: ITransferAccounts | null = null;

		const transferRecord = await this._transfersRepo.getTransferById(message.payload.transferId);

		try{

			if(!transferRecord) {
				throw new NoSuchTransferError();
			}
			const participantsInfo = await this.getParticipantsInfoOrGetErrorEvent(transferRecord.transferId, transferRecord?.payerFspId, transferRecord?.payeeFspId);
			
			if(participantsInfo.participants.length === 0){
				this._logger.error(`Invalid participants info for payerFspId: ${transferRecord.payerFspId} and payeeFspId: ${transferRecord.payeeFspId}`);
				return participantsInfo.errorEvent as TransferErrorEvent;
			}

			const transferParticipants = this.getTransferParticipants(participantsInfo.participants, transferRecord);
			participantTransferAccounts = this.getTransferParticipantsAccounts(transferParticipants,transferRecord);
		}
		catch (error: any){
			this._logger.error(error.message);
			await this.cancelTransfer(transferRecord, participantTransferAccounts);
			throw error;
		}

		try{
			await this._accountAndBalancesAdapter.cancelReservationAndCommit(
				participantTransferAccounts.payerPosAccount.id, participantTransferAccounts.payeePosAccount.id, participantTransferAccounts.hubAccount.id,
				transferRecord.amount, transferRecord.currencyCode, transferRecord.transferId
			);

			transferRecord.updatedAt = Date.now();
			transferRecord.transferState = TransferState.COMMITTED;

			await this._transfersRepo.updateTransfer({
				...transferRecord,
				transferState: message.payload.transferState as TransferState,
				fulFillment: message.payload.fulfilment,
				completedTimestamp: message.payload.completedTimestamp,
				extensionList: message.payload.extensionList
			});
		} catch (error: any) {
			// TODO revert the reservation after we try to cancelReservationAndCommit
			const errorMessage = `Unable to commit transferId: ${transferRecord.transferId} for payer: ${transferRecord.payerFspId} and payee: ${transferRecord.payeeFspId}`;
			this._logger.error(errorMessage, error);
			throw new UnableToCommitTransferError(errorMessage);
		}

		const payload: TransferCommittedFulfiledEvtPayload = {
			transferId: message.payload.transferId,
			transferState: message.payload.transferState,
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
		if(!transferRecord.transfer){
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

	private async rejectTransfer(message: TransferRejectRequestedEvt):Promise<any> {
		this._logger.debug(`rejectTransfer() - Got transferRejectRequesteddEvt msg for transferId: ${message.payload.transferId}`);

		let participantTransferAccounts: ITransferAccounts | null = null;

		const transferRecord = await this._transfersRepo.getTransferById(message.payload.transferId);

		try{

			if(!transferRecord) {
				throw new NoSuchTransferError();
			}
			const participantsInfo = await this.getParticipantsInfoOrGetErrorEvent(transferRecord.transferId, transferRecord?.payerFspId, transferRecord?.payeeFspId);
			
			if(participantsInfo.participants.length === 0){
				this._logger.error(`Invalid participants info for payerFspId: ${transferRecord.payerFspId} and payeeFspId: ${transferRecord.payeeFspId}`);
				return participantsInfo.errorEvent as TransferErrorEvent;
			}

			const transferParticipants = this.getTransferParticipants(participantsInfo.participants, transferRecord);
			participantTransferAccounts = this.getTransferParticipantsAccounts(transferParticipants,transferRecord);

			this.payeeRejectTransfer(transferRecord, participantTransferAccounts)

		}
		catch (error: any){
			this._logger.error(error.message);
			await this.cancelTransfer(transferRecord, participantTransferAccounts);
			throw error;
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
		let participants: IParticipant[] = [];
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

	private async checkLiquidityOrGetErrorEvent(transfer: ITransfer, participantAccounts: any, payerNdc: string): Promise<{errorEvent:TransferErrorEvent | null, valid: boolean}>{
		let errorEvent!: TransferErrorEvent | null;
		const result = { errorEvent, valid: false };

		try{
			await this._accountAndBalancesAdapter.checkLiquidAndReserve(
				participantAccounts.payerPosAccount.id, participantAccounts.payerLiqAccount.id, participantAccounts.hubAccount.id,
				transfer.amount, transfer.currencyCode, payerNdc, transfer.transferId
			);
		}catch (error: any){
			const errorMessage = `Unable to check liquidity and reserve for transferId: ${transfer.transferId}`;
			this._logger.error(`${errorMessage}: ${transfer.transferId} - ${error?.message}`);
			errorEvent = createLiquidityCheckFailedErrorEvent(errorMessage, transfer.transferId, transfer.payerFspId);
			result.errorEvent = errorEvent;
			return result;
		}

		result.valid = true;
		return result;
	}

	private getTransferParticipants(participants: IParticipant[], transfer: ITransfer): ITransferParticipants  {
		const transferPayerParticipant = participants.find((value: IParticipant) => value.id === transfer.payerFspId) ??
			(() => {
				const errorMessage = "Payer participant not found " + transfer.payerFspId + " for transfer " + transfer.transferId;
				this._logger.error(errorMessage);
				throw new NoSuchParticipantError(errorMessage);
			})();

		const transferPayeeParticipant = participants.find((value: IParticipant) => value.id === transfer.payeeFspId) ??
			(() => {
				const errorMessage = "Payee participant not found " + transfer.payeeFspId + " for transfer " + transfer.transferId;
				this._logger.error(errorMessage);
				throw new NoSuchParticipantError(errorMessage);
			})();

		const hub = participants.find((value: IParticipant) => value.id === HUB_ID) ??
			(() => {
				const errorMessage = "Hub not found " + HUB_ID + " for transfer " + transfer.transferId;
				this._logger.error(errorMessage);
				throw new NoSuchParticipantError(errorMessage);
			})();

		// TODO reactivate participant.isActive check
		// if (!payerFsp.isActive || !payerFsp.approved || !payeeFsp.isActive || !payeeFsp.approved) {//} || !payerFsp.isActive || !payerFsp.approved){
		if (!transferPayerParticipant.approved || !transferPayeeParticipant.approved) {
			const errorMessage = "Payer or payee participants are not active and approved for transfer " + transfer.transferId;
			this._logger.error(errorMessage);
			throw new RequiredParticipantIsNotActive(errorMessage);
		}

		return { hub, payer: transferPayerParticipant, payee: transferPayeeParticipant };
	}


	private getTransferParticipantsAccounts(transferParticipants: ITransferParticipants, transfer: ITransfer): ITransferAccounts  {

		const { hub, payer: transferPayerParticipant, payee: transferPayeeParticipant } = transferParticipants;

		const hubAccount = hub.participantAccounts
			.find((value: IParticipantAccount) => value.type === AccountType.HUB && value.currencyCode === transfer.currencyCode) ?? null;
		const payerPosAccount = transferPayerParticipant.participantAccounts
			.find((value: IParticipantAccount) => value.type === AccountType.POSITION && value.currencyCode === transfer.currencyCode) ?? null;
		const payerLiqAccount = transferPayerParticipant.participantAccounts
			.find((value: IParticipantAccount) => value.type === AccountType.SETTLEMENT && value.currencyCode === transfer.currencyCode) ?? null;
		const payeePosAccount = transferPayeeParticipant.participantAccounts
			.find((value: IParticipantAccount) => value.type === AccountType.POSITION && value.currencyCode === transfer.currencyCode) ?? null;
		const payeeLiqAccount = transferPayeeParticipant.participantAccounts
			.find((value: IParticipantAccount) => value.type === AccountType.SETTLEMENT && value.currencyCode === transfer.currencyCode) ?? null;

		if (!hubAccount || !payerPosAccount || !payerLiqAccount || !payeePosAccount || !payeeLiqAccount) {
			const errorMessage = "Could not get hub, payer or payee accounts from participant for transfer " + transfer.transferId;
			this._logger.error(errorMessage);
			throw new NoSuchAccountError(errorMessage);
		}

		return {
			hubAccount: hubAccount,
			payerPosAccount: payerPosAccount,
			payerLiqAccount: payerLiqAccount,
			payeePosAccount: payeePosAccount,
			payeeLiqAccount: payeeLiqAccount
		};
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
			.catch((error:any) => {
				this._logger.error(`Error getting participant info for participantId: ${participantId} - ${error?.message}`);
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
			.catch((error:any) => {
				this._logger.error(`Error getting participant info for participantId: ${participantId} - ${error?.message}`);
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

	private async getTransferByIrOrGetErrorEvent(transferId:string, fspId:string): Promise<{errorEvent:TransferErrorEvent, transfer:ITransfer | null}> {
		let transfer!: ITransfer | null;
		let errorEvent!: TransferErrorEvent;

		const result = { errorEvent, transfer };

		try{
			transfer = await this._transfersRepo.getTransferById(transferId);
		}
		catch(error:any){
			const errorMessage = `Unable to get transfer record for transferId: ${transferId} from repository`;
			this._logger.error(errorMessage + error.message);
			result.errorEvent = createUnableToGetTransferByIdErrorEvent(errorMessage, transferId, fspId);
			return result;
		}

		if(!transfer){
			const errorMessage = `TransferId: ${transferId} could not be found`;
			this._logger.debug(errorMessage);
			result.errorEvent = createTransferNotFoundErrorEvent(errorMessage, transferId, fspId);
		}

		result.transfer = transfer;
		return result;

	}

	private async cancelTransfer(transferRecord: ITransfer | null, participantAccounts: ITransferAccounts | null) {
		if (transferRecord && participantAccounts) {
			transferRecord.transferState = TransferState.ABORTED;

			try{
				await this._transfersRepo.updateTransfer(transferRecord);

				await this._accountAndBalancesAdapter.cancelReservation(
					participantAccounts.payerPosAccount.id, participantAccounts.hubAccount.id,
					transferRecord.amount, transferRecord.currencyCode, transferRecord.transferId);
			}
			catch(err){
				const errorMessage = `Error cancelling transfer ${transferRecord.transferId} ${err}`;
				this._logger.error(errorMessage);
				throw new UnableToCancelTransferError(errorMessage);
			}
		}

	}

	private async payeeRejectTransfer(transferRecord: ITransfer | null, participantAccounts: ITransferAccounts | null) {
		if (transferRecord && participantAccounts) {
			transferRecord.transferState = TransferState.REJECTED;

			try{
				await this._transfersRepo.updateTransfer(transferRecord);

				// await this._accountAndBalancesAdapter.cancelReservation(
				// 	participantAccounts.payerPosAccount.id, participantAccounts.hubAccount.id,
				// 	transferRecord.amount, transferRecord.currencyCode, transferRecord.transferId
				// );
			}
			catch(err){
				const errorMessage = `Error rejecting transfer ${transferRecord.transferId} ${err}`;
				this._logger.error(errorMessage);
				throw new UnableToCancelTransferError(errorMessage);
			}
		}

	}

	private async abortTransferAndGetErrorEvent(transfer: ITransfer): Promise<{errorEvent:TransferErrorEvent | null, valid: boolean}>{
		let errorEvent!: TransferErrorEvent | null;
		const result = { errorEvent, valid: false };

		transfer.transferState = TransferState.ABORTED;
		await this._transfersRepo.updateTransfer(transfer);
		
		const errorMessage = `Aborted timedout transfer for transferId: ${transfer.transferId}`;
		this._logger.error(`${errorMessage}: ${transfer.transferId}`);
		errorEvent = createTransferPrepareTimedoutErrorEvent(errorMessage, transfer.transferId, transfer.payerFspId);
		result.errorEvent = errorEvent;	

		result.valid = false;
		return result;
	}

}
