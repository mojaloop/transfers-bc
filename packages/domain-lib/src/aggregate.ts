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
import {CommandMsg, IMessageProducer} from "@mojaloop/platform-shared-lib-messaging-types-lib";
import {
	TransferCommittedFulfiledEvt,
	TransferCommittedFulfiledEvtPayload,
	TransferFulfilCommittedRequestedEvt,
	TransferPreparedEvt,
	TransferPreparedEvtPayload,
	TransferPrepareRequestedEvt
} from "@mojaloop/platform-shared-lib-public-messages-lib";
import {PrepareTransferCmd, TransferFulfilCommittedCmd} from "@mojaloop/transfers-bc-domain-lib";
import {IAccountsBalancesAdapter} from "./interfaces/iparticipant_account_balances_adapter";
import {
	CheckLiquidityAndReserveFailedError,
	InvalidMessageTypeError,
	NoSuchParticipantError,
	NoSuchTransferError,
	RequiredParticipantIsNotActive,
	UnableToProcessMessageError
} from "./errors";
import {IParticipantsServiceAdapter, ITransfersRepository} from "./interfaces/infrastructure";
import {ITransfer, ITransferAccounts, TransferState} from "./types";
import { IParticipantAccount } from "@mojaloop/participant-bc-public-types-lib";

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
		this._messageProducer.connect();
	}

	async processCommand(command: CommandMsg){
		// switch command type and call specific private method

		let eventToPublish = null;

		switch(command.msgName){
			case PrepareTransferCmd.name:
				eventToPublish = await this.transferPreparedReceivedEvt(command as TransferPrepareRequestedEvt);
				break;
			case TransferFulfilCommittedCmd.name:
				eventToPublish = await this.transferFulfilCommittedEvt(command as TransferFulfilCommittedRequestedEvt);
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

		const transfer: ITransfer = {
			transferId: message.payload.transferId,
			payeeFspId: message.payload.payeeFsp,
			payerFspId: message.payload.payerFsp,
			amount: message.payload.amount,
			currencyCode: message.payload.currencyCode,
			ilpPacket: message.payload.ilpPacket,
			condition: message.payload.condition,
			expirationTimestamp: message.payload.expiration,
			transferState: TransferState.RECEIVED,
			fulfilment: null,
			completedTimestamp: null,
			extensionList: message.payload.extensionList
		};

		await this._transfersRepo.addTransfer(transfer);

		// TODO call the settlements lib to get the correct settlement model
		// export function obtainSettlementModelFrom(
		// 	transferAmount: bigint,
		// 	debitAccountCurrency: string,
		// 	creditAccountCurrency: string
		// ): Promise<string> {

		try{
			const participantAccounts = await this.getParticipantAccounts(transfer);
			
			// TODO put net debit cap in the participant struct
			const payerNdc = "0";
			
			await this._accountAndBalancesAdapter.checkLiquidAndReserve(
				participantAccounts.payerPosAccount.id, participantAccounts.payerLiqAccount.id, participantAccounts.hubAccount.id,
				transfer.amount, transfer.currencyCode, payerNdc, transfer.transferId
			);
		}catch (error){
			const err = new CheckLiquidityAndReserveFailedError("checkLiquidAndReserve failed");
			this._logger.error(err);

			// update the state of the transfer in the repo
			transfer.transferState = TransferState.REJECTED;
			await this._transfersRepo.updateTransfer(transfer);

			throw err;
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

	private async transferFulfilCommittedEvt(message: TransferFulfilCommittedRequestedEvt):Promise<TransferCommittedFulfiledEvt> {
		this._logger.debug(`Got transferFulfilCommittedEvt msg for transferId: ${message.payload.transferId}`);

		let participantAccounts: ITransferAccounts | null = null;
	
		const transferRec = await this._transfersRepo.getTransferById(message.payload.transferId);

		try {
			if (!transferRec) {
				throw new NoSuchParticipantError();
			}

			participantAccounts = await this.getParticipantAccounts(transferRec);
			
		}catch(error){
			const err = new Error("Could not get either recorded transfer or hub, payer or payee accounts from participant");
			this._logger.error(err);
			// await this._accountAndBalancesAdapter.cancelReservation()
			throw err;
		}

		try{
			if (!transferRec) {
				throw new NoSuchTransferError();
			}

			if(!participantAccounts) {
				throw new Error("Could not get either recorded transfer or hub, payer or payee accounts from participant");
			}
			
			await this._accountAndBalancesAdapter.cancelReservationAndCommit(
				participantAccounts.payerPosAccount.id, participantAccounts.payeePosAccount.id, participantAccounts.hubAccount.id,
				transferRec.amount, transferRec.currencyCode, transferRec.transferId,
			);

			transferRec.transferState = TransferState.COMMITTED;

			await this._transfersRepo.updateTransfer({
				...transferRec,
				transferState: message.payload.transferState as TransferState,
				fulfilment: message.payload.fulfilment,
				completedTimestamp: message.payload.completedTimestamp,
				extensionList: message.payload.extensionList
			});


		}catch(error){
			// log and revert
			// TODO revert the reservation after we try to cancelReservationAndCommit
			const err = new Error("Cannot get hub participant information");
			this._logger.error(err);
			throw err;
		}

		const payload: TransferCommittedFulfiledEvtPayload = {
			transferId: message.payload.transferId,
			transferState: message.payload.transferState,
			fulfilment: message.payload.fulfilment,
			completedTimestamp: message.payload.completedTimestamp,
			extensionList: message.payload.extensionList
		};

		const retEvent = new TransferCommittedFulfiledEvt(payload);

		retEvent.fspiopOpaqueState = message.fspiopOpaqueState;

		return retEvent;
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

	private async getParticipantAccounts(transfer: ITransfer): Promise<ITransferAccounts>{
		// TODO get all participants in a single call with participantsClient.getParticipantsByIds()
		const payerFsp = await this._participantAdapter.getParticipantInfo(transfer.payerFspId);
		const payeeFsp = await this._participantAdapter.getParticipantInfo(transfer.payeeFspId);
		const hub = await this._participantAdapter.getParticipantInfo(HUB_ID);

		if (!hub) {//} || !payerFsp.isActive || !payerFsp.approved){
			const err = new Error("Cannot get hub participant information");
			this._logger.error(err);
			throw err;
		}

		if(!payerFsp || !payeeFsp){//} || !payerFsp.isActive || !payerFsp.approved){
			const err = new NoSuchParticipantError("Payer or payee participant not found");
			this._logger.error(err);
			throw err;
		}
		// TODO reactivate participant.isActive check
		// if (!payerFsp.isActive || !payerFsp.approved || !payeeFsp.isActive || !payeeFsp.approved) {//} || !payerFsp.isActive || !payerFsp.approved){
		if (!payerFsp.approved || !payeeFsp.approved) {//} || !payerFsp.isActive || !payerFsp.approved){
			const err = new RequiredParticipantIsNotActive("Payer or payee participants are not active and approved");
			this._logger.error(err);
			throw err;
		}

		const hubAccount = hub.participantAccounts.find((value: IParticipantAccount) => value.type === "HUB_RECONCILIATION" && value.currencyCode === transfer.currencyCode) ?? null;
		const payerPosAccount = payerFsp.participantAccounts.find((value: IParticipantAccount) => value.type === "POSITION" && value.currencyCode === transfer.currencyCode) ?? null;
		const payerLiqAccount = payerFsp.participantAccounts.find((value: IParticipantAccount) => value.type === "SETTLEMENT" && value.currencyCode === transfer.currencyCode) ?? null;
		const payeePosAccount = payeeFsp.participantAccounts.find((value: IParticipantAccount) => value.type === "POSITION" && value.currencyCode === transfer.currencyCode) ?? null;
		const payeeLiqAccount = payeeFsp.participantAccounts.find((value: IParticipantAccount) => value.type === "POSITION" && value.currencyCode === transfer.currencyCode) ?? null;

		if(!hubAccount || !payerPosAccount || !payerLiqAccount || !payeePosAccount|| !payeeLiqAccount){
			const err = new Error("Could not get hub, payer or payee accounts from participant");
			this._logger.error(err);
			throw err;
		}

		return {
			hubAccount: hubAccount,
			payerPosAccount: payerPosAccount,
			payerLiqAccount: payerLiqAccount,
			payeePosAccount: payeePosAccount,
			payeeLiqAccount: payeeLiqAccount

		};
	}

	//#region Transfers Admin Endpoints

	public async getTransferById(id: string):Promise<ITransfer | null> {
		if(!id){
			throw new Error("Invalid transfer id");
		}

		const transfer = await this._transfersRepo.getTransferById(id);

		return transfer;
	}

	public async getTransfers():Promise<ITransfer[]> {
		const transfers = await this._transfersRepo.getTransfers();
		return transfers;
	}

	//#endregion

}