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
import {randomUUID} from "crypto";
import {
    AccountsBalancesHighLevelRequestTypes,
    IAccountsBalancesHighLevelRequest,
    IAccountsBalancesHighLevelResponse
} from "@mojaloop/accounts-and-balances-bc-public-types-lib";
import {IAuditClient} from "@mojaloop/auditing-bc-public-types-lib";
import {ILogger} from "@mojaloop/logging-bc-public-types-lib";
import {
    CommandMsg,
    DomainEventMsg,
    IDomainMessage,
    IMessageProducer,
    MessageTypes
} from "@mojaloop/platform-shared-lib-messaging-types-lib";
import {
    TransferCommittedFulfiledEvt,
    TransferFulfilCommittedRequestedEvt,
    TransferPreparedEvt,
    TransferPreparedEvtPayload,
    TransferPrepareRequestedEvt
} from "@mojaloop/platform-shared-lib-public-messages-lib";
import {PrepareTransferCmd} from "./commands";
import {IAccountsBalancesAdapter, IParticipantsServiceAdapter, ITransfersRepository} from "./interfaces/infrastructure";
import {
    CheckLiquidityAndReserveFailedError,
    InvalidMessagePayloadError,
    InvalidMessageTypeError,
    NoSuchAccountError,
    NoSuchParticipantError,
    NoSuchTransferError,
    RequiredParticipantIsNotActive,
    UnableToCancelTransferError
} from "./errors";
import {AccountType, ITransfer, ITransferAccounts, ITransferParticipants, TransferState} from "./types";
import {IParticipant, IParticipantAccount} from "@mojaloop/participant-bc-public-types-lib";
import {ICounter, IHistogram, IMetrics} from "@mojaloop/platform-shared-lib-observability-types-lib";
import {CommitTransferFulfilCmd} from "./commands";

const HUB_ID = "hub"; // move to shared lib

export class TransfersAggregate {
    private _logger: ILogger;
    private _auditClient: IAuditClient;
    private _transfersRepo: ITransfersRepository;
    private _messageProducer: IMessageProducer;
    private _participantAdapter: IParticipantsServiceAdapter;
    private _accountAndBalancesAdapter: IAccountsBalancesAdapter;
    private _metrics: IMetrics;
    private _histo: IHistogram;
    private _commandsCounter:ICounter;
    private _aandbHisto: IHistogram;
    private _participantsHisto: IHistogram;
    private _participantsCache: Map<string, { participant: IParticipant, timestamp: number }> = new Map<string, {
        participant: IParticipant;
        timestamp: number
    }>();

    private _transfersCache: Map<string, ITransfer> = new Map<string, ITransfer>();
    private _batchCommands: Map<string, IDomainMessage> = new Map<string, IDomainMessage>();
    private _abBatchRequests: IAccountsBalancesHighLevelRequest[] = [];
    private _abCancelationBatchRequests: IAccountsBalancesHighLevelRequest[] = [];
    private _abBatchResponses: IAccountsBalancesHighLevelResponse[] = [];
    private _outputEvents: DomainEventMsg[] = [];

    constructor(
        logger: ILogger,
        transfersRepo: ITransfersRepository,
        participantsServiceAdapter: IParticipantsServiceAdapter,
        messageProducer: IMessageProducer,
        accountAndBalancesAdapter: IAccountsBalancesAdapter,
        metrics: IMetrics,
    ) {
        this._logger = logger.createChild(this.constructor.name);
        this._transfersRepo = transfersRepo;
        this._participantAdapter = participantsServiceAdapter;
        this._messageProducer = messageProducer;
        this._accountAndBalancesAdapter = accountAndBalancesAdapter;
        this._metrics = metrics;

        this._histo = metrics.getHistogram("TransfersAggregate", "TransfersAggregate calls", ["callName", "success"]);
        this._commandsCounter = metrics.getCounter("TransfersAggregate_CommandsProcessed", "Commands processed by the Transfers Aggregate", ["commandName"]);
        this._aandbHisto = metrics.getHistogram("TransfersAggregate_aandbAdapter", "A&B adapter timings on the Transfers Aggregate", ["callName", "success"]);
        this._participantsHisto = metrics.getHistogram("TransfersAggregate_participantsAdapter", "Participants adapter timings on the Transfers Aggregate", ["callName", "success"]);
    }

    async init(): Promise<void> {
        // TODO
        //await this._messageProducer.connect();
    }

    async processCommandBatch(cmdMessages: CommandMsg[]): Promise<void> {
        // TODO make sure we're not processing another batch already
        this._abBatchRequests = [];
        this._abCancelationBatchRequests = [];
        this._abBatchResponses = [];
        this._outputEvents = [];
        this._batchCommands.clear();

        try {
            // execute starts
            const execStarts_timerEndFn = this._histo.startTimer({ callName: "executeStarts"});
            for (const cmd of cmdMessages) {
                if(cmd.msgType !== MessageTypes.COMMAND) continue;
                await this._processCommand(cmd);
                this._commandsCounter.inc({commandName: cmd.msgName}, 1);
            }
            execStarts_timerEndFn({success:"true"});

            if(this._abBatchRequests.length<=0){
                return Promise.resolve();
            }

            // send to A&B
            const execAB_timerEndFn = this._histo.startTimer({ callName: "executeAandbProcessHighLevelBatch"});
            if(this._logger.isDebugEnabled()) this._logger.debug(`processCommandBatch() - before accountsAndBalancesAdapter.processHighLevelBatch()`);
            this._abBatchResponses = await this._accountAndBalancesAdapter.processHighLevelBatch(this._abBatchRequests);
            if(this._logger.isDebugEnabled()) this._logger.debug(`processCommandBatch() - after accountsAndBalancesAdapter.processHighLevelBatch()`);
            execAB_timerEndFn({success:"true"});

            // peek first and check count to establish no errors - or any other way to determine error

            // execute continues
            const executeContinues_timerEndFn = this._histo.startTimer({ callName: "executeContinues"});
            for (const abResponse of this._abBatchResponses) {
                await this._processAccountsAndBalancesResponse(abResponse);
            }
            executeContinues_timerEndFn({success:"true"});

            // if the continues queued cancellations, send then now
            if(this._abCancelationBatchRequests.length){
                ///send cancellations to A&B
            }

        } catch (error: any) {
            this._logger.error(error);
            throw error;
        } finally {
            // flush in mem repositories
            await this._flush();

            // send resulting/output events
            await this._messageProducer.send(this._outputEvents);
            return Promise.resolve();
        }
    }

    private async _processCommand(cmd: CommandMsg): Promise<void> {
        // validate message
        this._ensureValidMessage(cmd);
        // cache command for later retrieval in continue methods
        this._batchCommands.set(cmd.payload.transferId, cmd);

        if (cmd.msgName === PrepareTransferCmd.name) {
            // TODO remove the cast when the mix between events and cmds is fixed
            return this._prepareTransferStart(cmd as any);
        } else if (cmd.msgName === CommitTransferFulfilCmd.name) {
            // TODO remove the cast when the mix between events and cmds is fixed
            return this._fulfilTransferStart(cmd as any);
        } else {
            // TODO throw unhandled cmd
        }
    }

    private async _processAccountsAndBalancesResponse(abResponse: IAccountsBalancesHighLevelResponse): Promise<void> {
        const request = this._abBatchRequests.find(value => value.requestId === abResponse.requestId);
        if (!request) {
            const err = new CheckLiquidityAndReserveFailedError("Could not find corresponding request for checkLiquidAndReserve IAccountsBalancesHighLevelResponse");
            this._logger.error(err);
            throw err;
        }

        const originalCmdMsg = this._batchCommands.get(request.transferId);
        if(!originalCmdMsg){
            const error = new Error("Original command not found in _processAccountsAndBalancesResponse()");
            this._logger.error(error);
            throw error;
        }

        // get transfer - null transfer is handled in the continue methods
        const transfer: ITransfer | null = await this._getTransfer(request.transferId);

        if (abResponse.requestType === AccountsBalancesHighLevelRequestTypes.checkLiquidAndReserve) {
            return this._prepareTransferContinue(abResponse, request, originalCmdMsg, transfer);
        } else if (abResponse.requestType === AccountsBalancesHighLevelRequestTypes.cancelReservationAndCommit) {
            return this._fulfilTTransferContinue(abResponse, request, originalCmdMsg, transfer);
        } else if (abResponse.requestType === AccountsBalancesHighLevelRequestTypes.cancelReservation) {
            throw new Error("not implemented");
        } else {
            // throw unhandled cmd
        }
    }

    private _ensureValidMessage(message: CommandMsg): void {
        if (!message.payload) {
            this._logger.error(`TransferCommandHandler: message payload has invalid format or value`);
            throw new InvalidMessagePayloadError();
        }

        if (!message.msgName) {
            this._logger.error(`TransferCommandHandler: message name is invalid`);
            throw new InvalidMessageTypeError();
        }

        if (message.msgType !== MessageTypes.COMMAND) {
            this._logger.error(`TransferCommandHandler: message type is invalid : ${message.msgType}`);
            throw new InvalidMessageTypeError();
        }
    }

    private async  _getTransfer(id:string):Promise<ITransfer | null>{
        let transfer: ITransfer | null = this._transfersCache.get(id) || null;

        if(transfer){
            return transfer;
        }

        transfer = await this._transfersRepo.getTransferById(id);
        if(transfer){
            this._transfersCache.set(id, transfer);
            return transfer;
        }

        return null;
    }

    private async _flush():Promise<void>{
        const timerEndFn = this._histo.startTimer({callName: "flush"});

        if(this._transfersCache.size){
            const entries = Array.from(this._transfersCache.values());
            await this._transfersRepo.storeTransfers(entries);
            this._transfersCache.clear();
        }

        timerEndFn({success: "true"});
    }

    private async _prepareTransferStart(message: TransferPrepareRequestedEvt): Promise<void> {
        if(this._logger.isDebugEnabled()) this._logger.debug(`prepareTransferStart() - Got transferPreparedReceivedEvt msg for transferId: ${message.payload.transferId}`);


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

        if(this._logger.isDebugEnabled()) this._logger.debug("prepareTransferStart() - before getParticipants...");
        const participants = await this.getParticipantsInfo(transfer.payerFspId, transfer.payeeFspId, transfer.transferId);
        const participantAccounts = this.getTransferParticipantsAccounts(participants, transfer);
        if(this._logger.isDebugEnabled()) this._logger.debug("prepareTransferStart() - after getParticipants");

        // TODO validate participants and accounts
        // TODO put net debit cap in the participant struct
        const payerNdc = "0";

        // set transfer in cache
        this._transfersCache.set(transfer.transferId, transfer);

        this._abBatchRequests.push({
            requestType: AccountsBalancesHighLevelRequestTypes.checkLiquidAndReserve,
            requestId: randomUUID(),
            payerPositionAccountId: participantAccounts.payerPosAccount.id,
            payerLiquidityAccountId: participantAccounts.payerLiqAccount.id,
            hubJokeAccountId: participantAccounts.hubAccount.id,
            transferId: transfer.transferId,
            transferAmount: transfer.amount,
            currencyCode: transfer.currencyCode,
            payerNetDebitCap: payerNdc,
            payeePositionAccountId: null,
        });

        if(this._logger.isDebugEnabled()) this._logger.debug("prepareTransferStart() - complete");
    }

    private async _prepareTransferContinue(
        abResponse: IAccountsBalancesHighLevelResponse,
        request: IAccountsBalancesHighLevelRequest,
        originalCmdMsg:IDomainMessage,
        transfer: ITransfer | null
    ): Promise<void> {
        if (!transfer) {
            const err = new CheckLiquidityAndReserveFailedError(`Could not find corresponding transfer with id: ${request.transferId} for checkLiquidAndReserve IAccountsBalancesHighLevelResponse`);
            this._logger.error(err);
            throw err;
        }
        if(this._logger.isDebugEnabled()) this._logger.debug(`prepareTransferContinue() - Called for transferId: ${transfer.transferId}`);

        if (!abResponse.success) {
            const err = new CheckLiquidityAndReserveFailedError(`Unable to check liquidity and reserve for transferId: ${request.transferId} - error: ${abResponse.errorMessage}`);
            this._logger.error(err);
            transfer.transferState = TransferState.REJECTED;
            this._transfersCache.set(transfer.transferId, transfer);
            throw err;
        }

        // TODO validate type
        const message = originalCmdMsg;// as PrepareTransferCmd;

        // update transfer and cache it
        transfer.transferState = TransferState.RESERVED;
        this._transfersCache.set(transfer.transferId, transfer);

        const payload: TransferPreparedEvtPayload = {
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

        if(this._logger.isDebugEnabled()) this._logger.debug(`prepareTransferContinue() - completed for transferId: ${transfer.transferId}`);

        this._outputEvents.push(event);
    }

    private async _fulfilTransferStart(message: TransferFulfilCommittedRequestedEvt): Promise<any> {
        if(this._logger.isDebugEnabled()) this._logger.debug(`fulfilTransfer() - Got transferFulfilCommittedEvt msg for transferId: ${message.payload.transferId}`);

        let participantTransferAccounts: ITransferAccounts | null = null;

        const transfer: ITransfer | null = await this._getTransfer(message.payload.transferId);
        if(!transfer){
            const error = new NoSuchTransferError(`transfer with id: ${message.payload.transferId} not found in _fulfilTransferStart()`);
            this._logger.error(error);
            await this.cancelTransfer(transfer, participantTransferAccounts);
            throw error;
        }

        try {
            const participants = await this.getParticipantsInfo(transfer.payerFspId, transfer.payeeFspId, transfer.transferId);
            participantTransferAccounts = this.getTransferParticipantsAccounts(participants, transfer);
        } catch (error: any) {
            this._logger.error(error.message);
            await this.cancelTransfer(transfer, participantTransferAccounts);
            throw error;
        }

        // // set transfer in cache
        // this._transfersCache.set(transfer.transferId, transfer);

        this._abBatchRequests.push({
            requestType: AccountsBalancesHighLevelRequestTypes.cancelReservationAndCommit,
            requestId: randomUUID(),
            payerPositionAccountId: participantTransferAccounts.payerPosAccount.id,
            payeePositionAccountId: participantTransferAccounts.payeePosAccount.id,
            hubJokeAccountId: participantTransferAccounts.hubAccount.id,
            transferId: transfer.transferId,
            transferAmount: transfer.amount,
            currencyCode: transfer.currencyCode,
            payerNetDebitCap: null,
            payerLiquidityAccountId: null
        });

        if(this._logger.isDebugEnabled()) this._logger.debug(`fulfilTransfer() - completed for transferId: ${message.payload.transferId}`);
    }

    private async _fulfilTTransferContinue(
        abResponse: IAccountsBalancesHighLevelResponse,
        request: IAccountsBalancesHighLevelRequest,
        originalCmdMsg:IDomainMessage,
        transfer: ITransfer | null
    ): Promise<void> {
        if (!transfer) {
            const err = new CheckLiquidityAndReserveFailedError(`Could not find corresponding transfer with id: ${request.transferId} for _fulfilTTransferContinue IAccountsBalancesHighLevelResponse`);
            this._logger.error(err);
            throw err;
        }

        if(this._logger.isDebugEnabled()) this._logger.debug(`fulfilTTransferContinue() - started for transferId: ${transfer.transferId}`);

        if (!abResponse.success) {
            const err = new CheckLiquidityAndReserveFailedError(`Unable to cancelReservationAndCommit for transferId: ${request.transferId} - error: ${abResponse.errorMessage}`);
            this._logger.error(err);
            transfer.transferState = TransferState.REJECTED;
            this._transfersCache.set(transfer.transferId, transfer);
            throw err;
        }

        // TODO if failed, queue a cancelReservation request to this._abCancelationBatchRequests and add the error event to the events queue
        // this._abCancelationBatchRequests.push({
        //     requestType: AccountsBalancesHighLevelRequestTypes.cancelReservation,
        //     ...

        // TODO validate type
        const message = originalCmdMsg;// as PrepareTransferCmd;


        transfer.updatedAt = Date.now();
        transfer.transferState = TransferState.COMMITTED;
        transfer.fulFillment = message.payload.fulfilment;
        transfer.completedTimestamp = message.payload.completedTimestamp;
        transfer.extensionList = message.payload.extensionList;

        this._transfersCache.set(transfer.transferId, transfer);

        const event: TransferCommittedFulfiledEvt = new TransferCommittedFulfiledEvt({
            transferId: message.payload.transferId,
            transferState: message.payload.transferState,
            fulfilment: message.payload.fulfilment,
            completedTimestamp: message.payload.completedTimestamp,
            extensionList: message.payload.extensionList,
            payerFspId: transfer.payerFspId,
            payeeFspId: transfer.payeeFspId,
            amount: transfer.amount,
            currencyCode: transfer.currencyCode,
            settlementModel: transfer.settlementModel,
        });

        // carry over opaque state fields
        event.fspiopOpaqueState = message.fspiopOpaqueState;

        this._logger.debug("transferPreparedReceivedEvt completed for transferId: " + transfer.transferId);

        this._outputEvents.push(event);
        if(this._logger.isDebugEnabled()) this._logger.debug(`fulfilTTransferContinue() - completed for transferId: ${transfer.transferId}`);
    }

    private async getParticipantsInfo(payerFspId: string, payeeFspId: string, transferId: string): Promise<ITransferParticipants> {
        // TODO get all participants in a single call with participantsClient.getParticipantsByIds()

        let hub: IParticipant;
        let payer: IParticipant;
        let payee: IParticipant;

        let hubCache: {
            participant: IParticipant,
            timestamp: number
        } | undefined = this._participantsCache.get(HUB_ID);
        if (!hubCache) {
            const foundHub = await this._participantAdapter.getParticipantInfo(HUB_ID);
            if (!foundHub) {
                const errorMessage = "Hub not found " + HUB_ID + " for transfer " + transferId;
                this._logger.error(errorMessage);
                throw new NoSuchParticipantError(errorMessage);
            }
            this._participantsCache.set(HUB_ID, {participant: foundHub, timestamp: Date.now()});
            hub = foundHub;
        } else {
            hub = hubCache.participant;
        }

        let payerCache: {
            participant: IParticipant,
            timestamp: number
        } | undefined = this._participantsCache.get(payerFspId);
        if (!payerCache) {
            const foundPayer = await this._participantAdapter.getParticipantInfo(payerFspId);
            if (!foundPayer) {
                const errorMessage = "Payer participant not found " + payerFspId + " for transfer " + transferId;
                this._logger.error(errorMessage);
                throw new NoSuchParticipantError(errorMessage);
            }
            this._participantsCache.set(payerFspId, {participant: foundPayer, timestamp: Date.now()});
            payer = foundPayer;
        } else {
            payer = payerCache.participant;
        }

        let payeeCache: {
            participant: IParticipant,
            timestamp: number
        } | undefined = this._participantsCache.get(payeeFspId);
        if (!payeeCache) {
            const foundPayee = await this._participantAdapter.getParticipantInfo(payeeFspId);
            if (!foundPayee) {
                const errorMessage = "Payee participant not found " + payeeFspId + " for transfer " + transferId;
                this._logger.error(errorMessage);
                throw new NoSuchParticipantError(errorMessage);
            }
            this._participantsCache.set(payeeFspId, {participant: foundPayee, timestamp: Date.now()});
            payee = foundPayee
        } else {
            payee = payeeCache.participant;
        }

        return {
            hub: hub,
            payer: payer,
            payee: payee
        };
    }


    private getTransferParticipantsAccounts(transferParticipants: ITransferParticipants, transfer: ITransfer): ITransferAccounts {

        const {hub, payer: transferPayerParticipant, payee: transferPayeeParticipant} = transferParticipants;

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

    private async validateParticipant(participantId: string | null): Promise<void> {
        if (participantId) {
            const participant = await this._participantAdapter.getParticipantInfo(participantId);

            if (!participant) {
                this._logger.debug(`No participant found`);
                throw new NoSuchParticipantError();
            }

            if (!participant.isActive) {
                this._logger.debug(`${participant.id} is not active`);
                throw new RequiredParticipantIsNotActive();
            }
        }

        return;
    }

    private async cancelTransfer(transferRecord: ITransfer | null, participantAccounts: ITransferAccounts | null) {
        // TODO this must also handle the cases where the transfer is not found and cleanup the accounts

        if (transferRecord && participantAccounts) {
            transferRecord.transferState = TransferState.REJECTED;

            try {
                await this._transfersRepo.updateTransfer(transferRecord);

                // TODO accounts and balances needs a sync cancelReservation() for these cases
                // await this._accountAndBalancesAdapter.cancelReservation(
                //     participantAccounts.payerPosAccount.id, participantAccounts.hubAccount.id,
                //     transferRecord.amount, transferRecord.currencyCode, transferRecord.transferId);
            } catch (err) {
                const errorMessage = `Error cancelling transfer ${transferRecord.transferId} ${err}`;
                this._logger.error(errorMessage);
                throw new UnableToCancelTransferError(errorMessage);
            }
        }

    }

}
