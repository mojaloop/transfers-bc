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
	TransferErrorEvt,
	TransferErrorEvtPayload
} from "@mojaloop/platform-shared-lib-public-messages-lib";
import {PrepareTransferCmd, CommitTransferFulfilCmd} from "./commands";
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
import {AccountType, ITransfer, ITransferAccounts, ITransferParticipants, TransferState} from "./types";
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

			const errorPayload: TransferErrorEvtPayload = {
				errorMsg: errorMessage,
				transferId: message.payload?.transferId,
				sourceEvent: message.msgName,
				requesterFspId: message.fspiopOpaqueState?.requesterFspId ?? null,
				destinationFspId: message.fspiopOpaqueState?.destinationFspId ?? null,

			};

			const messageToPublish = new TransferErrorEvt(errorPayload);
			messageToPublish.fspiopOpaqueState = message.fspiopOpaqueState;
			await this._messageProducer.send(messageToPublish);
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

		if(message.msgType !== MessageTypes.DOMAIN_EVENT){
			this._logger.error(`TransferCommandHandler: message type is invalid : ${message.msgType}`);
			throw new InvalidMessageTypeError();
		}

		return true;
	}

	async processCommand(command: CommandMsg){
		// switch command type and call specific private method

		let eventToPublish = null;
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

	private async prepareTransfer(message: TransferPrepareRequestedEvt):Promise<TransferPreparedEvt> {
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

		const participants = await this.getParticipantsInfo(transfer?.payerFspId, transfer?.payeeFspId);

		const transferParticipants = this.getTransferParticipants(participants, transfer);

		const participantAccounts = this.getTransferParticipantsAccounts(transferParticipants,transfer);

		// TODO put net debit cap in the participant struct
		const payerNdc = "0";

		try{
			await this._accountAndBalancesAdapter.checkLiquidAndReserve(
				participantAccounts.payerPosAccount.id, participantAccounts.payerLiqAccount.id, participantAccounts.hubAccount.id,
				transfer.amount, transfer.currencyCode, payerNdc, transfer.transferId
			);
		}catch (error){
			const errorMessage = `Unable to check liquidity and reserve for transferId: ${transfer.transferId}`;
			this._logger.error(errorMessage , error);
			transfer.transferState = TransferState.REJECTED;
			await this._transfersRepo.updateTransfer(transfer);
			throw new CheckLiquidityAndReserveFailedError(errorMessage);
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
			const participants = await this.getParticipantsInfo(transferRecord.payerFspId, transferRecord.payeeFspId);
			const transferParticipants = this.getTransferParticipants(participants, transferRecord);
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

	private async getParticipantsInfo(payerFspId:string, payeeFspId: string): Promise<IParticipant[]>{
		// TODO get all participants in a single call with participantsClient.getParticipantsByIds()
			const participants = await this._participantAdapter.getParticipantsInfo([payerFspId, payeeFspId, HUB_ID]).catch((err) => {
				this._logger.error("Cannot get participants info " + err);
				return null;
			});

			if (!participants || participants?.length == 0)
			{
				const errorMessage = "Cannot get participants info for payer: " + payerFspId + " and payee: " + payeeFspId;
				this._logger.error(errorMessage);
				throw new NoSuchParticipantError(errorMessage);
			}

			for (const participant of participants) {
				if(participant.id === HUB_ID) {
					break;
				}

				if(participant.id !== payerFspId && participant.id !== payeeFspId){
					this._logger.debug(`Participant id mismatch ${participant.id} ${participant.id}`);
					throw new InvalidParticipantIdError();
				}
	
				if(!participant.isActive) {
					this._logger.debug(`${participant.id} is not active`);
					throw new RequiredParticipantIsNotActive();
				}
				
			}

			return participants;
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

	private async validateParticipant(participantId: string | null):Promise<void>{
		if(participantId){
			const participant = await this._participantAdapter.getParticipantInfo(participantId);

			if(!participant) {
				this._logger.debug(`No participant found`);
				throw new NoSuchParticipantError();
			}

			if(!participant.isActive) {
				this._logger.debug(`${participant.id} is not active`);
				throw new RequiredParticipantIsNotActive();
			}
		}

		return;
	}

	private async cancelTransfer(transferRecord: ITransfer | null, participantAccounts: ITransferAccounts | null) {
		if (transferRecord && participantAccounts) {
			transferRecord.transferState = TransferState.REJECTED;

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

}
