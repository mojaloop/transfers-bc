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

import {createHash, randomUUID} from "crypto";
import {
    AccountsBalancesHighLevelRequestTypes,
    IAccountsBalancesHighLevelRequest,
    IAccountsBalancesHighLevelResponse
} from "@mojaloop/accounts-and-balances-bc-public-types-lib";
import {IAuditClient} from "@mojaloop/auditing-bc-public-types-lib";
import {ILogger} from "@mojaloop/logging-bc-public-types-lib";
import {
    CommandMsg,
    DomainErrorEventMsg,
    DomainEventMsg,
    IDomainMessage,
    IMessageProducer,
    MessageTypes
} from "@mojaloop/platform-shared-lib-messaging-types-lib";
import {
    PrepareTransferCmd, 
    CommitTransferFulfilCmd, 
    QueryTransferCmd, 
    RejectTransferCmd, 
    TimeoutTransferCmd, 
    PrepareBulkTransferCmd, 
    CommitBulkTransferFulfilCmd,
    RejectBulkTransferCmd,
    QueryBulkTransferCmd
} from "./commands";
import {
    IAccountsBalancesAdapter,
    IParticipantsServiceAdapter,
    ITransfersRepository,
    ISettlementsServiceAdapter,
    ISchedulingServiceAdapter,
    IBulkTransfersRepository
} from "./interfaces/infrastructure";
import {
    CheckLiquidityAndReserveFailedError,
    HubAccountNotFoundError,
    HubNotFoundError,
    HubParticipantIdMismatchError,
    HubParticipantNotActiveError,
    HubParticipantNotApprovedError,
    InvalidMessagePayloadError,
    InvalidMessageTypeError,
    PayeeLiquidityAccountNotFoundError,
    PayeeParticipantIdMismatchError,
    PayeeParticipantNotActiveError,
    PayeeParticipantNotApprovedError,
    PayeeParticipantNotFoundError,
    PayeePositionAccountNotFoundError,
    PayerLiquidityAccountNotFoundError,
    PayerParticipantIdMismatchError,
    PayerParticipantNotActiveError,
    PayerParticipantNotApprovedError,
    PayerParticipantNotFoundError,
    PayerPositionAccountNotFoundError,
    TransferNotFoundError,
    UnableToCancelTransferError} from "./errors";
import {AccountType, BulkTransferState, IBulkTransfer, IErrorInformation, ITransfer, ITransferAccounts, ITransferParticipants, TransferState} from "./types";
import {IParticipant, IParticipantAccount} from "@mojaloop/participant-bc-public-types-lib";
import {ICounter, IHistogram, IMetrics} from "@mojaloop/platform-shared-lib-observability-types-lib";
import {
	TransferFulfiledEvt,
    TransferPreparedEvt,
	TransferPreparedEvtPayload,
	TransferRejectRequestProcessedEvt,
	TransferRejectRequestProcessedEvtPayload,
	TransferQueryResponseEvt,
	TransferQueryResponseEvtPayload,
	TransferUnableToUpdateEvt,
	TransferPrepareLiquidityCheckFailedEvt,
	TransferUnableToGetTransferByIdEvt,
	TransferNotFoundEvt,
	TransferPayerNotFoundFailedEvt,
    TransferPayerIdMismatchEvt,
    TransferPayerNotApprovedEvt,
    TransferPayerNotActiveEvt,
	TransferPayeeNotFoundFailedEvt,
    TransferPayeeIdMismatchEvt,
    TransferPayeeNotApprovedEvt,
    TransferPayeeNotActiveEvt,
	TransferHubNotFoundFailedEvt,
    TransferHubIdMismatchEvt,
    TransferHubNotApprovedEvt,
    TransferHubNotActiveEvt,
	TransferHubAccountNotFoundFailedEvt,
	TransferPayerPositionAccountNotFoundFailedEvt,
	TransferPayerLiquidityAccountNotFoundFailedEvt,
	TransferPayeePositionAccountNotFoundFailedEvt,
	TransferPayeeLiquidityAccountNotFoundFailedEvt,
	TransferCancelReservationFailedEvt,
	TransferCancelReservationAndCommitFailedEvt,
	TransferUnableToGetSettlementModelEvt,
    TransferInvalidMessageTypeEvt,
    TransferPrepareRequestTimedoutEvt,
    TransferPrepareRequestTimedoutEvtPayload,
    TransferFulfilCommittedRequestedTimedoutEvt,
    TransferFulfilCommittedRequestedTimedoutEvtPayload,
    TransferUnableCreateReminderEvt,
    BulkTransferPreparedEvt,
    BulkTransferPreparedEvtPayload,
    BulkTransferFulfiledEvt,
    BulkTransferNotFoundEvt,
    BulkTransferRejectRequestProcessedEvt,
    BulkTransferRejectRequestProcessedEvtPayload,
    TransferBCUnableToAddBulkTransferToDatabaseEvt,
    TransferUnableToGetBulkTransferByIdEvt,
    BulkTransferQueryResponseEvt,
    BulkTransferQueryResponseEvtPayload
} from "@mojaloop/platform-shared-lib-public-messages-lib";

const HUB_ID = "hub"; // move to shared lib

export class TransfersAggregate {
    private _logger: ILogger;
    private _auditClient: IAuditClient;
    private _transfersRepo: ITransfersRepository;
    private _bulkTransfersRepo: IBulkTransfersRepository;
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
    private _settlementsAdapter: ISettlementsServiceAdapter;
    private _schedulingAdapter: ISchedulingServiceAdapter;

    private _transfersCache: Map<string, ITransfer> = new Map<string, ITransfer>();
    private _bulkTransfersCache: Map<string, IBulkTransfer> = new Map<string, IBulkTransfer>();
    private _batchCommands: Map<string, IDomainMessage> = new Map<string, IDomainMessage>();
    private _abBatchRequests: IAccountsBalancesHighLevelRequest[] = [];
    private _abCancelationBatchRequests: IAccountsBalancesHighLevelRequest[] = [];
    private _abBatchResponses: IAccountsBalancesHighLevelResponse[] = [];
    private _outputEvents: DomainEventMsg[] = [];

    constructor(
        logger: ILogger,
        transfersRepo: ITransfersRepository,
        bulkTransfersRepo: IBulkTransfersRepository,
        participantsServiceAdapter: IParticipantsServiceAdapter,
        messageProducer: IMessageProducer,
        accountAndBalancesAdapter: IAccountsBalancesAdapter,
        metrics: IMetrics,
        settlementsAdapter: ISettlementsServiceAdapter,
        schedulingAdapter: ISchedulingServiceAdapter
    ) {
        this._logger = logger.createChild(this.constructor.name);
        this._transfersRepo = transfersRepo;
        this._bulkTransfersRepo = bulkTransfersRepo;
        this._participantAdapter = participantsServiceAdapter;
        this._messageProducer = messageProducer;
        this._accountAndBalancesAdapter = accountAndBalancesAdapter;
        this._metrics = metrics;
        this._settlementsAdapter = settlementsAdapter;
        this._schedulingAdapter = schedulingAdapter;

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
        // eslint-disable-next-line no-async-promise-executor
        return new Promise<void>(async (resolve) => {
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
                    if(cmd.payload.bulkTransferId) {
                        if(cmd.msgName === PrepareBulkTransferCmd.name) {
                            this._commandsCounter.inc({commandName: cmd.msgName}, cmd.payload.individualTransfers.length);
                        } else if(cmd.msgName === CommitBulkTransferFulfilCmd.name) {
                            this._commandsCounter.inc({commandName: cmd.msgName}, cmd.payload.individualTransferResults.length);
                        }
                    } else {
                        this._commandsCounter.inc({commandName: cmd.msgName}, 1);
                    }
        


                }
                execStarts_timerEndFn({success:"true"});

                if(this._abBatchRequests.length<=0){
                    // return Promise.resolve();
                    resolve();
                    return;
                }

                // if(this._abBatchRequests.length !== cmdMessages.length)
                //     // eslint-disable-next-line no-debugger
                //     debugger;

                // send to A&B
                const execAB_timerEndFn = this._histo.startTimer({ callName: "executeAandbProcessHighLevelBatch"});
                if(this._logger.isDebugEnabled()) this._logger.debug("processCommandBatch() - before accountsAndBalancesAdapter.processHighLevelBatch()");
                this._abBatchResponses = await this._accountAndBalancesAdapter.processHighLevelBatch(this._abBatchRequests);
                if(this._logger.isDebugEnabled()) this._logger.debug("processCommandBatch() - after accountsAndBalancesAdapter.processHighLevelBatch()");
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
                    // send cancellations to A&B
                    const execAB_timerEndFn = this._histo.startTimer({ callName: "executeAandbProcessHighLevelCancelationBatch"});
                    if(this._logger.isDebugEnabled()) this._logger.debug("processCommandBatch() - before accountsAndBalancesAdapter.processHighLevelCancelationBatch()");
                    this._abBatchResponses = await this._accountAndBalancesAdapter.processHighLevelBatch(this._abCancelationBatchRequests);
                    if(this._logger.isDebugEnabled()) this._logger.debug("processCommandBatch() - after accountsAndBalancesAdapter.processHighLevelCancelationBatch()");
                    execAB_timerEndFn({success:"true"});
                }

            } catch (err: unknown) {
                const error = (err as Error).message;
                this._logger.error(err, error);
                throw error;
            } finally {
                // flush in mem repositories
                await this._flush();

                // send resulting/output events
                await this._messageProducer.send(this._outputEvents);

                // eslint-disable-next-line no-unsafe-finally
                // return Promise.resolve();
                resolve();
            }
        });
    }

    private async _processCommand(cmd: CommandMsg): Promise<void> {
        // cache command for later retrieval in continue methods - do this first!
        if(cmd.payload.bulkTransferId) {
            let transfers = [];

            if(cmd.msgName === PrepareBulkTransferCmd.name) {
                transfers = cmd.payload.individualTransfers;
            } else if(cmd.msgName === CommitBulkTransferFulfilCmd.name) {
                transfers = cmd.payload.individualTransferResults;
            }
            for(let i=0 ; i<transfers.length ; i+=1) {
                const individualTransfer = transfers[i];
                this._batchCommands.set(transfers[i].transferId, { ...cmd, ...individualTransfer });
            }
        } else {
            this._batchCommands.set(cmd.payload.transferId, cmd);
        }

        // validate message
        this._ensureValidMessage(cmd);

        if (cmd.msgName === PrepareTransferCmd.name) {
            return this._prepareTransferStart(cmd as PrepareTransferCmd);
        } else if (cmd.msgName === CommitTransferFulfilCmd.name) {
            return this._fulfilTransferStart(cmd as CommitTransferFulfilCmd);
        } else if (cmd.msgName === RejectTransferCmd.name) {
            return this._rejectTransfer(cmd as RejectTransferCmd);
        } else if (cmd.msgName === QueryTransferCmd.name) {
            return this._queryTransfer(cmd as QueryTransferCmd);
        } else if (cmd.msgName === TimeoutTransferCmd.name) {
            return this._timeoutTransfer(cmd as TimeoutTransferCmd);
        } else if (cmd.msgName === PrepareBulkTransferCmd.name) {
            return this._prepareBulkTransferStart(cmd as PrepareBulkTransferCmd);
        } else if (cmd.msgName === CommitBulkTransferFulfilCmd.name) {
            return this._fulfilBulkTransferStart(cmd as CommitBulkTransferFulfilCmd);
        } else if (cmd.msgName === RejectBulkTransferCmd.name) {
            return this._rejectBulkTransfer(cmd as RejectBulkTransferCmd);
        } else if (cmd.msgName === QueryBulkTransferCmd.name) {
            return this._queryBulkTransfer(cmd as QueryBulkTransferCmd);
        } else {
            const requesterFspId = cmd.fspiopOpaqueState?.requesterFspId;
            const transferId = cmd.payload?.transferId;
			const errorMessage = `Command type is unknown: ${cmd.msgName}`;
            this._logger.error(errorMessage);
            const errorEvent = new TransferInvalidMessageTypeEvt({
                transferId: transferId,
                payerFspId: requesterFspId,
                errorDescription: errorMessage
            });
            errorEvent.fspiopOpaqueState = cmd.fspiopOpaqueState;
            this._outputEvents.push(errorEvent);
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
        let transfer: ITransfer | null = null;
        try {
			transfer = await this._getTransfer(request.transferId);
		} catch(err: unknown) {
            const error = (err as Error).message;
			const errorMessage = `Unable to get transfer record for transferId: ${request.transferId} from repository - error: ${abResponse.errorMessage}`;
			this._logger.error(err, `${errorMessage}: ${error}`);
			const errorEvent = new TransferUnableToGetTransferByIdEvt({
				transferId: request.transferId,
				errorDescription: errorMessage
			});
            errorEvent.fspiopOpaqueState = originalCmdMsg.fspiopOpaqueState;

            this._outputEvents.push(errorEvent);
		}

        if (abResponse.requestType === AccountsBalancesHighLevelRequestTypes.checkLiquidAndReserve) {
            if(originalCmdMsg.payload.bulkTransferId) {
                return this._prepareBulkTransferContinue(abResponse, request, originalCmdMsg, transfer as ITransfer);
            } else {
                return this._prepareTransferContinue(abResponse, request, originalCmdMsg, transfer as ITransfer);
            }
        } else if (abResponse.requestType === AccountsBalancesHighLevelRequestTypes.cancelReservationAndCommit) {
            if(originalCmdMsg.payload.bulkTransferId) {
                return this._fulfilBulkTransferContinue(abResponse, request, originalCmdMsg, transfer as ITransfer);
            } else {
                return this._fulfilTTransferContinue(abResponse, request, originalCmdMsg, transfer);
            }
        } else if (abResponse.requestType === AccountsBalancesHighLevelRequestTypes.cancelReservation) {
            throw new Error("not implemented");
        } else {
            // throw unhandled cmd
        }
    }

    private _ensureValidMessage(message: CommandMsg): void {
        if (!message.payload) {
            this._logger.error("TransferCommandHandler: message payload has invalid format or value");
            throw new InvalidMessagePayloadError();
        }

        if (!message.msgName) {
            this._logger.error("TransferCommandHandler: message name is invalid");
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

    private async  _getBulkTransfer(id:string):Promise<IBulkTransfer | null>{
        let bulkTransfer: IBulkTransfer | null = this._bulkTransfersCache.get(id) || null;
        if(bulkTransfer){
            return bulkTransfer;
        }

        bulkTransfer = await this._bulkTransfersRepo.getBulkTransferById(id);
        if(bulkTransfer){
            this._bulkTransfersCache.set(id, bulkTransfer);
            return bulkTransfer;
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

    private async _timeoutTransfer(message: TimeoutTransferCmd): Promise<void> {
        if(this._logger.isDebugEnabled()) this._logger.debug(`transferTimeoutStart() - Got transferPreparedReceivedEvt msg for transferId: ${message.payload.transferId}`);

		let transfer:ITransfer | null;
		try {
			transfer = await this._getTransfer(message.payload.transferId);
		} catch(err: unknown) {
			const error = (err as Error).message;
			const errorMessage = `Unable to get transfer record for transferId: ${message.payload.transferId} from repository`;
			this._logger.error(err, `${errorMessage}: ${error}`);
			const errorEvent = new TransferUnableToGetTransferByIdEvt({
				transferId: message.payload.transferId,
				errorDescription: errorMessage
			});
            errorEvent.fspiopOpaqueState = message.fspiopOpaqueState;
            this._outputEvents.push(errorEvent);
            return;
		}

		// TODO Use hash repository to fetch the hashes
        if(transfer) {
			// if(transfer.hash !== hash) {
			// 	const errorMessage = `Transfer hash for ${message.payload.transferId} doesn't match`;
			// 	this._logger.error(errorMessage);
			// 	const errorEvent = new TransferDuplicateCheckFailedEvt({
			// 		transferId: message.payload.transferId,
			// 		payerFspId: message.payload.payerFsp,
			// 		errorDescription: errorMessage
			// 	});
            //     errorEvent.fspiopOpaqueState = message.fspiopOpaqueState;
            //     this._outputEvents.push(errorEvent);
            //     return;
			// }

			switch(transfer.transferState) {
				case TransferState.RECEIVED: {
                    const now = new Date().getTime();
                    const expirationTime = new Date(transfer.expirationTimestamp).getTime();

                    if(now > expirationTime) {
                        try {
                            transfer.transferState = TransferState.ABORTED;
                            // set transfer in cache
                            this._transfersCache.set(transfer.transferId, transfer);
                            await this._transfersRepo.updateTransfer(transfer);
                        } catch(err: unknown) {
                            const error = (err as Error).message;
                            const errorMessage = `Error deleting reminder for transferId: ${transfer.transferId}.`;
                            this._logger.error(err, `${errorMessage}: ${error}`);
                            const errorEvent = new TransferUnableToUpdateEvt({
                                transferId: transfer.transferId,
                                payerFspId: transfer.payerFspId,
                                errorDescription: errorMessage
                            });

                            errorEvent.fspiopOpaqueState = message.fspiopOpaqueState;
                            this._outputEvents.push(errorEvent);
                            return;
                        }

                        // Send a response event to the payer
                        const payload: TransferPrepareRequestTimedoutEvtPayload = {
                            transferId: transfer.transferId,
                            payerFspId: transfer.payerFspId,
                            errorDescription: `Timedout received transfer request for transferId: ${transfer.transferId}`
                        };

                        const event = new TransferPrepareRequestTimedoutEvt(payload);

                        event.fspiopOpaqueState = message.fspiopOpaqueState;
                        this._outputEvents.push(event);
                    }

					// Ignore the request
					return;
				}
				case TransferState.RESERVED: {
                    const now = new Date().getTime();
                    const expirationTime = new Date(transfer.expirationTimestamp).getTime();

                    if(now > expirationTime) {
                        try {
                            await this._cancelTransfer(message.payload.transferId);
                        } catch(err: unknown) {
                            const error = (err as Error).message;
                            const errorMessage = `Unable to cancel reservation with transferId: ${message.payload.transferId}`;
                            this._logger.error(err, `${errorMessage}: ${error}`);
                            const errorEvent = new TransferCancelReservationFailedEvt({
                                transferId: message.payload.transferId,
                                errorDescription: errorMessage
                            });

                            errorEvent.fspiopOpaqueState = message.fspiopOpaqueState;
                            this._outputEvents.push(errorEvent);
                            return;
                        }

                        try {
                            transfer.transferState = TransferState.ABORTED;
                            // set transfer in cache
                            this._transfersCache.set(transfer.transferId, transfer);
                            await this._transfersRepo.updateTransfer(transfer);
                        } catch(err: unknown) {
                            const error = (err as Error).message;
                            const errorMessage = `Error deleting reminder for transferId: ${transfer.transferId}.`;
                            this._logger.error(err, `${errorMessage}: ${error}`);
                            const errorEvent = new TransferUnableToUpdateEvt({
                                transferId: transfer.transferId,
                                payerFspId: transfer.payerFspId,
                                errorDescription: errorMessage
                            });

                            errorEvent.fspiopOpaqueState = message.fspiopOpaqueState;
                            this._outputEvents.push(errorEvent);
                            return;
                        }

                        // Send a response event to the payer and payee
                        const payload: TransferFulfilCommittedRequestedTimedoutEvtPayload = {
                            transferId: transfer.transferId,
                            payerFspId: transfer.payerFspId,
                            payeeFspId: transfer.payeeFspId,
                            errorDescription: `Timedout reserved transfer request for transferId: ${transfer.transferId}`
                        };

                        const event = new TransferFulfilCommittedRequestedTimedoutEvt(payload);

                        event.fspiopOpaqueState = message.fspiopOpaqueState;
                        this._outputEvents.push(event);
                    }

					return;
				}
				case TransferState.COMMITTED:
				case TransferState.ABORTED: {
                    // Ignore
					return;
				}
			}
		}
    }

    private async _prepareTransferStart(message: PrepareTransferCmd): Promise<void> {
        if(this._logger.isDebugEnabled()) this._logger.debug(`prepareTransferStart() - Got transferPreparedReceivedEvt msg for transferId: ${message.payload.transferId}`);

		const hash = this._generateSha256({
			transferId: message.payload.transferId,
			payeeFspId: message.payload.payeeFsp,
			payerFspId: message.payload.payerFsp,
			amount: message.payload.amount,
			expirationTimestamp: message.payload.expiration
		});

        // Duplicate Transfer POST use cases
        let getTransferRep:ITransfer | null;
		try {
            // TODO: fix since at the moment we only search in cache, otherwise we hit the dabatase in every request
			getTransferRep = await this._getTransfer(message.payload.transferId);
		} catch(err: unknown) {
			const error = (err as Error).message;
			const errorMessage = `Unable to get transfer record for transferId: ${message.payload.transferId} from repository`;
			this._logger.error(err, `${errorMessage}: ${error}`);
			const errorEvent = new TransferUnableToGetTransferByIdEvt({
				transferId: message.payload.transferId,
				errorDescription: errorMessage
			});
            errorEvent.fspiopOpaqueState = message.fspiopOpaqueState;
            this._outputEvents.push(errorEvent);
            return;
		}

		// TODO Use hash repository to fetch the hashes
		if(getTransferRep) {
			// if(getTransferRep.hash !== hash) {
			// 	const errorMessage = `Transfer hash for ${message.payload.transferId} doesn't match`;
			// 	this._logger.error(errorMessage);
			// 	const errorEvent = new TransferDuplicateCheckFailedEvt({
			// 		transferId: message.payload.transferId,
			// 		payerFspId: message.payload.payerFsp,
			// 		errorDescription: errorMessage
			// 	});
            //     errorEvent.fspiopOpaqueState = message.fspiopOpaqueState;
            //     this._outputEvents.push(errorEvent);
            //     return;
			// }
			this._logger.warn(`Transfer ${getTransferRep.transferId} already exists.`);

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
						completedTimestamp: getTransferRep.completedTimestamp,
						fulfilment: getTransferRep.fulfilment,
						extensionList: getTransferRep.extensionList
					};

					const event = new TransferQueryResponseEvt(payload);

					event.fspiopOpaqueState = message.fspiopOpaqueState;
                    this._outputEvents.push(event);
					return;
				}
			}
		}


		let settlementModel: string;
		try {
			settlementModel = await this._settlementsAdapter.getSettlementModelId(
                message.payload.amount,
                message.payload.currencyCode,
                message.payload.currencyCode,
                message.payload.extensionList?.extension ? message.payload.extensionList.extension : []
            );
            if(!settlementModel) throw new Error("Invalid settlementModelId from settlementsAdapter.getSettlementModelId()");
		} catch(err: unknown) {
			const error = (err as Error).message;
			const errorMessage = `Unable to get settlementModel for transferId: ${message.payload.transferId}`;
			this._logger.error(err, `${errorMessage}: ${error}`);
			const errorEvent = new TransferUnableToGetSettlementModelEvt({
				transferId: message.payload.transferId,
				amount: message.payload.amount,
				payerCurrency: message.payload.currencyCode,
				payeeCurrency: message.payload.currencyCode,
				extensionList: message.payload.extensionList ? (message.payload.extensionList).toString() : null,
				errorDescription: errorMessage
			});
            errorEvent.fspiopOpaqueState = message.fspiopOpaqueState;
            this._outputEvents.push(errorEvent);
            return;
		}

        const now = Date.now();

        const transfer: ITransfer = {
            createdAt: now,
            updatedAt: now,
            transferId: message.payload.transferId,
            bulkTransferId: message.payload.bulkTransferId,
            payeeFspId: message.payload.payeeFsp,
            payerFspId: message.payload.payerFsp,
            amount: message.payload.amount,
            currencyCode: message.payload.currencyCode,
            ilpPacket: message.payload.ilpPacket,
            condition: message.payload.condition,
            expirationTimestamp: message.payload.expiration,
            transferState: TransferState.RECEIVED,
            hash: hash,
            fulfilment: null,
            completedTimestamp: null,
            extensionList: message.payload.extensionList,
            settlementModel: settlementModel,
            errorInformation: null,
            payerIdType: message.payload.payerIdType, 
            payeeIdType: message.payload.payeeIdType,
            transferType: message.payload.transferType
        };

        if(this._logger.isDebugEnabled()) this._logger.debug("prepareTransferStart() - before getParticipants...");

        let participants:ITransferParticipants;
        try{
            participants = await this._getParticipantsInfo(transfer.payerFspId, transfer.payeeFspId, transfer.transferId);
        } catch (err: unknown) {
            let errorEvent:DomainErrorEventMsg;

            if(err instanceof HubNotFoundError) {
                errorEvent = new TransferHubNotFoundFailedEvt({
                    transferId: transfer.transferId,
                    errorDescription: (err as Error).message
                });
            } else if (err instanceof HubParticipantIdMismatchError) {
                errorEvent = new TransferHubIdMismatchEvt({
                    transferId: transfer.transferId,
                    hubId: HUB_ID,
                    errorDescription: (err as Error).message
                });
            } else if (err instanceof HubParticipantNotApprovedError) {
                errorEvent = new TransferHubNotApprovedEvt({
                    transferId: transfer.transferId,
                    hubId: HUB_ID,
                    errorDescription: (err as Error).message
                });
            } else if (err instanceof HubParticipantNotActiveError) {
                errorEvent = new TransferHubNotActiveEvt({
                    transferId: transfer.transferId,
                    hubId: HUB_ID,
                    errorDescription: (err as Error).message
                });
            } else if (err instanceof PayerParticipantNotFoundError) {
                errorEvent = new TransferPayerNotFoundFailedEvt({
                    transferId: transfer.transferId,
                    payerFspId: transfer.payerFspId,
                    errorDescription: (err as Error).message
                });
            } else if (err instanceof PayerParticipantIdMismatchError) {
                errorEvent = new TransferPayerIdMismatchEvt({
                    transferId: transfer.transferId,
                    payerFspId: transfer.payerFspId,
                    errorDescription: (err as Error).message
                });
            } else if (err instanceof PayerParticipantNotApprovedError) {
                errorEvent = new TransferPayerNotApprovedEvt({
                    transferId: transfer.transferId,
                    payerFspId: transfer.payerFspId,
                    errorDescription: (err as Error).message
                });
            } else if (err instanceof PayerParticipantNotActiveError) {
                errorEvent = new TransferPayerNotActiveEvt({
                    transferId: transfer.transferId,
                    payerFspId: transfer.payerFspId,
                    errorDescription: (err as Error).message
                });
            } else if (err instanceof PayeeParticipantNotFoundError) {
                errorEvent = new TransferPayeeNotFoundFailedEvt({
                    transferId: transfer.transferId,
                    payeeFspId: transfer.payeeFspId,
                    errorDescription: (err as Error).message
                });
            } else if (err instanceof PayeeParticipantIdMismatchError) {
                errorEvent = new TransferPayeeIdMismatchEvt({
                    transferId: transfer.transferId,
                    payeeFspId: transfer.payeeFspId,
                    errorDescription: (err as Error).message
                });
            } else if (err instanceof PayeeParticipantNotApprovedError) {
                errorEvent = new TransferPayeeNotApprovedEvt({
                    transferId: transfer.transferId,
                    payeeFspId: transfer.payeeFspId,
                    errorDescription: (err as Error).message
                });
            } else if (err instanceof PayeeParticipantNotActiveError) {
                errorEvent = new TransferPayeeNotActiveEvt({
                    transferId: transfer.transferId,
                    payeeFspId: transfer.payeeFspId,
                    errorDescription: (err as Error).message
                });
            } else {
                this._logger.error("Unable to handle _getParticipantsInfo error - _fulfilTransferStart");
                return;
            }

            errorEvent.fspiopOpaqueState = message.fspiopOpaqueState;
            this._outputEvents.push(errorEvent);
            return;
        }

        let participantAccounts:ITransferAccounts;
        try{
            participantAccounts = this._getTransferParticipantsAccounts(participants, transfer);
        } catch (err: unknown) {
            let errorEvent:DomainErrorEventMsg;

            if(err instanceof HubAccountNotFoundError) {
                errorEvent = new TransferHubAccountNotFoundFailedEvt({
                    transferId: transfer.transferId,
                    errorDescription: (err as Error).message
                });
            } else if (err instanceof PayerPositionAccountNotFoundError) {
                errorEvent = new TransferPayerPositionAccountNotFoundFailedEvt({
                    transferId: transfer.transferId,
                    payerFspId: transfer.payerFspId,
                    errorDescription: (err as Error).message
                });
            } else if (err instanceof PayerLiquidityAccountNotFoundError) {
                errorEvent = new TransferPayerLiquidityAccountNotFoundFailedEvt({
                    transferId: transfer.transferId,
                    payerFspId: transfer.payerFspId,
                    errorDescription: (err as Error).message
                });
            } else if (err instanceof PayeePositionAccountNotFoundError) {
                errorEvent = new TransferPayeePositionAccountNotFoundFailedEvt({
                    transferId: transfer.transferId,
                    payeeFspId: transfer.payeeFspId,
                    errorDescription: (err as Error).message
                });
            } else if (err instanceof PayeeLiquidityAccountNotFoundError) {
                errorEvent = new TransferPayeeLiquidityAccountNotFoundFailedEvt({
                    transferId: transfer.transferId,
                    payeeFspId: transfer.payeeFspId,
                    errorDescription: (err as Error).message
                });
            } else {
                this._logger.error("Unable to handle _getTransferParticipantsAccounts error - _fulfilTransferStart");
                return;
            }

            errorEvent.fspiopOpaqueState = message.fspiopOpaqueState;
            this._outputEvents.push(errorEvent);
            return;
        }

        if(this._logger.isDebugEnabled()) this._logger.debug("prepareTransferStart() - after getParticipants");

        // TODO validate participants and accounts
        // TODO put net debit cap in the participant struct
        let payerNdc = "0"; // default is zero

		if(participants.payer.netDebitCaps){
            const found = participants.payer.netDebitCaps.find((netDebitCap) => netDebitCap.currencyCode === transfer.currencyCode);
            if(found) payerNdc = found.currentValue.toString();
        }

        // set transfer in cache
        this._transfersCache.set(transfer.transferId, transfer);

        try {
            await this._schedulingAdapter.createSingleReminder(
                transfer.transferId,
                transfer.expirationTimestamp,
                {
                    payload: transfer,
                    fspiopOpaqueState: message.fspiopOpaqueState
                }
            );
        } catch (err: unknown) {
			const error = (err as Error).message;
			const errorMessage = `Unable to create reminder for transferId: ${message.payload.transferId}`;
			this._logger.error(err, `${errorMessage}: ${error}`);
			const errorEvent = new TransferUnableCreateReminderEvt({
				transferId: message.payload.transferId,
				errorDescription: errorMessage
			});
            errorEvent.fspiopOpaqueState = message.fspiopOpaqueState;
            this._outputEvents.push(errorEvent);
            return;
        }

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
        const preparedAtTime = Date.now();

        if (!transfer) {
			const errorMessage = `Could not find corresponding transfer with id: ${request.transferId} for checkLiquidAndReserve IAccountsBalancesHighLevelResponse`;
			this._logger.error(errorMessage);
			let errorEvent = new TransferNotFoundEvt({
				transferId: originalCmdMsg.payload.transferId,
				errorDescription: errorMessage
			});

            try {
                // FIXME _cancelTransfer will fail if not transfer is found, which at this point is a guarantee
                await this._cancelTransfer(originalCmdMsg.payload.transferId);
            } catch(err: unknown) {
                const error = (err as Error).message;
                const errorMessage = `Unable to cancel reservation with transferId: ${originalCmdMsg.payload.transferId}`;
                this._logger.error(err, `${errorMessage}: ${error}`);
                errorEvent = new TransferCancelReservationFailedEvt({
                    transferId: originalCmdMsg.payload.transferId,
                    errorDescription: errorMessage
                });
            }

            errorEvent.fspiopOpaqueState = originalCmdMsg.fspiopOpaqueState;
            this._outputEvents.push(errorEvent);
            return;
        }
        if(this._logger.isDebugEnabled()) this._logger.debug(`prepareTransferContinue() - Called for transferId: ${transfer.transferId}`);

        if (!abResponse.success) {
            if (abResponse.errorMessage){
                const err = new CheckLiquidityAndReserveFailedError(`Unable to check liquidity and reserve for transferId: ${request.transferId} - error: ${abResponse.errorMessage}`);
                this._logger.error(err);
            }else{
                this._logger.warn(`Payer failed liquidity check for transfer with id: ${request.transferId}`);
            }

            // TODO: handle each case with a different error event 
            const errorEvent = new TransferPrepareLiquidityCheckFailedEvt({
				transferId: transfer.transferId,
				payerFspId: transfer.payerFspId,
				amount: transfer.amount,
				currency: transfer.currencyCode,
				errorDescription: abResponse.errorMessage ?? "Payer failed liquidity check"
			});

            // update transfer and cache it
            // according to https://docs.mojaloop.io/api/fspiop/logical-data-model.html#transferstate-enum state is aborted
            transfer.transferState = TransferState.ABORTED;
            this._transfersCache.set(transfer.transferId, transfer);

            errorEvent.fspiopOpaqueState = originalCmdMsg.fspiopOpaqueState;
			this._outputEvents.push(errorEvent);
            return;
        }

        // TODO validate type
        const message = originalCmdMsg;// as PrepareTransferCmd;

        // update transfer and cache it
        transfer.transferState = TransferState.RESERVED;
        this._transfersCache.set(transfer.transferId, transfer);

        if(!transfer.bulkTransferId) {
            const payload: TransferPreparedEvtPayload = {
                transferId: message.payload.transferId,
                payeeFsp: message.payload.payeeFsp,
                payerFsp: message.payload.payerFsp,
                amount: message.payload.amount,
                currencyCode: message.payload.currencyCode,
                ilpPacket: message.payload.ilpPacket,
                condition: message.payload.condition,
                expiration: message.payload.expiration,
                settlementModel: transfer.settlementModel,
                preparedAt: preparedAtTime,
                extensionList: message.payload.extensionList
            };

            const event = new TransferPreparedEvt(payload);

            event.fspiopOpaqueState = message.fspiopOpaqueState;

            if(this._logger.isDebugEnabled()) this._logger.debug(`prepareTransferContinue() - completed for transferId: ${transfer.transferId}`);

            this._outputEvents.push(event);
        }
    }

    private async _fulfilTransferStart(message: CommitTransferFulfilCmd): Promise<void> {
        if(this._logger.isDebugEnabled()) this._logger.debug(`fulfilTransfer() - Got transferFulfilCommittedEvt msg for transferId: ${message.payload.transferId}`);

        let participantTransferAccounts: ITransferAccounts | null = null;

        let transfer: ITransfer | null = null;
        try {
			transfer = await this._getTransfer(message.payload.transferId);
		} catch(err: unknown) {
			const error = (err as Error).message;
			const errorMessage = `Unable to get transfer record for transferId: ${message.payload.transferId} from repository`;
			this._logger.error(err, `${errorMessage}: ${error}`);
			const errorEvent = new TransferUnableToGetTransferByIdEvt({
                transferId: message.payload.transferId,
				errorDescription: errorMessage
			});

            errorEvent.fspiopOpaqueState = message.fspiopOpaqueState;
            this._outputEvents.push(errorEvent);
            return;
		}

        if(!transfer) {
			const errorMessage = `Could not find corresponding transfer with id: ${message.payload.transferId} for checkLiquidAndReserve IAccountsBalancesHighLevelResponse`;
			this._logger.error(errorMessage);
			let errorEvent = new TransferNotFoundEvt({
				transferId: message.payload.transferId,
				errorDescription: errorMessage
			});

            try {
                await this._cancelTransfer(message.payload.transferId);
            } catch(err: unknown) {
                const error = (err as Error).message;
                const errorMessage = `Unable to cancel reservation with transferId: ${message.payload.transferId}`;
                this._logger.error(err, `${errorMessage}: ${error}`);
                errorEvent = new TransferCancelReservationFailedEvt({
                    transferId: message.payload.transferId,
                    errorDescription: errorMessage
                });
            }

            errorEvent.fspiopOpaqueState = message.fspiopOpaqueState;
            this._outputEvents.push(errorEvent);
            return;
        }

        let participants:ITransferParticipants;
        try {
            participants = await this._getParticipantsInfo(transfer.payerFspId, transfer.payeeFspId, transfer.transferId);
        } catch (err: unknown) {
            let errorEvent:DomainErrorEventMsg;

            if(err instanceof HubNotFoundError) {
                errorEvent = new TransferHubNotFoundFailedEvt({
                    transferId: transfer.transferId,
                    errorDescription: (err as Error).message
                });
            } else if (err instanceof HubParticipantIdMismatchError) {
                errorEvent = new TransferHubIdMismatchEvt({
                    transferId: transfer.transferId,
                    hubId: HUB_ID,
                    errorDescription: (err as Error).message
                });
            } else if (err instanceof HubParticipantNotApprovedError) {
                errorEvent = new TransferHubNotApprovedEvt({
                    transferId: transfer.transferId,
                    hubId: HUB_ID,
                    errorDescription: (err as Error).message
                });
            } else if (err instanceof HubParticipantNotActiveError) {
                errorEvent = new TransferHubNotActiveEvt({
                    transferId: transfer.transferId,
                    hubId: HUB_ID,
                    errorDescription: (err as Error).message
                });
            } else if (err instanceof PayerParticipantNotFoundError) {
                errorEvent = new TransferPayerNotFoundFailedEvt({
                    transferId: transfer.transferId,
                    payerFspId: transfer.payerFspId,
                    errorDescription: (err as Error).message
                });
            } else if (err instanceof PayerParticipantIdMismatchError) {
                errorEvent = new TransferPayerIdMismatchEvt({
                    transferId: transfer.transferId,
                    payerFspId: transfer.payerFspId,
                    errorDescription: (err as Error).message
                });
            } else if (err instanceof PayerParticipantNotApprovedError) {
                errorEvent = new TransferPayerNotApprovedEvt({
                    transferId: transfer.transferId,
                    payerFspId: transfer.payerFspId,
                    errorDescription: (err as Error).message
                });
            } else if (err instanceof PayerParticipantNotActiveError) {
                errorEvent = new TransferPayerNotActiveEvt({
                    transferId: transfer.transferId,
                    payerFspId: transfer.payerFspId,
                    errorDescription: (err as Error).message
                });
            } else if (err instanceof PayeeParticipantNotFoundError) {
                errorEvent = new TransferPayeeNotFoundFailedEvt({
                    transferId: transfer.transferId,
                    payeeFspId: transfer.payeeFspId,
                    errorDescription: (err as Error).message
                });
            } else if (err instanceof PayeeParticipantIdMismatchError) {
                errorEvent = new TransferPayeeIdMismatchEvt({
                    transferId: transfer.transferId,
                    payeeFspId: transfer.payeeFspId,
                    errorDescription: (err as Error).message
                });
            } else if (err instanceof PayeeParticipantNotApprovedError) {
                errorEvent = new TransferPayeeNotApprovedEvt({
                    transferId: transfer.transferId,
                    payeeFspId: transfer.payeeFspId,
                    errorDescription: (err as Error).message
                });
            } else if (err instanceof PayeeParticipantNotActiveError) {
                errorEvent = new TransferPayeeNotActiveEvt({
                    transferId: transfer.transferId,
                    payeeFspId: transfer.payeeFspId,
                    errorDescription: (err as Error).message
                });
            } else {
                this._logger.error("Unable to handle getParticipantsInfo error - _fulfilTransferStart");
                return;
            }

            try {
                await this._cancelTransfer(transfer.transferId);
            } catch(err: unknown) {
                const error = (err as Error).message;
                const errorMessage = `Unable to cancel reservation with transferId: ${transfer.transferId}`;
                this._logger.error(err, `${errorMessage}: ${error}`);
                errorEvent = new TransferCancelReservationFailedEvt({
                    transferId: transfer.transferId,
                    errorDescription: errorMessage
                });
            }

            errorEvent.fspiopOpaqueState = message.fspiopOpaqueState;
            this._outputEvents.push(errorEvent);
            return;
        }

        try{
            participantTransferAccounts = this._getTransferParticipantsAccounts(participants, transfer);
        } catch (err: unknown) {
            let errorEvent:DomainErrorEventMsg;

            if(err instanceof HubAccountNotFoundError) {
                errorEvent = new TransferHubAccountNotFoundFailedEvt({
                    transferId: transfer.transferId,
                    errorDescription: (err as Error).message
                });
            } else if (err instanceof PayerPositionAccountNotFoundError) {
                errorEvent = new TransferPayerPositionAccountNotFoundFailedEvt({
                    transferId: transfer.transferId,
                    payerFspId: transfer.payerFspId,
                    errorDescription: (err as Error).message
                });
            } else if (err instanceof PayerLiquidityAccountNotFoundError) {
                errorEvent = new TransferPayerLiquidityAccountNotFoundFailedEvt({
                    transferId: transfer.transferId,
                    payerFspId: transfer.payerFspId,
                    errorDescription: (err as Error).message
                });
            } else if (err instanceof PayeePositionAccountNotFoundError) {
                errorEvent = new TransferPayeePositionAccountNotFoundFailedEvt({
                    transferId: transfer.transferId,
                    payeeFspId: transfer.payeeFspId,
                    errorDescription: (err as Error).message
                });
            } else if (err instanceof PayeeLiquidityAccountNotFoundError) {
                errorEvent = new TransferPayeeLiquidityAccountNotFoundFailedEvt({
                    transferId: transfer.transferId,
                    payeeFspId: transfer.payeeFspId,
                    errorDescription: (err as Error).message
                });
            } else {
                this._logger.error("Unable to handle _getTransferParticipantsAccounts error - _fulfilTransferStart");
                return;
            }

            try {
                await this._cancelTransfer(transfer.transferId);
            } catch(err: unknown) {
                const error = (err as Error).message;
                const errorMessage = `Unable to cancel reservation with transferId: ${transfer.transferId}`;
                this._logger.error(err, `${errorMessage}: ${error}`);
                errorEvent = new TransferCancelReservationFailedEvt({
                    transferId: transfer.transferId,
                    errorDescription: errorMessage
                });
            }

            errorEvent.fspiopOpaqueState = message.fspiopOpaqueState;
            this._outputEvents.push(errorEvent);
            return;
        }

        // set transfer in cache
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
        const fulfiledAtTime = Date.now();
        
        if (!transfer) {
			const errorMessage = `Could not find corresponding transfer with id: ${request.transferId} for _fulfilTTransferContinue IAccountsBalancesHighLevelResponse`;
			this._logger.error(errorMessage);
			let errorEvent = new TransferNotFoundEvt({
				transferId: originalCmdMsg.payload.transferId,
				errorDescription: errorMessage
			});

            try {
                await this._cancelTransfer(originalCmdMsg.payload.transferId);
            } catch(err: unknown) {
                const error = (err as Error).message;
                const errorMessage = `Unable to cancel reservation with transferId: ${originalCmdMsg.payload.transferId}`;
                this._logger.error(err, `${errorMessage}: ${error}`);
                errorEvent = new TransferCancelReservationFailedEvt({
                    transferId: originalCmdMsg.payload.transferId,
                    errorDescription: errorMessage
                });
            }

            errorEvent.fspiopOpaqueState = originalCmdMsg.fspiopOpaqueState;
            this._outputEvents.push(errorEvent);
            return;
        }

        if(this._logger.isDebugEnabled()) this._logger.debug(`fulfilTTransferContinue() - started for transferId: ${transfer.transferId}`);

        if (!abResponse.success) {
            // TODO shouldn't this be a UnableToCommitTransferError?
            const err = new CheckLiquidityAndReserveFailedError(`Unable to cancelReservationAndCommit for transferId: ${request.transferId} - error: ${abResponse.errorMessage}`);
            this._logger.error(err);
            transfer.transferState = TransferState.ABORTED;
            this._transfersCache.set(transfer.transferId, transfer);

			const errorMessage = `Unable to commit transfer for transferId: ${request.transferId}`;
			let errorEvent = new TransferCancelReservationAndCommitFailedEvt({
				transferId: request.transferId,
				errorDescription: errorMessage
			});

            try {
                await this._cancelTransfer(transfer.transferId);
            } catch(err: unknown) {
                const error = (err as Error).message;
                const errorMessage = `Unable to cancel reservation with transferId: ${transfer.transferId}`;
                this._logger.error(err, `${errorMessage}: ${error}`);
                errorEvent = new TransferCancelReservationFailedEvt({
                    transferId: transfer.transferId,
                    errorDescription: errorMessage
                });
            }

            errorEvent.fspiopOpaqueState = originalCmdMsg.fspiopOpaqueState;
            this._outputEvents.push(errorEvent);
            return;
        }

        // TODO if failed, queue a cancelReservation request to this._abCancelationBatchRequests and add the error event to the events queue
        // this._abCancelationBatchRequests.push({
        //     requestType: AccountsBalancesHighLevelRequestTypes.cancelReservation,
        //     ...

        // TODO validate type
        const message = originalCmdMsg;// as PrepareTransferCmd;


        transfer.updatedAt = Date.now();
        transfer.transferState = TransferState.COMMITTED;
        transfer.fulfilment = message.payload.fulfilment;
        transfer.completedTimestamp = message.payload.completedTimestamp;
        transfer.extensionList = message.payload.extensionList;

        this._transfersCache.set(transfer.transferId, transfer);

        if(!transfer.bulkTransferId) {
            const event = new TransferFulfiledEvt({
                transferId: message.payload.transferId,
                fulfilment: message.payload.fulfilment,
                completedTimestamp: message.payload.completedTimestamp,
                extensionList: message.payload.extensionList,
                payerFspId: transfer.payerFspId,
                payeeFspId: transfer.payeeFspId,
                amount: transfer.amount,
                currencyCode: transfer.currencyCode,
                settlementModel: transfer.settlementModel,
                notifyPayee: message.payload.notifyPayee,
                fulfiledAt: fulfiledAtTime
            });

            // carry over opaque state fields
            event.fspiopOpaqueState = message.fspiopOpaqueState;

            this._logger.debug("transferPreparedReceivedEvt completed for transferId: " + transfer.transferId);

            this._outputEvents.push(event);
        }

        if(this._logger.isDebugEnabled()) this._logger.debug(`fulfilTTransferContinue() - completed for transferId: ${transfer.transferId}`);
    }

    private async _rejectTransfer(message: RejectTransferCmd):Promise<void> {
		this._logger.debug(`rejectTransfer() - Got transferRejectRequestedEvt msg for transferId: ${message.payload.transferId}`);

		let transfer:ITransfer | null = null;

		try {
			transfer = await this._getTransfer(message.payload.transferId);
		} catch(err: unknown) {
			const error = (err as Error).message;
			const errorMessage = `Unable to get transfer record for transferId: ${message.payload.transferId} from repository`;
			this._logger.error(err, `${errorMessage}: ${error}`);
			const errorEvent = new TransferUnableToGetTransferByIdEvt({
				transferId: message.payload.transferId,
				errorDescription: errorMessage
			});

            errorEvent.fspiopOpaqueState = message.fspiopOpaqueState;
            this._outputEvents.push(errorEvent);
            return;
		}

		if(!transfer) {
			const errorMessage = `TransferId: ${message.payload.transferId} could not be found`;
			this._logger.error(errorMessage);
			const errorEvent = new TransferNotFoundEvt({
				transferId: message.payload.transferId,
				errorDescription: errorMessage
			});

            errorEvent.fspiopOpaqueState = message.fspiopOpaqueState;
            this._outputEvents.push(errorEvent);
            return;
		}

        if(this._logger.isDebugEnabled()) this._logger.debug("_rejectTransfer() - before getParticipants...");

        try{
            await this._getParticipantsInfo(transfer.payerFspId, transfer.payeeFspId, transfer.transferId);
        } catch (err: unknown) {
            let errorEvent:DomainErrorEventMsg;

            if(err instanceof HubNotFoundError) {
                errorEvent = new TransferHubNotFoundFailedEvt({
                    transferId: transfer.transferId,
                    errorDescription: (err as Error).message
                });
            } else if (err instanceof HubParticipantIdMismatchError) {
                errorEvent = new TransferHubIdMismatchEvt({
                    transferId: transfer.transferId,
                    hubId: HUB_ID,
                    errorDescription: (err as Error).message
                });
            } else if (err instanceof HubParticipantNotApprovedError) {
                errorEvent = new TransferHubNotApprovedEvt({
                    transferId: transfer.transferId,
                    hubId: HUB_ID,
                    errorDescription: (err as Error).message
                });
            } else if (err instanceof HubParticipantNotActiveError) {
                errorEvent = new TransferHubNotActiveEvt({
                    transferId: transfer.transferId,
                    hubId: HUB_ID,
                    errorDescription: (err as Error).message
                });
            } else if (err instanceof PayerParticipantNotFoundError) {
                errorEvent = new TransferPayerNotFoundFailedEvt({
                    transferId: transfer.transferId,
                    payerFspId: transfer.payerFspId,
                    errorDescription: (err as Error).message
                });
            } else if (err instanceof PayerParticipantIdMismatchError) {
                errorEvent = new TransferPayerIdMismatchEvt({
                    transferId: transfer.transferId,
                    payerFspId: transfer.payerFspId,
                    errorDescription: (err as Error).message
                });
            } else if (err instanceof PayerParticipantNotApprovedError) {
                errorEvent = new TransferPayerNotApprovedEvt({
                    transferId: transfer.transferId,
                    payerFspId: transfer.payerFspId,
                    errorDescription: (err as Error).message
                });
            } else if (err instanceof PayerParticipantNotActiveError) {
                errorEvent = new TransferPayerNotActiveEvt({
                    transferId: transfer.transferId,
                    payerFspId: transfer.payerFspId,
                    errorDescription: (err as Error).message
                });
            } else if (err instanceof PayeeParticipantNotFoundError) {
                errorEvent = new TransferPayeeNotFoundFailedEvt({
                    transferId: transfer.transferId,
                    payeeFspId: transfer.payeeFspId,
                    errorDescription: (err as Error).message
                });
            } else if (err instanceof PayeeParticipantIdMismatchError) {
                errorEvent = new TransferPayeeIdMismatchEvt({
                    transferId: transfer.transferId,
                    payeeFspId: transfer.payeeFspId,
                    errorDescription: (err as Error).message
                });
            } else if (err instanceof PayeeParticipantNotApprovedError) {
                errorEvent = new TransferPayeeNotApprovedEvt({
                    transferId: transfer.transferId,
                    payeeFspId: transfer.payeeFspId,
                    errorDescription: (err as Error).message
                });
            } else if (err instanceof PayeeParticipantNotActiveError) {
                errorEvent = new TransferPayeeNotActiveEvt({
                    transferId: transfer.transferId,
                    payeeFspId: transfer.payeeFspId,
                    errorDescription: (err as Error).message
                });
            } else {
                this._logger.error("Unable to handle _getParticipantsInfo error - _rejectTransfer");
                return;
            }

            errorEvent.fspiopOpaqueState = message.fspiopOpaqueState;
            this._outputEvents.push(errorEvent);
            return;
        }

        if(this._logger.isDebugEnabled()) this._logger.debug("_rejectTransfer() - after getParticipants");

        try {
            await this._cancelTransfer(message.payload.transferId);
        } catch(err: unknown) {
            const error = (err as Error).message;
            const errorMessage = `Unable to cancel reservation with transferId: ${message.payload.transferId}`;
            this._logger.error(err, `${errorMessage}: ${error}`);
            const errorEvent = new TransferCancelReservationFailedEvt({
                transferId: message.payload.transferId,
                errorDescription: errorMessage
            });

            errorEvent.fspiopOpaqueState = message.fspiopOpaqueState;
            this._outputEvents.push(errorEvent);
            return;
        }

		try {
			transfer.transferState = TransferState.ABORTED;
            transfer.errorInformation = message.payload.errorInformation;
			await this._transfersRepo.updateTransfer(transfer);
		} catch(err: unknown) {
			const error = (err as Error).message;
			const errorMessage = `Error updating transfer for transferId: ${transfer.transferId}.`;
			this._logger.error(err, `${errorMessage}: ${error}`);
			const errorEvent = new TransferUnableToUpdateEvt({
				transferId: transfer.transferId,
				payerFspId: transfer.payerFspId,
				errorDescription: errorMessage
			});

            errorEvent.fspiopOpaqueState = message.fspiopOpaqueState;
            this._outputEvents.push(errorEvent);
            return;
		}

        if(!transfer.bulkTransferId) {
            const payload: TransferRejectRequestProcessedEvtPayload = {
                transferId: message.payload.transferId,
                errorInformation: message.payload.errorInformation
            };

            const event = new TransferRejectRequestProcessedEvt(payload);

            event.fspiopOpaqueState = message.fspiopOpaqueState;

            this._logger.debug("_rejectTransfer completed for transferId: " + transfer.transferId);

            this._outputEvents.push(event);
        }
        if(this._logger.isDebugEnabled()) this._logger.debug(`_rejectTransfer() - completed for transferId: ${transfer.transferId}`);
	}

    private async _queryTransfer(message: QueryTransferCmd):Promise<void> {
		this._logger.debug(`queryTransfer() - Got transferQueryRequestEvt msg for transferId: ${message.payload.transferId}`);
        
		const requesterFspId = message.fspiopOpaqueState?.requesterFspId ?? null;
		const destinationFspId = message.fspiopOpaqueState?.destinationFspId ?? null;
        const transferId = message.payload.transferId;
        
        if(this._logger.isDebugEnabled()) this._logger.debug("_queryTransfer() - before getParticipants...");

        try{
            await this._getParticipantsInfo(requesterFspId, destinationFspId, message.payload.transferId);
        } catch (err: unknown) {
            let errorEvent:DomainErrorEventMsg;

            if(err instanceof HubNotFoundError) {
                errorEvent = new TransferHubNotFoundFailedEvt({
                    transferId: transferId,
                    errorDescription: (err as Error).message
                });
            } else if (err instanceof HubParticipantIdMismatchError) {
                errorEvent = new TransferHubIdMismatchEvt({
                    transferId: transferId,
                    hubId: HUB_ID,
                    errorDescription: (err as Error).message
                });
            } else if (err instanceof HubParticipantNotApprovedError) {
                errorEvent = new TransferHubNotApprovedEvt({
                    transferId: transferId,
                    hubId: HUB_ID,
                    errorDescription: (err as Error).message
                });
            } else if (err instanceof HubParticipantNotActiveError) {
                errorEvent = new TransferHubNotActiveEvt({
                    transferId: transferId,
                    hubId: HUB_ID,
                    errorDescription: (err as Error).message
                });
            } else if (err instanceof PayerParticipantNotFoundError) {
                errorEvent = new TransferPayerNotFoundFailedEvt({
                    transferId: transferId,
                    payerFspId: requesterFspId,
                    errorDescription: (err as Error).message
                });
            } else if (err instanceof PayerParticipantIdMismatchError) {
                errorEvent = new TransferPayerIdMismatchEvt({
                    transferId: transferId,
                    payerFspId: requesterFspId,
                    errorDescription: (err as Error).message
                });
            } else if (err instanceof PayerParticipantNotApprovedError) {
                errorEvent = new TransferPayerNotApprovedEvt({
                    transferId: transferId,
                    payerFspId: requesterFspId,
                    errorDescription: (err as Error).message
                });
            } else if (err instanceof PayerParticipantNotActiveError) {
                errorEvent = new TransferPayerNotActiveEvt({
                    transferId: transferId,
                    payerFspId: requesterFspId,
                    errorDescription: (err as Error).message
                });
            } else if (err instanceof PayeeParticipantNotFoundError) {
                errorEvent = new TransferPayeeNotFoundFailedEvt({
                    transferId: transferId,
                    payeeFspId: destinationFspId,
                    errorDescription: (err as Error).message
                });
            } else if (err instanceof PayeeParticipantIdMismatchError) {
                errorEvent = new TransferPayeeIdMismatchEvt({
                    transferId: transferId,
                    payeeFspId: destinationFspId,
                    errorDescription: (err as Error).message
                });
            } else if (err instanceof PayeeParticipantNotApprovedError) {
                errorEvent = new TransferPayeeNotApprovedEvt({
                    transferId: transferId,
                    payeeFspId: destinationFspId,
                    errorDescription: (err as Error).message
                });
            } else if (err instanceof PayeeParticipantNotActiveError) {
                errorEvent = new TransferPayeeNotActiveEvt({
                    transferId: transferId,
                    payeeFspId: destinationFspId,
                    errorDescription: (err as Error).message
                });
            } else {
                this._logger.error("Unable to handle _getParticipantsInfo error - _queryTransfer");
                return;
            }

            errorEvent.fspiopOpaqueState = message.fspiopOpaqueState;
            this._outputEvents.push(errorEvent);
            return;
        }

        if(this._logger.isDebugEnabled()) this._logger.debug("_queryTransfer() - after getParticipants");

		let transfer:ITransfer | null = null;

		try {
			transfer = await this._transfersRepo.getTransferById(message.payload.transferId);
		} catch(err: unknown) {
			const error = (err as Error).message;
			const errorMessage = `Unable to get transfer record for transferId: ${message.payload.transferId} from repository`;
			this._logger.error(err, `${errorMessage}: ${error}`);
			const errorEvent = new TransferUnableToGetTransferByIdEvt({
				transferId: message.payload.transferId,
				errorDescription: errorMessage
			});

            errorEvent.fspiopOpaqueState = message.fspiopOpaqueState;
            this._outputEvents.push(errorEvent);
            return;
		}

		if(!transfer) {
			const errorMessage = `TransferId: ${message.payload.transferId} could not be found`;
			this._logger.error(errorMessage);
			const errorEvent = new TransferNotFoundEvt({
				transferId: message.payload.transferId,
				errorDescription: errorMessage
			});

            errorEvent.fspiopOpaqueState = message.fspiopOpaqueState;
            this._outputEvents.push(errorEvent);
            return;
		}

		const payload: TransferQueryResponseEvtPayload = {
			transferId: transfer.transferId,
			transferState: transfer.transferState,
			completedTimestamp: transfer.completedTimestamp,
			fulfilment: transfer.fulfilment,
			extensionList: transfer.extensionList
		};

		const event = new TransferQueryResponseEvt(payload);

		event.fspiopOpaqueState = message.fspiopOpaqueState;

        this._logger.debug("_queryTransfer completed for transferId: " + transfer.transferId);

        this._outputEvents.push(event);
        if(this._logger.isDebugEnabled()) this._logger.debug(`_queryTransfer() - completed for transferId: ${transfer.transferId}`);
	}

    private async _getParticipantsInfo(payerFspId: string, payeeFspId: string, transferId: string): Promise<ITransferParticipants> {
        // TODO get all participants in a single call with participantsClient.getParticipantsByIds()

        const foundHub = await this._participantAdapter.getParticipantInfo(HUB_ID);
        if (!foundHub) {
            const errorMessage = "Hub not found " + HUB_ID + " for transfer " + transferId;
            this._logger.error(errorMessage);
            throw new HubNotFoundError(errorMessage);
        }
        if (foundHub.id !== HUB_ID) {
            const errorMessage = "Hub participant id mismatch " + HUB_ID + " for transfer " + transferId;
            this._logger.error(errorMessage);
            throw new HubParticipantIdMismatchError(errorMessage);
		}
        if (!foundHub.approved) {
            const errorMessage = "Hub participant not approved " + HUB_ID + " for transfer " + transferId;
            this._logger.error(errorMessage);
            throw new HubParticipantNotApprovedError(errorMessage);
		}
		if (!foundHub.isActive) {
            const errorMessage = "Hub participant not active " + HUB_ID + " for transfer " + transferId;
			this._logger.error(errorMessage);
            throw new HubParticipantNotActiveError(errorMessage);
		}

        const foundPayer = await this._participantAdapter.getParticipantInfo(payerFspId);
        if (!foundPayer) {
            const errorMessage = "Payer participant not found " + payerFspId + " for transfer " + transferId;
            this._logger.error(errorMessage);
            throw new PayerParticipantNotFoundError(errorMessage);
        }
        if (foundPayer.id !== payerFspId) {
            const errorMessage = "Payer participant id mismatch " + payerFspId + " for transfer " + transferId;
            this._logger.error(errorMessage);
            throw new PayerParticipantIdMismatchError(errorMessage);
		}
        if (!foundPayer.approved) {
            const errorMessage = "Payer participant not approved " + payerFspId + " for transfer " + transferId;
            this._logger.error(errorMessage);
            throw new PayerParticipantNotApprovedError(errorMessage);
		}
		if (!foundPayer.isActive) {
            const errorMessage = "Payer participant not active " + payerFspId + " for transfer " + transferId;
			this._logger.error(errorMessage);
            throw new PayerParticipantNotActiveError(errorMessage);
		}

        const foundPayee = await this._participantAdapter.getParticipantInfo(payeeFspId);
        if (!foundPayee) {
            const errorMessage = "Payee participant not found " + payeeFspId + " for transfer " + transferId;
            this._logger.error(errorMessage);
            throw new PayeeParticipantNotFoundError(errorMessage);
        }
        if (foundPayee.id !== payeeFspId) {
            const errorMessage = "Payee participant id mismatch " + payeeFspId + " for transfer " + transferId;
            this._logger.error(errorMessage);
            throw new PayeeParticipantIdMismatchError(errorMessage);
		}
        if (!foundPayee.approved) {
            const errorMessage = "Payee participant not approved " + payeeFspId + " for transfer " + transferId;
            this._logger.error(errorMessage);
            throw new PayeeParticipantNotApprovedError(errorMessage);
		}
		if (!foundPayee.isActive) {
            const errorMessage = "Payee participant not active " + payeeFspId + " for transfer " + transferId;
			this._logger.error(errorMessage);
            throw new PayeeParticipantNotActiveError(errorMessage);
		}

        return {
            hub: foundHub,
            payer: foundPayer,
            payee: foundPayee
        };
    }


    private _getTransferParticipantsAccounts(transferParticipants: ITransferParticipants, transfer: ITransfer): ITransferAccounts {

        const {hub, payer: transferPayerParticipant, payee: transferPayeeParticipant} = transferParticipants;

        const hubAccount = hub.participantAccounts.find((value: IParticipantAccount) => (value.type as string) === AccountType.HUB && value.currencyCode === transfer.currencyCode);
        if(!hubAccount) {
			const errorMessage = "Hub account not found for transfer " + transfer.transferId;
            this._logger.error(errorMessage);
            throw new HubAccountNotFoundError(errorMessage);
        }

        const payerPosAccount = transferPayerParticipant.participantAccounts.find((value: IParticipantAccount) => (value.type as string) === AccountType.POSITION && value.currencyCode === transfer.currencyCode);
        if(!payerPosAccount) {
			const errorMessage = `Payer position account not found: transferId: ${transfer.transferId}, payer: ${transfer.payerFspId}`;
            this._logger.error(errorMessage);
            throw new PayerPositionAccountNotFoundError(errorMessage);
        }

        const payerLiqAccount = transferPayerParticipant.participantAccounts.find((value: IParticipantAccount) => (value.type as string) === AccountType.SETTLEMENT && value.currencyCode === transfer.currencyCode);
        if(!payerLiqAccount) {
			const errorMessage = `Payer liquidity account not found: transferId: ${transfer.transferId}, payer: ${transfer.payerFspId}`;
            this._logger.error(errorMessage);
            throw new PayerLiquidityAccountNotFoundError(errorMessage);
        }

        const payeePosAccount = transferPayeeParticipant.participantAccounts.find((value: IParticipantAccount) => (value.type as string) === AccountType.POSITION && value.currencyCode === transfer.currencyCode);
        if(!payeePosAccount) {
			const errorMessage = `Payee position account not found: transferId: ${transfer.transferId}, payee: ${transfer.payeeFspId}`;
            this._logger.error(errorMessage);
            throw new PayeePositionAccountNotFoundError(errorMessage);
        }

        const payeeLiqAccount = transferPayeeParticipant.participantAccounts.find((value: IParticipantAccount) => (value.type as string) === AccountType.SETTLEMENT && value.currencyCode === transfer.currencyCode);
        if(!payeeLiqAccount) {
			const errorMessage = `Payee liquidity account not found: transferId: ${transfer.transferId}, payee: ${transfer.payeeFspId}`;
            this._logger.error(errorMessage);
            throw new PayeeLiquidityAccountNotFoundError(errorMessage);
        }

        return {
            hubAccount: hubAccount,
            payerPosAccount: payerPosAccount,
            payerLiqAccount: payerLiqAccount,
            payeePosAccount: payeePosAccount,
            payeeLiqAccount: payeeLiqAccount
        };
    }

    private async _cancelTransfer(transferId: string) {
        try {
            //const transfer = this._transfersCache.get(transferId);
            const transfer = await this._getTransfer(transferId);

            if(!transfer) {
                const errorMessage = `Could not find corresponding transfer with id: ${transferId} for cancelTransfer`;
                this._logger.error(errorMessage);
                throw new TransferNotFoundError(errorMessage);
            }
            const participants = await this._getParticipantsInfo(transfer.payerFspId, transfer.payeeFspId, transfer.transferId);

            const participantTransferAccounts = this._getTransferParticipantsAccounts(participants, transfer);

            this._abCancelationBatchRequests.push({
                requestType: AccountsBalancesHighLevelRequestTypes.cancelReservation,
                requestId: randomUUID(),
                payerPositionAccountId: participantTransferAccounts.payerPosAccount.id,
                payerLiquidityAccountId: participantTransferAccounts.payerLiqAccount.id,
                hubJokeAccountId: participantTransferAccounts.hubAccount.id,
                transferId: transfer.transferId,
                transferAmount: transfer.amount,
                currencyCode: transfer.currencyCode,
                payerNetDebitCap: null,
                payeePositionAccountId: null,
            });

            transfer.transferState = TransferState.ABORTED;

            await this._transfersRepo.updateTransfer(transfer);
        } catch (err: unknown) {
            const errorMessage = `Error cancelling transfer ${transferId} ${err}`;
            this._logger.error(err, errorMessage);
            throw new UnableToCancelTransferError(errorMessage);
        }
    }

    private async _prepareBulkTransferStart(message: PrepareBulkTransferCmd): Promise<void> {
        if(this._logger.isDebugEnabled()) this._logger.debug(`_prepareBulkTransferStart() - Got BulkTransferPrepareRequestedEvt msg for bulkTransferId: ${message.payload.bulkTransferId}`);

        const bulkTransferId = message.payload.bulkTransferId;
        const bulkTransfer: IBulkTransfer = {
            bulkTransferId: message.payload.bulkTransferId,
			bulkQuoteId: message.payload.bulkQuoteId,
            payeeFsp: message.payload.payeeFsp,
            payerFsp: message.payload.payerFsp,
            individualTransfers: message.payload.individualTransfers,
            expiration: message.payload.expiration,
            completedTimestamp: null,
            extensionList: message.payload.extensionList,
            transfersPreparedProcessedIds: [],
			transfersNotProcessedIds: [],
			transfersFulfiledProcessedIds: [],
			status: BulkTransferState.RECEIVED,
            errorInformation: null
		};

        try{
            this._bulkTransfersRepo.addBulkTransfer(bulkTransfer);
        } catch(err:unknown){
            const error = (err as Error).message;
            const errorMessage = `Error adding bulk transfer ${bulkTransferId} to database: ${error}`;
            this._logger.error(err, `${errorMessage}: ${error}`);
            const errorEvent = new TransferBCUnableToAddBulkTransferToDatabaseEvt({
                bulkTransferId: bulkTransfer.bulkTransferId,
                errorDescription: errorMessage
            });
            errorEvent.fspiopOpaqueState = message.fspiopOpaqueState;
            this._outputEvents.push(errorEvent);
            return;
        }

        for(let i=0 ; i<message.payload.individualTransfers.length ; i+=1) {
            const individualTransfer = message.payload.individualTransfers[i];

            const transferCmd = new PrepareTransferCmd({
                bulkTransferId: message.payload.bulkTransferId,
                transferId: individualTransfer.transferId,
                amount: individualTransfer.transferAmount.amount,
                currencyCode: individualTransfer.transferAmount.currency,
                payerFsp: message.payload.payerFsp,
                payeeFsp: message.payload.payeeFsp,
                ilpPacket: individualTransfer.ilpPacket,
                expiration: message.payload.expiration,
                condition: individualTransfer.condition,
                extensionList: individualTransfer.extensionList,
                payerIdType: individualTransfer.payerIdType, 
                payeeIdType: individualTransfer.payeeIdType,
                transferType: individualTransfer.transferType,
                prepare: message.fspiopOpaqueState
            });

            await this._prepareTransferStart(transferCmd);
        }
        
        if(this._logger.isDebugEnabled()) this._logger.debug("_prepareBulkTransferStart() - complete");
    }

    private async _prepareBulkTransferContinue(
        abResponse: IAccountsBalancesHighLevelResponse,
        request: IAccountsBalancesHighLevelRequest,
        originalCmdMsg:IDomainMessage,
        transfer: ITransfer
    ): Promise<void> {
        await this._prepareTransferContinue(abResponse, request, originalCmdMsg, transfer);
        
        // TODO validate type
        const message = originalCmdMsg;// as PrepareBulkTransferCmd;

        let bulkTransfer: IBulkTransfer | null = null;
        try {
            bulkTransfer = await this._getBulkTransfer(transfer.bulkTransferId as string);
        } catch(err: unknown) {
            const error = (err as Error).message;
            const errorMessage = `Unable to get bulk transferId: ${transfer.bulkTransferId} from repository`;
            this._logger.error(err, `${errorMessage}: ${error}`);
            const errorEvent = new TransferUnableToGetBulkTransferByIdEvt({
                bulkTransferId: transfer.bulkTransferId as string,
                errorDescription: errorMessage
            });

            errorEvent.fspiopOpaqueState = message.fspiopOpaqueState;
            this._outputEvents.push(errorEvent);
            return;
        }

        if(!bulkTransfer) {
			const errorMessage = `Could not find corresponding bulk transfer with id: ${transfer.bulkTransferId} for checkLiquidAndReserve IAccountsBalancesHighLevelResponse`;
			this._logger.error(errorMessage);
			const errorEvent = new BulkTransferNotFoundEvt({
				bulkTransferId: transfer.bulkTransferId as string,
				errorDescription: errorMessage
			});

            errorEvent.fspiopOpaqueState = message.fspiopOpaqueState;
            this._outputEvents.push(errorEvent);
            return;
        }
        
        bulkTransfer?.transfersPreparedProcessedIds.push(transfer.transferId as string);
        this._bulkTransfersCache.set(bulkTransfer.bulkTransferId, bulkTransfer);

        if(bulkTransfer.transfersPreparedProcessedIds.length + bulkTransfer?.transfersNotProcessedIds.length === bulkTransfer.individualTransfers.length) {
            bulkTransfer.status = BulkTransferState.PENDING;
            this._bulkTransfersCache.set(bulkTransfer.bulkTransferId, bulkTransfer);
            
            const transfers:ITransfer[] = [];

            /* eslint-disable-next-line @typescript-eslint/no-unused-vars */
            Array.from(this._transfersCache).filter(([_key, cachedTransfer]) => {
                if(cachedTransfer.bulkTransferId === bulkTransfer?.bulkTransferId) {
                    transfers.push(cachedTransfer);
                }
            });

            if(transfers.length === 0) {
                const errorMessage = `BulkTransferId: ${bulkTransfer.bulkTransferId} has no associated transfers`;
                this._logger.error(errorMessage);
                const errorEvent = new TransferNotFoundEvt({
                    transferId: bulkTransfer.bulkTransferId,
                    errorDescription: errorMessage
                });
    
                errorEvent.fspiopOpaqueState = message.fspiopOpaqueState;
                this._outputEvents.push(errorEvent);
                return;
            }
            
            const payload: BulkTransferPreparedEvtPayload = {
                bulkTransferId: message.payload.bulkTransferId,
                bulkQuoteId: message.payload.bulkQuoteId,
                payeeFsp: message.payload.payeeFsp,
                payerFsp: message.payload.payerFsp,
                expiration: message.payload.expiration,
                extensionList: message.payload.extensionList,
                individualTransfers: transfers.map((transferResult: ITransfer) => {
                    return {
                        transferId: transferResult.transferId,
                        amount: transferResult.amount,
                        currencyCode: transferResult.currencyCode,
                        ilpPacket: transferResult.ilpPacket,
                        condition: transferResult.condition,
                        extensionList: transferResult.extensionList
                    };
                }),
            };

            const event = new BulkTransferPreparedEvt(payload);

            event.fspiopOpaqueState = message.fspiopOpaqueState;

            if(this._logger.isDebugEnabled()) this._logger.debug(`prepareBulkTransferContinue() - completed for transferId: ${transfer.transferId}`);

            this._outputEvents.push(event);
        }
    }

    private async _fulfilBulkTransferStart(message: CommitBulkTransferFulfilCmd): Promise<void> {
        if(this._logger.isDebugEnabled()) this._logger.debug(`fulfilTransfer() - Got CommitBulkTransferFulfilCmd msg for bulkTransferId: ${message.payload.bulkTransferId}`);

        const bulkTransferId = message.payload.bulkTransferId;
        let bulkTransfer: IBulkTransfer | null = null;
        try {
            bulkTransfer = await this._getBulkTransfer(bulkTransferId as string);
        } catch(err: unknown) {
            const error = (err as Error).message;
            const errorMessage = `Unable to get transfer record for bulk transferId: ${bulkTransferId} from repository`;
            this._logger.error(err, `${errorMessage}: ${error}`);
            const errorEvent = new TransferUnableToGetBulkTransferByIdEvt({
                bulkTransferId: bulkTransferId as string,
                errorDescription: errorMessage
            });

            errorEvent.fspiopOpaqueState = message.fspiopOpaqueState;
            this._outputEvents.push(errorEvent);
            return;
        }

        if(!bulkTransfer) {
			const errorMessage = `Could not find corresponding bulk transfer with id: ${bulkTransferId} for checkLiquidAndReserve IAccountsBalancesHighLevelResponse`;
			this._logger.error(errorMessage);
			const errorEvent = new BulkTransferNotFoundEvt({
				bulkTransferId: bulkTransferId as string,
				errorDescription: errorMessage
			});

            errorEvent.fspiopOpaqueState = message.fspiopOpaqueState;
            this._outputEvents.push(errorEvent);
            return;
        }
        
        bulkTransfer.status = BulkTransferState.ACCEPTED;
        this._bulkTransfersCache.set(bulkTransfer.bulkTransferId, bulkTransfer);

        for(let i=0 ; i<message.payload.individualTransferResults.length ; i+=1) {
            const individualTransfer = message.payload.individualTransferResults[i];

            const transferCmd:CommitTransferFulfilCmd = new CommitTransferFulfilCmd({
                transferId: individualTransfer.transferId,
                transferState: message.payload.bulkTransferState,
                fulfilment: individualTransfer.fulfilment,
                completedTimestamp: message.payload.completedTimestamp,
                notifyPayee: false,
                extensionList: individualTransfer.extensionList,
                prepare: message.fspiopOpaqueState
            });

            await this._fulfilTransferStart(transferCmd);
        }
        if(this._logger.isDebugEnabled()) this._logger.debug(`_fulfilBulkTransferStart() - completed for bulkTransferId: ${message.payload.bulkTransferId}`);
    }

    private async _fulfilBulkTransferContinue(
        abResponse: IAccountsBalancesHighLevelResponse,
        request: IAccountsBalancesHighLevelRequest,
        originalCmdMsg:IDomainMessage,
        transfer: ITransfer
    ): Promise<void> {        
        // TODO validate type
        const message = originalCmdMsg;// as PrepareBulkTransferCmd;

        let bulkTransfer: IBulkTransfer | null = null;
        try {
            bulkTransfer = await this._getBulkTransfer(transfer.bulkTransferId as string);
        } catch(err: unknown) {
            const error = (err as Error).message;
            const errorMessage = `Unable to get transfer record for bulk transferId: ${transfer.bulkTransferId} from repository`;
            this._logger.error(err, `${errorMessage}: ${error}`);
            const errorEvent = new TransferUnableToGetBulkTransferByIdEvt({
                bulkTransferId: transfer.bulkTransferId as string,
                errorDescription: errorMessage
            });

            errorEvent.fspiopOpaqueState = message.fspiopOpaqueState;
            this._outputEvents.push(errorEvent);
            return;
        }

        if(!bulkTransfer) {
			const errorMessage = `Could not find corresponding bulk transfer with id: ${transfer.bulkTransferId} for checkLiquidAndReserve IAccountsBalancesHighLevelResponse`;
			this._logger.error(errorMessage);
			const errorEvent = new BulkTransferNotFoundEvt({
				bulkTransferId: transfer.bulkTransferId as string,
				errorDescription: errorMessage
			});

            errorEvent.fspiopOpaqueState = message.fspiopOpaqueState;
            this._outputEvents.push(errorEvent);
            return;
        }

        bulkTransfer.status = BulkTransferState.PROCESSING;
        this._bulkTransfersCache.set(bulkTransfer.bulkTransferId, bulkTransfer);

        await this._fulfilTTransferContinue(abResponse, request, originalCmdMsg, transfer);

        bulkTransfer?.transfersFulfiledProcessedIds.push(transfer.transferId as string);
        this._bulkTransfersCache.set(bulkTransfer.bulkTransferId, bulkTransfer);


        if(bulkTransfer?.transfersFulfiledProcessedIds.length + bulkTransfer?.transfersNotProcessedIds.length === bulkTransfer?.individualTransfers.length) {
            bulkTransfer.status = BulkTransferState.COMPLETED;
            this._bulkTransfersCache.set(bulkTransfer.bulkTransferId, bulkTransfer);

            const event = new BulkTransferFulfiledEvt({
                bulkTransferId: message.payload.bulkTransferId,
                bulkTransferState: message.payload.bulkTransferState,
                completedTimestamp: message.payload.completedTimestamp,
                individualTransferResults: message.payload.individualTransferResults,
                extensionList: message.payload.extensionList
            });


            // carry over opaque state fields
            event.fspiopOpaqueState = message.fspiopOpaqueState;

            this._logger.debug("transferPreparedReceivedEvt completed for transferId: " + transfer.transferId);

            this._outputEvents.push(event);

            this._bulkTransfersRepo.updateBulkTransfer(bulkTransfer);
            this._bulkTransfersCache.clear();
            if(this._logger.isDebugEnabled()) this._logger.debug(`fulfilTTransferContinue() - completed for transferId: ${transfer.transferId}`);
        }
    }
    
    private async _rejectBulkTransfer(message: RejectBulkTransferCmd):Promise<void> {
		this._logger.debug(`rejectBulkTransfer() - Got bulkTransferRejectRequestedEvt msg for transferId: ${message.payload.bulkTransferId}`);
        
        const bulkTransferId = message.payload.bulkTransferId;
                
        let bulkTransfer: IBulkTransfer | null = null;
        try {
            bulkTransfer = await this._getBulkTransfer(bulkTransferId as string);
        } catch(err: unknown) {
            const error = (err as Error).message;
            const errorMessage = `Unable to get transfer record for bulk transferId: ${bulkTransferId} from repository`;
            this._logger.error(err, `${errorMessage}: ${error}`);
            const errorEvent = new TransferUnableToGetBulkTransferByIdEvt({
                bulkTransferId: bulkTransferId,
                errorDescription: errorMessage
            });

            errorEvent.fspiopOpaqueState = message.fspiopOpaqueState;
            this._outputEvents.push(errorEvent);
            return;
        }

        if(!bulkTransfer) {
			const errorMessage = `Could not find corresponding bulk transfer with id: ${bulkTransferId}`;
			this._logger.error(errorMessage);
			const errorEvent = new BulkTransferNotFoundEvt({
				bulkTransferId: bulkTransferId,
				errorDescription: errorMessage
			});

            errorEvent.fspiopOpaqueState = message.fspiopOpaqueState;
            this._outputEvents.push(errorEvent);
            return;
        }
        
        let transfers:ITransfer[] = [];
        try {
			transfers = await this._transfersRepo.getTransfersByBulkId(message.payload.bulkTransferId);
		} catch(err: unknown) {
			const error = (err as Error).message;
			const errorMessage = `Unable to get transfer record for bulkTransferId: ${message.payload.bulkTransferId} from repository`;
			this._logger.error(err, `${errorMessage}: ${error}`);
			const errorEvent = new TransferUnableToGetBulkTransferByIdEvt({
				bulkTransferId: message.payload.bulkTransferId,
				errorDescription: errorMessage
			});

            errorEvent.fspiopOpaqueState = message.fspiopOpaqueState;
            this._outputEvents.push(errorEvent);
            return;
		}
        
        for(let i=0 ; i<transfers.length ; i+=1) {
            const individualTransfer = transfers[i];

            const transferCmd:RejectTransferCmd = new RejectTransferCmd({
                transferId: individualTransfer.transferId,
                errorInformation: individualTransfer.errorInformation as IErrorInformation,
                prepare: message.fspiopOpaqueState
            });

            await this._rejectTransfer(transferCmd);
        }

        bulkTransfer.status = BulkTransferState.REJECTED;
        bulkTransfer.errorInformation = message.payload.errorInformation;
        this._bulkTransfersRepo.updateBulkTransfer(bulkTransfer);
        
		const payload: BulkTransferRejectRequestProcessedEvtPayload = {
			bulkTransferId: message.payload.bulkTransferId,
			errorInformation: message.payload.errorInformation
		};

		const event = new BulkTransferRejectRequestProcessedEvt(payload);

		event.fspiopOpaqueState = message.fspiopOpaqueState;

        this._logger.debug("_rejectBulkTransfer completed for bulkTransferId: " + message.payload.bulkTransferId);

        this._outputEvents.push(event);
        if(this._logger.isDebugEnabled()) this._logger.debug(`_rejectBulkTransfer() - completed for bulkTransferId: ${message.payload.bulkTransferId}`);
	}

    private async _queryBulkTransfer(message: QueryBulkTransferCmd):Promise<void> {
        this._logger.debug(`queryBulkTransfer() - Got transferBulkQueryRequestEvt msg for bulkTransferId: ${message.payload.bulkTransferId}`);
        
		const requesterFspId = message.fspiopOpaqueState?.requesterFspId ?? null;
		const destinationFspId = message.fspiopOpaqueState?.destinationFspId ?? null;
        const bulkTransferId = message.payload.bulkTransferId;
        
        let bulkTransfer: IBulkTransfer | null = null;
        try {
            bulkTransfer = await this._getBulkTransfer(bulkTransferId as string);
        } catch(err: unknown) {
            const error = (err as Error).message;
            const errorMessage = `Unable to get transfer record for bulk transferId: ${bulkTransferId} from repository`;
            this._logger.error(err, `${errorMessage}: ${error}`);
            const errorEvent = new TransferUnableToGetBulkTransferByIdEvt({
                bulkTransferId: bulkTransferId,
                errorDescription: errorMessage
            });

            errorEvent.fspiopOpaqueState = message.fspiopOpaqueState;
            this._outputEvents.push(errorEvent);
            return;
        }

        if(!bulkTransfer) {
			const errorMessage = `Could not find corresponding bulk transfer with id: ${bulkTransferId}`;
			this._logger.error(errorMessage);
			const errorEvent = new BulkTransferNotFoundEvt({
				bulkTransferId: bulkTransferId,
				errorDescription: errorMessage
			});

            errorEvent.fspiopOpaqueState = message.fspiopOpaqueState;
            this._outputEvents.push(errorEvent);
            return;
        }

        if(this._logger.isDebugEnabled()) this._logger.debug("_queryBulkTransfer() - before getParticipants...");

        try{
            await this._getParticipantsInfo(requesterFspId, destinationFspId, message.payload.bulkTransferId);
        } catch (err: unknown) {
            let errorEvent:DomainErrorEventMsg;

            if(err instanceof HubNotFoundError) {
                errorEvent = new TransferHubNotFoundFailedEvt({
                    transferId: bulkTransferId,
                    errorDescription: (err as Error).message
                });
            } else if (err instanceof HubParticipantIdMismatchError) {
                errorEvent = new TransferHubIdMismatchEvt({
                    transferId: bulkTransferId,
                    hubId: HUB_ID,
                    errorDescription: (err as Error).message
                });
            } else if (err instanceof HubParticipantNotApprovedError) {
                errorEvent = new TransferHubNotApprovedEvt({
                    transferId: bulkTransferId,
                    hubId: HUB_ID,
                    errorDescription: (err as Error).message
                });
            } else if (err instanceof HubParticipantNotActiveError) {
                errorEvent = new TransferHubNotActiveEvt({
                    transferId: bulkTransferId,
                    hubId: HUB_ID,
                    errorDescription: (err as Error).message
                });
            } else if (err instanceof PayerParticipantNotFoundError) {
                errorEvent = new TransferPayerNotFoundFailedEvt({
                    transferId: bulkTransferId,
                    payerFspId: requesterFspId,
                    errorDescription: (err as Error).message
                });
            } else if (err instanceof PayerParticipantIdMismatchError) {
                errorEvent = new TransferPayerIdMismatchEvt({
                    transferId: bulkTransferId,
                    payerFspId: requesterFspId,
                    errorDescription: (err as Error).message
                });
            } else if (err instanceof PayerParticipantNotApprovedError) {
                errorEvent = new TransferPayerNotApprovedEvt({
                    transferId: bulkTransferId,
                    payerFspId: destinationFspId,
                    errorDescription: (err as Error).message
                });
            } else if (err instanceof PayerParticipantNotActiveError) {
                errorEvent = new TransferPayerNotActiveEvt({
                    transferId: bulkTransferId,
                    payerFspId: requesterFspId,
                    errorDescription: (err as Error).message
                });
            } else if (err instanceof PayeeParticipantNotFoundError) {
                errorEvent = new TransferPayeeNotFoundFailedEvt({
                    transferId: bulkTransferId,
                    payeeFspId: destinationFspId,
                    errorDescription: (err as Error).message
                });
            } else if (err instanceof PayeeParticipantIdMismatchError) {
                errorEvent = new TransferPayeeIdMismatchEvt({
                    transferId: bulkTransferId,
                    payeeFspId: destinationFspId,
                    errorDescription: (err as Error).message
                });
            } else if (err instanceof PayeeParticipantNotApprovedError) {
                errorEvent = new TransferPayeeNotApprovedEvt({
                    transferId: bulkTransferId,
                    payeeFspId: destinationFspId,
                    errorDescription: (err as Error).message
                });
            } else if (err instanceof PayeeParticipantNotActiveError) {
                errorEvent = new TransferPayeeNotActiveEvt({
                    transferId: bulkTransferId,
                    payeeFspId: destinationFspId,
                    errorDescription: (err as Error).message
                });
            } else {
                this._logger.error("Unable to handle _getParticipantsInfo error - _queryBulkTransfer");
                return;
            }

            errorEvent.fspiopOpaqueState = message.fspiopOpaqueState;
            this._outputEvents.push(errorEvent);
            return;
        }

        if(this._logger.isDebugEnabled()) this._logger.debug("_queryTransfer() - after getParticipants");

		let transfers:ITransfer[] = [];

		try {
			transfers = await this._transfersRepo.getTransfersByBulkId(message.payload.bulkTransferId);
		} catch(err: unknown) {
			const error = (err as Error).message;
			const errorMessage = `Unable to get transfer record for bulkTransferId: ${message.payload.bulkTransferId} from repository`;
			this._logger.error(err, `${errorMessage}: ${error}`);
			const errorEvent = new TransferUnableToGetBulkTransferByIdEvt({
				bulkTransferId: message.payload.bulkTransferId,
				errorDescription: errorMessage
			});

            errorEvent.fspiopOpaqueState = message.fspiopOpaqueState;
            this._outputEvents.push(errorEvent);
            return;
		}

		if(transfers.length === 0) {
			const errorMessage = `BulkTransferId: ${bulkTransferId} has no associated transfers`;
			this._logger.error(errorMessage);
			const errorEvent = new TransferNotFoundEvt({
				transferId: bulkTransferId,
				errorDescription: errorMessage
			});

            errorEvent.fspiopOpaqueState = message.fspiopOpaqueState;
            this._outputEvents.push(errorEvent);
            return;
		}

		const payload: BulkTransferQueryResponseEvtPayload = {
            bulkTransferId: bulkTransfer.bulkTransferId,
            completedTimestamp: bulkTransfer.completedTimestamp,
            individualTransferResults: transfers.map((transferResult: ITransfer) => {
                return {
                    transferId: transferResult.transferId,
                    fulfilment: transferResult.fulfilment,
                    errorInformation: transferResult.errorInformation as IErrorInformation,
                    extensionList: transferResult.extensionList
                };
            }),
            bulkTransferState: bulkTransfer.status,
            extensionList: bulkTransfer.extensionList
		};

		const event = new BulkTransferQueryResponseEvt(payload);

		event.fspiopOpaqueState = message.fspiopOpaqueState;

        this._logger.debug("_queryTransfer completed for bulkTransferId: " + bulkTransferId);

        this._outputEvents.push(event);
        if(this._logger.isDebugEnabled()) this._logger.debug(`_queryBulkTransfer() - completed for bulkTransferId: ${bulkTransferId}`);
	}

    private _generateSha256(object:{[key: string]: string | number}):string {
		const hashSha256 = createHash("sha256")

		// updating data
		.update(JSON.stringify(object))

		// Encoding to be used
		.digest("base64");

		// remove trailing '=' as per specification
		return hashSha256.slice(0, -1);
	}

}
