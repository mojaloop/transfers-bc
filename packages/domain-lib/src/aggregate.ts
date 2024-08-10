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
    AnbHighLevelRequestTypes,
    IAnbCancelReservationAndCommitRequest,
    IAnbCheckLiquidAndReserveRequest,
    IAnbHighLevelRequest,
    IAnbHighLevelResponse,
    AnbAccountType, IAnbCancelReservationRequest
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
    QueryBulkTransferCmd, PrepareTransferCmdPayload
} from "./commands";
import {
    IAccountsBalancesAdapter,
    IParticipantsServiceAdapter,
    ITransfersRepository,
    ISettlementsServiceAdapter,
    ISchedulingServiceAdapter,
    IBulkTransfersRepository, IAccountsBalancesAdapterV2, ITimeoutAdapter
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
    UnableToCancelTransferError
} from "./errors";
import { TransferState, ITransfer, BulkTransferState, IBulkTransfer, ITransferParticipants, ITransferAccounts, IErrorInformation, TransferErrorCodeNames } from "@mojaloop/transfers-bc-public-types-lib";
import {IParticipant, IParticipantAccount} from "@mojaloop/participant-bc-public-types-lib";
import {ICounter, IHistogram, IMetrics, ITracing, SpanStatusCode, Tracer} from "@mojaloop/platform-shared-lib-observability-types-lib";
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
    BulkTransferQueryResponseEvtPayload, TransferDuplicateCheckFailedEvt
} from "@mojaloop/platform-shared-lib-public-messages-lib";
import { BulkTransfer, Transfer } from "./entities";
import {OpenTelemetryClient} from "@mojaloop/platform-shared-lib-observability-client-lib";
import {SpanKind, SpanOptions} from "@opentelemetry/api";

const HUB_ID = "hub"; // move to shared lib

// TODO: consider moving this to a configuration param in platform-config
const DEFAULT_DUPLICATE_CHECK_HASH_TTL_SECS = 60*5;

export class TransfersAggregate {
    private _logger: ILogger;
    private _auditClient: IAuditClient;
    private _transfersRepo: ITransfersRepository;
    private _bulkTransfersRepo: IBulkTransfersRepository;
    private _messageProducer: IMessageProducer;
    private _participantAdapter: IParticipantsServiceAdapter;
    private _accountAndBalancesAdapter: IAccountsBalancesAdapterV2;
    private _metrics: IMetrics;
    private _histo: IHistogram;
    private _commandsCounter:ICounter;
    private _settlementsAdapter: ISettlementsServiceAdapter;
    private _timeoutServiceClient: ITimeoutAdapter;

    private _transfersCache: Map<string, ITransfer> = new Map<string, ITransfer>();
    // private _transfersHashesCache: Map<string, ITransfer> = new Map<string, ITransfer>();
    private _bulkTransfersCache: Map<string, IBulkTransfer> = new Map<string, IBulkTransfer>();
    private _batchCommands: Map<string, IDomainMessage> = new Map<string, IDomainMessage>();
    private _abBatchRequests: IAnbHighLevelRequest[] = [];
    private _abCancellationBatchRequests: IAnbHighLevelRequest[] = [];
    private _abBatchResponses: IAnbHighLevelResponse[] = [];
    private _outputEvents: DomainEventMsg[] = [];

    private _timeoutsToSet: {transferId:string, timeoutTimestamp:number}[] = [];
    private _transferIdsToClearTimeout: string[] = []; // transferIds

    private _tracingClient: ITracing;
    private _tracer:Tracer;

    constructor(
        logger: ILogger,
        transfersRepo: ITransfersRepository,
        bulkTransfersRepo: IBulkTransfersRepository,
        participantsServiceAdapter: IParticipantsServiceAdapter,
        messageProducer: IMessageProducer,
        accountAndBalancesAdapter: IAccountsBalancesAdapterV2,
        metrics: IMetrics,
        settlementsAdapter: ISettlementsServiceAdapter,
        timeoutServiceClient: ITimeoutAdapter,
        tracingClient: ITracing
    ) {
        this._logger = logger.createChild(this.constructor.name);
        this._transfersRepo = transfersRepo;
        this._bulkTransfersRepo = bulkTransfersRepo;
        this._participantAdapter = participantsServiceAdapter;
        this._messageProducer = messageProducer;
        this._accountAndBalancesAdapter = accountAndBalancesAdapter;
        this._metrics = metrics;
        this._settlementsAdapter = settlementsAdapter;
        this._timeoutServiceClient = timeoutServiceClient;
        this._tracingClient = tracingClient;

        this._histo = this._metrics.getHistogram("TransfersAggregate", "TransfersAggregate calls", ["callName", "success"]);
        this._commandsCounter = this._metrics.getCounter("TransfersAggregate_CommandsProcessed", "Commands processed by the Transfers Aggregate", ["commandName"]);
        // this._aandbHisto = this._metrics.getHistogram("TransfersAggregate_aandbAdapter", "A&B adapter timings on the Transfers Aggregate", ["callName", "success"]);
        // this._participantsHisto = this._metrics.getHistogram("TransfersAggregate_participantsAdapter", "Participants adapter timings on the Transfers Aggregate", ["callName", "success"]);

        this._tracer = this._tracingClient.trace.getTracer(this.constructor.name);
    }

    async init(): Promise<void> {
        // TODO
        //await this._messageProducer.connect();
    }

    async processCommandBatch(cmdMessages: CommandMsg[]): Promise<void>{
        this._abBatchRequests = [];
        this._abCancellationBatchRequests = [];
        this._abBatchResponses = [];
        this._outputEvents = [];
        this._batchCommands.clear();
        this._timeoutsToSet = [];
        this._transferIdsToClearTimeout = [];

        // NOTE: do not change this code without comprehending thoroughly first

        /*
        * 1. Execute all start phase, with the _processCommand();
        * 2. Set any expiration timeouts from the prepares (expiration is optional)
        * 3. Execute any A&B requests
        * 4. Process any A&B responses (aka continue), with the _processAccountsAndBalancesResponse();
        * 5. If any A&B cancellation requests where queued by #3, process them
        * */

        try {
            /// ------------------------------------------------------------------------------------------------
            // 1. execute starts
            const execStarts_timerEndFn = this._histo.startTimer({ callName: "executeStarts"});
            for (const cmd of cmdMessages) {
                if(cmd.msgType !== MessageTypes.COMMAND) continue;

                const context =  OpenTelemetryClient.getInstance().propagationExtract(cmd.tracingInfo);
                const spanName = `processCommandStart ${cmd.msgName}`;
                const spanOptions: SpanOptions = {
                    kind: SpanKind.CONSUMER,
                    attributes: {
                        "msgName": cmd.msgName,
                        "entityId": cmd.payload.transferId,
                        "transferId": cmd.payload.transferId,
                        "batchSize": cmdMessages.length
                    }
                };

                await this._tracer.startActiveSpan(spanName, spanOptions, context, async (span) => {
                    await this.processCommand(cmd);
                    this._commandsCounter.inc({commandName: cmd.msgName}, 1); // even in bulk, it is only one command
                    span.end();
                });
            }
            execStarts_timerEndFn({success:"true"});

            /// ------------------------------------------------------------------------------------------------
            // 2.1 Set any expiration timeouts from the prepares (expiration is optional)
            await this._stepSetTimeouts();
            /// ------------------------------------------------------------------------------------------------
            // 2.2 Clear any expiration timeouts from the fulfils (expiration is optional)
            await this._stepClearTimeouts();

            /// ------------------------------------------------------------------------------------------------
            // 3. Execute any A&B requests
            if(this._abBatchRequests.length > 0) {
                const execAB_timerEndFn1 = this._histo.startTimer({callName: "executeAandbProcessHighLevelBatch"});
                if (this._logger.isDebugEnabled()) this._logger.debug("processCommandBatch() - before accountsAndBalancesAdapter.processHighLevelBatch()");

                this._abBatchResponses = await this._accountAndBalancesAdapter.processHighLevelBatch(this._abBatchRequests);

                if (this._logger.isDebugEnabled()) this._logger.debug("processCommandBatch() - after accountsAndBalancesAdapter.processHighLevelBatch()");
                execAB_timerEndFn1({success: "true"});

                /// ------------------------------------------------------------------------------------------------
                // 4. Process any A&B responses (aka continue)
                // should peek first and check count to establish no errors - or any other way to determine error
                const executeContinues_timerEndFn = this._histo.startTimer({callName: "executeContinues"});
                for (const abResponse of this._abBatchResponses) {
                    await this._processAccountsAndBalancesResponse(abResponse);
                }
                executeContinues_timerEndFn({success: "true"});

                /// ------------------------------------------------------------------------------------------------
                // 4.1 Clear any expiration timeouts from the a&b responses processing
                await this._stepClearTimeouts();

                /// ------------------------------------------------------------------------------------------------
                // 5. if the continues queued any cancellations, send then now
                if (this._abCancellationBatchRequests.length) {
                    // send cancellations to A&B
                    const execAB_timerEndFn2 = this._histo.startTimer({callName: "executeAandbProcessHighLevelCancellationBatch"});
                    if (this._logger.isDebugEnabled()) this._logger.debug("processCommandBatch() - before accountsAndBalancesAdapter.processHighLevelCancellationBatch()");

                    this._abBatchResponses = await this._accountAndBalancesAdapter.processHighLevelBatch(this._abCancellationBatchRequests);

                    if (this._logger.isDebugEnabled()) this._logger.debug("processCommandBatch() - after accountsAndBalancesAdapter.processHighLevelCancellationBatch()");
                    execAB_timerEndFn2({success: "true"});
                }

            }

            // flush in mem repositories only when no errors happened
            await this._flush();
        } catch (err: any) {
            this._logger.error(err);

            throw err;
        } finally {
            // always send resulting/output events if any, they could be error events
            if(this._outputEvents.length>0) {
                const publish_timerEndFn = this._histo.startTimer({callName: "publishOutputEvents"});
                await this._messageProducer.send(this._outputEvents);
                publish_timerEndFn({success: "true"});
            }
        }
    }

    private async _stepSetTimeouts(){
        if(this._timeoutsToSet.length > 0) {
            if (this._logger.isDebugEnabled()) this._logger.debug(`processCommandBatch() - before _timeoutServiceClient.setTimeouts() - have ${this._timeoutsToSet.length} timeouts to set`);
            const execSetTimeouts_timerEndFn = this._histo.startTimer({callName: "setTimeouts"});
            await this._timeoutServiceClient.setTimeouts(this._timeoutsToSet);
            execSetTimeouts_timerEndFn({success: "true"});
            if (this._logger.isDebugEnabled()) this._logger.debug("processCommandBatch() - after _timeoutServiceClient.setTimeouts()");

            this._timeoutsToSet = []; // reset
        }
    }

    private async _stepClearTimeouts(){
        if(this._transferIdsToClearTimeout.length > 0) {
            if (this._logger.isDebugEnabled()) this._logger.debug(`processCommandBatch() - before _timeoutServiceClient.clearTimeouts() - have ${this._transferIdsToClearTimeout.length} timeouts to clear`);
            const execClearTimeouts_timerEndFn = this._histo.startTimer({callName: "clearTimeouts"});
            await this._timeoutServiceClient.clearTimeouts(this._transferIdsToClearTimeout);
            execClearTimeouts_timerEndFn({success: "true"});
            if (this._logger.isDebugEnabled()) this._logger.debug("processCommandBatch() - after _timeoutServiceClient.clearTimeouts()");

            this._transferIdsToClearTimeout = []; // reset
        }
    }

    async processCommand(cmd: CommandMsg): Promise<void> {
        this._histo.observe({callName:"msgDelay"}, (Date.now() - cmd.msgTimestamp)/1000);

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

        const context = this._tracingClient.propagationExtract(cmd.tracingInfo);
        const parentSpan = this._tracer.startSpan("processCommand", {}, context);
        parentSpan.setAttributes({
            "msgName": cmd.msgName,
            "entityId": cmd.payload.transferId,
            "transferId": cmd.payload.transferId
        });

        if (cmd.msgName === PrepareTransferCmd.name) {
            await this._prepareTransferStart(cmd as PrepareTransferCmd);
        } else if (cmd.msgName === CommitTransferFulfilCmd.name) {
            await this._fulfilTransferStart(cmd as CommitTransferFulfilCmd);
        } else if (cmd.msgName === RejectTransferCmd.name) {
            await this._rejectTransfer(cmd as RejectTransferCmd);
        } else if (cmd.msgName === QueryTransferCmd.name) {
            await this._queryTransfer(cmd as QueryTransferCmd);
        } else if (cmd.msgName === TimeoutTransferCmd.name) {
            await this._timeoutTransfer(cmd as TimeoutTransferCmd);
        } else if (cmd.msgName === PrepareBulkTransferCmd.name) {
            await this._prepareBulkTransferStart(cmd as PrepareBulkTransferCmd);
        } else if (cmd.msgName === CommitBulkTransferFulfilCmd.name) {
            await this._fulfilBulkTransferStart(cmd as CommitBulkTransferFulfilCmd);
        } else if (cmd.msgName === RejectBulkTransferCmd.name) {
            await this._rejectBulkTransfer(cmd as RejectBulkTransferCmd);
        } else if (cmd.msgName === QueryBulkTransferCmd.name) {
            await this._queryBulkTransfer(cmd as QueryBulkTransferCmd);
        } else {
            parentSpan.setStatus({ code: SpanStatusCode.ERROR });
            const requesterFspId = cmd.fspiopOpaqueState?.requesterFspId;
            const transferId = cmd.payload?.transferId;
			const errorMessage = `Command type is unknown: ${cmd.msgName}`;
            this._logger.error(errorMessage);

            const errorCode = TransferErrorCodeNames.COMMAND_TYPE_UNKNOWN;
            const errorEvent = new TransferInvalidMessageTypeEvt({
                transferId: transferId,
                payerFspId: requesterFspId,
                errorCode: errorCode
            });
            errorEvent.fspiopOpaqueState = cmd.fspiopOpaqueState;
            this._outputEvents.push(errorEvent);
        }

        parentSpan.end();
    }

    private async _processAccountsAndBalancesResponse(abResponse: IAnbHighLevelResponse): Promise<void> {
        const request = this._abBatchRequests.find(value => value.requestId === abResponse.requestId);
        if (!request) {
            const err = new CheckLiquidityAndReserveFailedError("Could not find corresponding request for checkLiquidAndReserve IAnbHighLevelResponse");
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
			this._logger.error(err,`Unable to get transfer record for transferId: ${request.transferId} from repository - error: ${(err as Error).message}`);
            // note: null transfer is this is being caught/handled in the continue methods below
		}

        if (abResponse.requestType === AnbHighLevelRequestTypes.checkLiquidAndReserve) {
            if(originalCmdMsg.payload.bulkTransferId) {
                return this._prepareBulkTransferContinue(abResponse, request, originalCmdMsg, transfer as ITransfer);
            } else {
                return this._prepareTransferContinue(abResponse, request, originalCmdMsg, transfer as ITransfer);
            }
        } else if (abResponse.requestType === AnbHighLevelRequestTypes.cancelReservationAndCommit) {
            if(originalCmdMsg.payload.bulkTransferId) {
                return this._fulfilBulkTransferContinue(abResponse, request, originalCmdMsg, transfer as ITransfer);
            } else {
                return this._fulfilTTransferContinue(abResponse, request, originalCmdMsg, transfer);
            }
        } else if (abResponse.requestType === AnbHighLevelRequestTypes.cancelReservation) {
            throw new Error("not implemented");
        } else {
            // throw unhandled cmd
        }
    }

    // TODO this should return an error event msg
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

    private _cacheTransfer(transfer:ITransfer): void {
        this._transfersCache.set(transfer.transferId, transfer);
        // this._transfersHashesCache.set(transfer.hash, transfer);
    }

    private async  _getTransfer(id:string):Promise<ITransfer | null>{
        const timerEndFn = this._histo.startTimer({ callName: "_getTransfer()"});

        let transfer: ITransfer | null = this._transfersCache.get(id) || null;
        if(transfer){
            timerEndFn({success:"true"});
            return transfer;
        }

        transfer = await this._transfersRepo.getTransferById(id);
        if(transfer){
            this._cacheTransfer(transfer);
            timerEndFn({success:"true"});
            return transfer;
        }

        timerEndFn({success:"true"});
        return null;
    }

/*    private async _getTransferByIdOrHash(id:string, hash:string):Promise<ITransfer | null>{
        const timerEndFn = this._histo.startTimer({ callName: "_getTransferByIdOrHash()"});

        let transfer: ITransfer | null = this._transfersCache.get(id) || null;
        if(transfer){
            timerEndFn({success:"true"});
            return transfer;
        }

        transfer = this._transfersHashesCache.get(hash) || null;
        if(transfer){
            timerEndFn({success:"true"});
            return transfer;
        }

        transfer = await this._transfersRepo.getTransferByIdOrHash(id, hash);
        if(transfer){
            this._cacheTransfer(transfer);
            timerEndFn({success:"true"});
            return transfer;
        }

        timerEndFn({success:"true"});
        return null;
    }*/

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
            await this._transfersRepo.storeTransfers([...this._transfersCache.values()]);
            this._transfersCache.clear();
        }

        timerEndFn({success: "true"});
    }

    private _propagateState(sourceMessage:IDomainMessage, destinationMessage:IDomainMessage):void {
        // fspiop opaque state
        destinationMessage.fspiopOpaqueState = sourceMessage.fspiopOpaqueState;

        // add tracing to outputEvent
        destinationMessage.tracingInfo = {};
        OpenTelemetryClient.getInstance().propagationInject(destinationMessage.tracingInfo);
    }

    private async _timeoutTransfer(message: TimeoutTransferCmd): Promise<void> {
        if(this._logger.isDebugEnabled()) this._logger.debug(`_timeoutTransfer() - Got TimeoutTransferCmd msg for transferId: ${message.payload.transferId}`);

		let transfer:ITransfer | null;
		try {
			transfer = await this._getTransfer(message.payload.transferId);
		} catch(err: unknown) {
			const error = (err as Error).message;
			const errorMessage = `Unable to get transfer record for transferId: ${message.payload.transferId} from repository`;
			this._logger.error(err, `${errorMessage}: ${error}`);

            const errorCode = TransferErrorCodeNames.UNABLE_TO_GET_TRANSFER;
			const errorEvent = new TransferUnableToGetTransferByIdEvt({
				transferId: message.payload.transferId,
				errorCode: errorCode
			});
            this._propagateState(message, errorEvent);
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

            if(!transfer.expirationTimestamp || (transfer.expirationTimestamp && Date.now() < transfer.expirationTimestamp)){
                this._logger.warn(`Got timeout command for message without expiration or not yet expired - transfer if: ${transfer.transferId}`);
                return;
            }

			switch(transfer.transferState) {
				case TransferState.RECEIVED: {
                    const errorCode = TransferErrorCodeNames.TRANSFER_EXPIRED;
                    try {
                        transfer.updatedAt = Date.now();
                        transfer.transferState = TransferState.ABORTED;
                        transfer.errorCode = errorCode;
                        // transfer.errorCode = TransferErrorCodes.TRANSFER_EXPIRED;
                        // set transfer in cache
                        this._cacheTransfer(transfer);
                        await this._transfersRepo.updateTransfer(transfer);
                    } catch(err: unknown) {
                        const error = (err as Error).message;
                        const errorMessage = `Error deleting reminder for transferId: ${transfer.transferId}.`;
                        this._logger.error(err, `${errorMessage}: ${error}`);

                        const errorCode = TransferErrorCodeNames.UNABLE_TO_UPDATE_TRANSFER;
                        const errorEvent = new TransferUnableToUpdateEvt({
                            transferId: transfer.transferId,
                            payerFspId: transfer.payerFspId,
                            errorCode: errorCode
                        });

                        this._propagateState(message, errorEvent);
                        this._outputEvents.push(errorEvent);
                        return;
                    }

                    // Send a response event to the payer
                    this._logger.info(`Timedout received transfer request for transferId: ${transfer.transferId}`);

                    const payload: TransferPrepareRequestTimedoutEvtPayload = {
                        transferId: transfer.transferId,
                        payerFspId: transfer.payerFspId,
                        errorCode: errorCode
                    };

                    const event = new TransferPrepareRequestTimedoutEvt(payload);

                    this._propagateState(message, event);
                    this._outputEvents.push(event);

					// Ignore the request
					return;
				}
				case TransferState.RESERVED: {
                    try {
                        const errorCode = TransferErrorCodeNames.TRANSFER_EXPIRED;
                        await this._cancelTransfer(message.payload.transferId, errorCode);
                    } catch(err: unknown) {
                        const error = (err as Error).message;
                        const errorMessage = `Unable to cancel reservation with transferId: ${message.payload.transferId}`;
                        this._logger.error(err, `${errorMessage}: ${error}`);

                        const errorCode = TransferErrorCodeNames.UNABLE_TO_CANCEL_TRANSFER_RESERVATION;
                        const errorEvent = new TransferCancelReservationFailedEvt({
                            transferId: message.payload.transferId,
                            errorCode: errorCode
                        });

                        this._propagateState(message, errorEvent);
                        this._outputEvents.push(errorEvent);
                        return;
                    }

                    try {
                        transfer.updatedAt = Date.now();
                        transfer.transferState = TransferState.ABORTED;
                        // set transfer in cache
                        this._cacheTransfer(transfer);
                        await this._transfersRepo.updateTransfer(transfer);
                    } catch(err: unknown) {
                        const error = (err as Error).message;
                        const errorMessage = `Error deleting reminder for transferId: ${transfer.transferId}.`;
                        this._logger.error(err, `${errorMessage}: ${error}`);

                        const errorCode = TransferErrorCodeNames.UNABLE_TO_UPDATE_TRANSFER;
                        const errorEvent = new TransferUnableToUpdateEvt({
                            transferId: transfer.transferId,
                            payerFspId: transfer.payerFspId,
                            errorCode: errorCode
                        });

                        this._propagateState(message, errorEvent);
                        this._outputEvents.push(errorEvent);
                        return;
                    }

                    // Send a response event to the payer and payee
                    this._logger.info(`Timedout TRANSFER_EXPIRED reserved transfer request for transferId: ${transfer.transferId}`);

                    const errorCode = TransferErrorCodeNames.TRANSFER_EXPIRED;
                    const payload: TransferFulfilCommittedRequestedTimedoutEvtPayload = {
                        transferId: transfer.transferId,
                        payerFspId: transfer.payerFspId,
                        payeeFspId: transfer.payeeFspId,
                        errorCode: errorCode
                    };

                    const event = new TransferFulfilCommittedRequestedTimedoutEvt(payload);

                    this._propagateState(message, event);
                    this._outputEvents.push(event);

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
        const timerEndFn = this._histo.startTimer({ callName: "prepareTransferStart()"});
        if(this._logger.isDebugEnabled()) this._logger.debug(`prepareTransferStart() - Got transferPreparedReceivedEvt msg for transferId: ${message.payload.transferId}`);

        const now = Date.now();
        const hash = this._generateSha256(message.payload);

        // Duplicate Transfer POST use cases
        let getTransferRep:ITransfer | null;
		try {
			getTransferRep = await this._getTransfer(message.payload.transferId);
            // getTransferRep = await this._getTransferByIdOrHash(message.payload.transferId, hash);
		} catch(err: unknown) {
			const error = (err as Error).message;
			const errorMessage = `Unable to get transfer record for transferId: ${message.payload.transferId} from repository`;
			this._logger.error(err, `${errorMessage}: ${error}`);
            const errorCode = TransferErrorCodeNames.UNABLE_TO_GET_TRANSFER;
            const errorEvent = new TransferUnableToGetTransferByIdEvt({
				transferId: message.payload.transferId,
				errorCode: errorCode
			});

            this._propagateState(message, errorEvent);
            this._outputEvents.push(errorEvent);
            timerEndFn({success:"false"});
            return;
		}

		if(getTransferRep) {
            // cases where the id is the same, but the hash (contents) is not
			if(getTransferRep.hash !== hash) {
				this._logger.warn(`Transfer hash for ${message.payload.transferId} doesn't match`);
				const errorEvent = new TransferDuplicateCheckFailedEvt({
					transferId: message.payload.transferId,
					payerFspId: message.payload.payerFsp,
                    errorCode: TransferErrorCodeNames.DUPLICATE_TRANSFER_ID_DETECTED
				});
                this._propagateState(message, errorEvent);
                this._outputEvents.push(errorEvent);
                timerEndFn({success:"false"});
                return;
			}

            if (getTransferRep.transferState === TransferState.RECEIVED || getTransferRep.transferState === TransferState.RESERVED) {
                // Ignore the request
                this._logger.isDebugEnabled() && this._logger.debug(`Transfer ${getTransferRep.transferId} already exists win state RECEIVED or RESERVED - ignoring`);
                timerEndFn({success: "true"});
                return;
            } else if (getTransferRep.transferState === TransferState.COMMITTED || getTransferRep.transferState === TransferState.ABORTED) {
                // Send a response event to the payer
                this._logger.isDebugEnabled() && this._logger.debug(`Transfer ${getTransferRep.transferId} already exists win state COMMITTED or ABORTED - responded with a TransferQueryResponseEvt`);
                const payload: TransferQueryResponseEvtPayload = {
                    transferId: getTransferRep.transferId,
                    transferState: getTransferRep.transferState,
                    completedTimestamp: getTransferRep.completedTimestamp,
                    fulfilment: getTransferRep.fulfilment,
                    extensionList: getTransferRep.extensionList
                };

                const event = new TransferQueryResponseEvt(payload);

                this._propagateState(message, event);
                this._outputEvents.push(event);
                timerEndFn({success: "true"});
                return;
            }else{
                // unexpected state in found transfer
                this._logger.warn(`Duplicate transfer with id: ${message.payload.transferId} found in an unexpected state: ${getTransferRep.transferState}`);
                const errorEvent = new TransferDuplicateCheckFailedEvt({
                    transferId: message.payload.transferId,
                    payerFspId: message.payload.payerFsp,
                    errorCode: TransferErrorCodeNames.DUPLICATE_TRANSFER_ID_DETECTED_IN_UNEXPECTED_STATE
                });
                this._propagateState(message, errorEvent);
                this._outputEvents.push(errorEvent);
                timerEndFn({success:"false"});
                return;
            }
        }


		let settlementModel: string;
        const timerEndFn_getSettlementModelId = this._histo.startTimer({ callName: "getSettlementModelId()"});
		try {
			settlementModel = await this._settlementsAdapter.getSettlementModelId(
                message.payload.amount,
                message.payload.currencyCode,
                message.payload.currencyCode,
                message.payload.extensionList?.extension ? message.payload.extensionList.extension : []
            );
            if(!settlementModel) throw new Error("Invalid settlementModelId from settlementsAdapter.getSettlementModelId()");
            timerEndFn_getSettlementModelId({success:"true"});
		} catch(err: unknown) {
            timerEndFn_getSettlementModelId({success:"false"});
            const error = (err as Error).message;
			const errorMessage = `Unable to get settlementModel for transferId: ${message.payload.transferId}`;
			this._logger.error(err, `${errorMessage}: ${error}`);
            const errorCode = TransferErrorCodeNames.UNABLE_TO_GET_TRANSFER_SETTLEMENT_MODEL;
            const errorEvent = new TransferUnableToGetSettlementModelEvt({
				transferId: message.payload.transferId,
				amount: message.payload.amount,
				payerCurrency: message.payload.currencyCode,
				payeeCurrency: message.payload.currencyCode,
				extensionList: message.payload.extensionList ? (message.payload.extensionList).toString() : null,
				errorCode: errorCode
			});

            this._propagateState(message, errorEvent);
            this._outputEvents.push(errorEvent);

            timerEndFn({success:"false"});
            return;
		}



        const transfer: Transfer = {
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
            payerIdType: message.payload.payerIdType,
            payeeIdType: message.payload.payeeIdType,
            transferType: message.payload.transferType,
            errorCode: null
        };

        if(this._logger.isDebugEnabled()) this._logger.debug("prepareTransferStart() - before getParticipants...");

        let participants:ITransferParticipants;
        try{
            participants = await this._getParticipantsInfo(transfer.payerFspId, transfer.payeeFspId, transfer.transferId);
        } catch (err: unknown) {
            let errorEvent:DomainErrorEventMsg;

            if(err instanceof HubNotFoundError) {
                const errorCode = TransferErrorCodeNames.HUB_NOT_FOUND;
                errorEvent = new TransferHubNotFoundFailedEvt({
                    transferId: transfer.transferId,
                    errorCode: errorCode
                });
                transfer.errorCode = errorCode;
            } else if (err instanceof HubParticipantIdMismatchError) {
                const errorCode = TransferErrorCodeNames.HUB_PARTICIPANT_ID_MISMATCH;
                errorEvent = new TransferHubIdMismatchEvt({
                    transferId: transfer.transferId,
                    hubId: HUB_ID,
                    errorCode: errorCode
                });
                transfer.errorCode = errorCode;
            } else if (err instanceof HubParticipantNotApprovedError) {
                const errorCode = TransferErrorCodeNames.HUB_PARTICIPANT_NOT_APPROVED;
                errorEvent = new TransferHubNotApprovedEvt({
                    transferId: transfer.transferId,
                    hubId: HUB_ID,
                    errorCode: errorCode
                });
                transfer.errorCode = errorCode;
            } else if (err instanceof HubParticipantNotActiveError) {
                const errorCode = TransferErrorCodeNames.HUB_PARTICIPANT_NOT_ACTIVE;
                errorEvent = new TransferHubNotActiveEvt({
                    transferId: transfer.transferId,
                    hubId: HUB_ID,
                    errorCode: errorCode
                });
                transfer.errorCode = errorCode;
            } else if (err instanceof PayerParticipantNotFoundError) {
                const errorCode = TransferErrorCodeNames.PAYER_PARTICIPANT_NOT_FOUND;
                errorEvent = new TransferPayerNotFoundFailedEvt({
                    transferId: transfer.transferId,
                    payerFspId: transfer.payerFspId,
                    errorCode: errorCode
                });
                transfer.errorCode = errorCode;
            } else if (err instanceof PayerParticipantIdMismatchError) {
                const errorCode = TransferErrorCodeNames.PAYER_PARTICIPANT_ID_MISMATCH;
                errorEvent = new TransferPayerIdMismatchEvt({
                    transferId: transfer.transferId,
                    payerFspId: transfer.payerFspId,
                    errorCode: errorCode
                });
                transfer.errorCode = errorCode;
            } else if (err instanceof PayerParticipantNotApprovedError) {
                const errorCode = TransferErrorCodeNames.PAYER_PARTICIPANT_NOT_APPROVED;
                errorEvent = new TransferPayerNotApprovedEvt({
                    transferId: transfer.transferId,
                    payerFspId: transfer.payerFspId,
                    errorCode: errorCode
                });
                transfer.errorCode = errorCode;
            } else if (err instanceof PayerParticipantNotActiveError) {
                const errorCode = TransferErrorCodeNames.PAYER_PARTICIPANT_NOT_ACTIVE;
                errorEvent = new TransferPayerNotActiveEvt({
                    transferId: transfer.transferId,
                    payerFspId: transfer.payerFspId,
                    errorCode: errorCode
                });
                transfer.errorCode = errorCode;
            } else if (err instanceof PayeeParticipantNotFoundError) {
                const errorCode = TransferErrorCodeNames.PAYEE_PARTICIPANT_NOT_FOUND;
                errorEvent = new TransferPayeeNotFoundFailedEvt({
                    transferId: transfer.transferId,
                    payeeFspId: transfer.payeeFspId,
                    errorCode: errorCode
                });
                transfer.errorCode = errorCode;
            } else if (err instanceof PayeeParticipantIdMismatchError) {
                const errorCode = TransferErrorCodeNames.PAYEE_PARTICIPANT_ID_MISMATCH;
                errorEvent = new TransferPayeeIdMismatchEvt({
                    transferId: transfer.transferId,
                    payeeFspId: transfer.payeeFspId,
                    errorCode: errorCode
                });
                transfer.errorCode = errorCode;
            } else if (err instanceof PayeeParticipantNotApprovedError) {
                const errorCode = TransferErrorCodeNames.PAYEE_PARTICIPANT_NOT_APPROVED;
                errorEvent = new TransferPayeeNotApprovedEvt({
                    transferId: transfer.transferId,
                    payeeFspId: transfer.payeeFspId,
                    errorCode: errorCode
                });
                transfer.errorCode = errorCode;
            } else if (err instanceof PayeeParticipantNotActiveError) {
                const errorCode = TransferErrorCodeNames.PAYEE_PARTICIPANT_NOT_ACTIVE;
                errorEvent = new TransferPayeeNotActiveEvt({
                    transferId: transfer.transferId,
                    payeeFspId: transfer.payeeFspId,
                    errorCode: errorCode
                });
                transfer.errorCode = errorCode;
            } else {
                this._logger.error("Unable to handle _getParticipantsInfo error - _fulfilTransferStart");
                return;
            }

            this._cacheTransfer(transfer);

            this._propagateState(message, errorEvent);
            this._outputEvents.push(errorEvent);
            timerEndFn({success:"false"});
            return;
        }

        let participantAccounts:ITransferAccounts;
        try{
            participantAccounts = this._getTransferParticipantsAccounts(participants, transfer);
        } catch (err: unknown) {
            let errorEvent:DomainErrorEventMsg;

            if(err instanceof HubAccountNotFoundError) {
                const errorCode = TransferErrorCodeNames.HUB_NOT_FOUND;
                errorEvent = new TransferHubAccountNotFoundFailedEvt({
                    transferId: transfer.transferId,
                    errorCode: errorCode
                });
                transfer.errorCode = errorCode;
            } else if (err instanceof PayerPositionAccountNotFoundError) {
                const errorCode = TransferErrorCodeNames.PAYER_POSITION_ACCOUNT_NOT_FOUND;
                errorEvent = new TransferPayerPositionAccountNotFoundFailedEvt({
                    transferId: transfer.transferId,
                    payerFspId: transfer.payerFspId,
                    errorCode: errorCode
                });
                transfer.errorCode = errorCode;
            } else if (err instanceof PayerLiquidityAccountNotFoundError) {
                const errorCode = TransferErrorCodeNames.PAYER_LIQUIDITY_ACCOUNT_NOT_FOUND;
                errorEvent = new TransferPayerLiquidityAccountNotFoundFailedEvt({
                    transferId: transfer.transferId,
                    payerFspId: transfer.payerFspId,
                    errorCode: errorCode
                });
                transfer.errorCode = errorCode;
            } else if (err instanceof PayeePositionAccountNotFoundError) {
                const errorCode = TransferErrorCodeNames.PAYEE_POSITION_ACCOUNT_NOT_FOUND;
                errorEvent = new TransferPayeePositionAccountNotFoundFailedEvt({
                    transferId: transfer.transferId,
                    payeeFspId: transfer.payeeFspId,
                    errorCode: errorCode
                });
                transfer.errorCode = errorCode;
            } else if (err instanceof PayeeLiquidityAccountNotFoundError) {
                const errorCode = TransferErrorCodeNames.PAYEE_LIQUIDITY_ACCOUNT_NOT_FOUND;
                errorEvent = new TransferPayeeLiquidityAccountNotFoundFailedEvt({
                    transferId: transfer.transferId,
                    payeeFspId: transfer.payeeFspId,
                    errorCode: errorCode
                });
                transfer.errorCode = errorCode;
            } else {
                this._logger.error("Unable to handle _getTransferParticipantsAccounts error - _fulfilTransferStart");
                timerEndFn({success:"false"});
                return;
            }

            this._propagateState(message, errorEvent);
            this._outputEvents.push(errorEvent);
            timerEndFn({success:"false"});
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
        this._cacheTransfer(transfer);

        // expiration is optional - only add this when the transfer prepare is going to fail (like above)
        if(transfer.expirationTimestamp != null) {
            this._timeoutsToSet.push({
                transferId: transfer.transferId,
                timeoutTimestamp: transfer.expirationTimestamp
            });
        }

       // TODO add tracing to AccountsBalancesHighLevelRequest

        const req:IAnbCheckLiquidAndReserveRequest = {
            requestType: AnbHighLevelRequestTypes.checkLiquidAndReserve,
            requestId: randomUUID(),
            payerPositionAccountId: participantAccounts.payerPosAccount.id,
            payerLiquidityAccountId: participantAccounts.payerLiqAccount.id,
            hubJokeAccountId: participantAccounts.hubAccount.id,
            transferId: transfer.transferId,
            transferAmount: transfer.amount,
            currencyCode: transfer.currencyCode,
            payerNetDebitCap: payerNdc
        };

        this._abBatchRequests.push(req);

        if(this._logger.isDebugEnabled()) this._logger.debug(`prepareTransferStart() - complete for msg: ${message.payload.transferId}`);
        timerEndFn({success:"true"});
    }

    private async _prepareTransferContinue(
        abResponse: IAnbHighLevelResponse,
        request: IAnbHighLevelRequest,
        originalCmdMsg:IDomainMessage,
        transfer: ITransfer | null
    ): Promise<void> {
        const timerEndFn = this._histo.startTimer({ callName: "prepareTransferContinue()"});
        const preparedAtTime = Date.now();

        if (!transfer) {
			const errorMessage = `Could not find corresponding transfer with id: ${request.transferId} for checkLiquidAndReserve IAnbHighLevelResponse`;
			this._logger.error(errorMessage);
            const errorCode = TransferErrorCodeNames.TRANSFER_NOT_FOUND;
            let errorEvent = new TransferNotFoundEvt({
				transferId: originalCmdMsg.payload.transferId,
				errorCode: errorCode
			});

            try {
                // FIXME _cancelTransfer will fail if not transfer is found, which at this point is a guarantee
                const errorCode = TransferErrorCodeNames.TRANSFER_NOT_FOUND;
                await this._cancelTransfer(originalCmdMsg.payload.transferId, errorCode);
            } catch(err: unknown) {
                const error = (err as Error).message;
                const errorMessage = `Unable to cancel reservation with transferId: ${originalCmdMsg.payload.transferId}`;
                this._logger.error(err, `${errorMessage}: ${error}`);
                const errorCode = TransferErrorCodeNames.UNABLE_TO_CANCEL_TRANSFER_RESERVATION;
                errorEvent = new TransferCancelReservationFailedEvt({
                    transferId: originalCmdMsg.payload.transferId,
                    errorCode: errorCode
                });
            }

            // remove timeout
            // as we couldn't fund the transfer we don't know if this transfer had a timeout, but remove just in case
            this._transferIdsToClearTimeout.push(originalCmdMsg.payload.transferId);

            this._propagateState(originalCmdMsg, errorEvent);
            this._outputEvents.push(errorEvent);
            timerEndFn({success:"false"});
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
            const errorCode = TransferErrorCodeNames.TRANSFER_LIQUIDITY_CHECK_FAILED;
            const errorEvent = new TransferPrepareLiquidityCheckFailedEvt({
				transferId: transfer.transferId,
				payerFspId: transfer.payerFspId,
				amount: transfer.amount,
				currency: transfer.currencyCode,
				errorCode: errorCode // TODO: still replace this when we have different responses from ab bc
			});

            // update transfer and cache it
            // according to https://docs.mojaloop.io/api/fspiop/logical-data-model.html#transferstate-enum state is aborted
            transfer.updatedAt = Date.now();
            transfer.transferState = TransferState.ABORTED;
            transfer.errorCode = errorCode;
            this._cacheTransfer(transfer);

            // remove timeout
            if(transfer.expirationTimestamp) this._transferIdsToClearTimeout.push(request.transferId);

            this._propagateState(originalCmdMsg, errorEvent);
			this._outputEvents.push(errorEvent);
            timerEndFn({success:"false"});
            return;
        }

        // TODO validate type
        const message = originalCmdMsg;// as PrepareTransferCmd;

        // update transfer and cache it
        transfer.updatedAt = Date.now();
        transfer.transferState = TransferState.RESERVED;
        this._cacheTransfer( transfer);

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

            this._propagateState(message, event);
            this._outputEvents.push(event);

            if(this._logger.isDebugEnabled()) this._logger.debug(`prepareTransferContinue() - completed for transferId: ${transfer.transferId}`);
        }
        timerEndFn({success:"true"});
    }

    private async _fulfilTransferStart(message: CommitTransferFulfilCmd): Promise<void> {
        const timerEndFn = this._histo.startTimer({ callName: "fulfilTransferStart()"});
        if(this._logger.isDebugEnabled()) this._logger.debug(`fulfilTransfer() - Got transferFulfilCommittedEvt msg for transferId: ${message.payload.transferId}`);

        let participantTransferAccounts: ITransferAccounts | null = null;

        let transfer: ITransfer | null = null;
        try {
			transfer = await this._getTransfer(message.payload.transferId);
		} catch(err: unknown) {
			const error = (err as Error).message;
			const errorMessage = `Unable to get transfer record for transferId: ${message.payload.transferId} from repository`;
			this._logger.error(err, `${errorMessage}: ${error}`);
            const errorCode = TransferErrorCodeNames.UNABLE_TO_GET_TRANSFER;
            const errorEvent = new TransferUnableToGetTransferByIdEvt({
                transferId: message.payload.transferId,
				errorCode: errorCode
			});

            this._propagateState(message, errorEvent);
            this._outputEvents.push(errorEvent);
            timerEndFn({success:"false"});
            return;
		}

        // clear expiration timeout
        this._transferIdsToClearTimeout.push(message.payload.transferId);

        if(!transfer) {
			const errorMessage = `Could not find corresponding transfer with id: ${message.payload.transferId} for checkLiquidAndReserve IAnbHighLevelResponse`;
			this._logger.error(errorMessage);
            const errorCode = TransferErrorCodeNames.TRANSFER_NOT_FOUND;
            let errorEvent = new TransferNotFoundEvt({
				transferId: message.payload.transferId,
				errorCode: errorCode
			});

            try {
                const errorCode = TransferErrorCodeNames.TRANSFER_NOT_FOUND;
                await this._cancelTransfer(message.payload.transferId, errorCode);
            } catch(err: unknown) {
                const error = (err as Error).message;
                const errorMessage = `Unable to cancel reservation with transferId: ${message.payload.transferId}`;
                this._logger.error(err, `${errorMessage}: ${error}`);
                const errorCode = TransferErrorCodeNames.UNABLE_TO_CANCEL_TRANSFER_RESERVATION;
                errorEvent = new TransferCancelReservationFailedEvt({
                    transferId: message.payload.transferId,
                    errorCode: errorCode
                });
            }

            this._propagateState(message, errorEvent);
            this._outputEvents.push(errorEvent);
            timerEndFn({success:"false"});
            return;
        }

        if(transfer.transferState !== TransferState.RESERVED) {
            // Wrong state, either this is a duplicate fulfil or a wrong one

        }


        let participants:ITransferParticipants;
        try {
            participants = await this._getParticipantsInfo(transfer.payerFspId, transfer.payeeFspId, transfer.transferId);
        } catch (err: unknown) {
            let errorEvent:DomainErrorEventMsg;
            let errorCode:string;

            if(err instanceof HubNotFoundError) {
                errorCode = TransferErrorCodeNames.HUB_NOT_FOUND;
                errorEvent = new TransferHubNotFoundFailedEvt({
                    transferId: transfer.transferId,
                    errorCode: errorCode
                });
                transfer.errorCode = errorCode;
            } else if (err instanceof HubParticipantIdMismatchError) {
                errorCode = TransferErrorCodeNames.HUB_PARTICIPANT_ID_MISMATCH;
                errorEvent = new TransferHubIdMismatchEvt({
                    transferId: transfer.transferId,
                    hubId: HUB_ID,
                    errorCode: errorCode
                });
                transfer.errorCode = errorCode;
            } else if (err instanceof HubParticipantNotApprovedError) {
                errorCode = TransferErrorCodeNames.HUB_PARTICIPANT_NOT_APPROVED;
                errorEvent = new TransferHubNotApprovedEvt({
                    transferId: transfer.transferId,
                    hubId: HUB_ID,
                    errorCode: errorCode
                });
                transfer.errorCode = errorCode;
            } else if (err instanceof HubParticipantNotActiveError) {
                errorCode = TransferErrorCodeNames.HUB_PARTICIPANT_NOT_ACTIVE;
                errorEvent = new TransferHubNotActiveEvt({
                    transferId: transfer.transferId,
                    hubId: HUB_ID,
                    errorCode: errorCode
                });
                transfer.errorCode = errorCode;
            } else if (err instanceof PayerParticipantNotFoundError) {
                errorCode = TransferErrorCodeNames.PAYER_PARTICIPANT_NOT_FOUND;
                errorEvent = new TransferPayerNotFoundFailedEvt({
                    transferId: transfer.transferId,
                    payerFspId: transfer.payerFspId,
                    errorCode: errorCode
                });
                transfer.errorCode = errorCode;
            } else if (err instanceof PayerParticipantIdMismatchError) {
                errorCode = TransferErrorCodeNames.PAYER_PARTICIPANT_ID_MISMATCH;
                errorEvent = new TransferPayerIdMismatchEvt({
                    transferId: transfer.transferId,
                    payerFspId: transfer.payerFspId,
                    errorCode: errorCode
                });
                transfer.errorCode = errorCode;
            } else if (err instanceof PayerParticipantNotApprovedError) {
                errorCode = TransferErrorCodeNames.PAYER_PARTICIPANT_NOT_APPROVED;
                errorEvent = new TransferPayerNotApprovedEvt({
                    transferId: transfer.transferId,
                    payerFspId: transfer.payerFspId,
                    errorCode: errorCode
                });
                transfer.errorCode = errorCode;
            } else if (err instanceof PayerParticipantNotActiveError) {
                errorCode = TransferErrorCodeNames.PAYER_PARTICIPANT_NOT_ACTIVE;
                errorEvent = new TransferPayerNotActiveEvt({
                    transferId: transfer.transferId,
                    payerFspId: transfer.payerFspId,
                    errorCode: errorCode
                });
                transfer.errorCode = errorCode;
            } else if (err instanceof PayeeParticipantNotFoundError) {
                errorCode = TransferErrorCodeNames.PAYEE_PARTICIPANT_NOT_FOUND;
                errorEvent = new TransferPayeeNotFoundFailedEvt({
                    transferId: transfer.transferId,
                    payeeFspId: transfer.payeeFspId,
                    errorCode: errorCode
                });
                transfer.errorCode = errorCode;
            } else if (err instanceof PayeeParticipantIdMismatchError) {
                errorCode = TransferErrorCodeNames.PAYEE_PARTICIPANT_ID_MISMATCH;
                errorEvent = new TransferPayeeIdMismatchEvt({
                    transferId: transfer.transferId,
                    payeeFspId: transfer.payeeFspId,
                    errorCode: errorCode
                });
                transfer.errorCode = errorCode;
            } else if (err instanceof PayeeParticipantNotApprovedError) {
                errorCode = TransferErrorCodeNames.PAYEE_PARTICIPANT_NOT_APPROVED;
                errorEvent = new TransferPayeeNotApprovedEvt({
                    transferId: transfer.transferId,
                    payeeFspId: transfer.payeeFspId,
                    errorCode: errorCode
                });
                transfer.errorCode = errorCode;
            } else if (err instanceof PayeeParticipantNotActiveError) {
                errorCode = TransferErrorCodeNames.PAYEE_PARTICIPANT_NOT_ACTIVE;
                errorEvent = new TransferPayeeNotActiveEvt({
                    transferId: transfer.transferId,
                    payeeFspId: transfer.payeeFspId,
                    errorCode: errorCode
                });
                transfer.errorCode = errorCode;
            } else {
                this._logger.error("Unable to handle getParticipantsInfo error - _fulfilTransferStart");
                timerEndFn({success:"false"});
                return;
            }

            try {
                await this._cancelTransfer(transfer.transferId, errorCode);
            } catch(err: unknown) {
                const error = (err as Error).message;
                const errorMessage = `Unable to cancel reservation with transferId: ${transfer.transferId}`;
                this._logger.error(err, `${errorMessage}: ${error}`);
                const errorCode = TransferErrorCodeNames.UNABLE_TO_CANCEL_TRANSFER_RESERVATION;
                errorEvent = new TransferCancelReservationFailedEvt({
                    transferId: transfer.transferId,
                    errorCode: errorCode
                });
            }

            this._propagateState(message, errorEvent);
            this._outputEvents.push(errorEvent);
            timerEndFn({success:"false"});
            return;
        }



        try{
            participantTransferAccounts = this._getTransferParticipantsAccounts(participants, transfer);
        } catch (err: unknown) {
            let errorEvent:DomainErrorEventMsg;
            let errorCode:string;

            if(err instanceof HubAccountNotFoundError) {
                errorCode = TransferErrorCodeNames.HUB_NOT_FOUND;
                errorEvent = new TransferHubAccountNotFoundFailedEvt({
                    transferId: transfer.transferId,
                    errorCode: errorCode
                });
                transfer.errorCode = errorCode;
            } else if (err instanceof PayerPositionAccountNotFoundError) {
                errorCode = TransferErrorCodeNames.PAYER_POSITION_ACCOUNT_NOT_FOUND;
                errorEvent = new TransferPayerPositionAccountNotFoundFailedEvt({
                    transferId: transfer.transferId,
                    payerFspId: transfer.payerFspId,
                    errorCode: errorCode
                });
                transfer.errorCode = errorCode;
            } else if (err instanceof PayerLiquidityAccountNotFoundError) {
                errorCode = TransferErrorCodeNames.PAYER_LIQUIDITY_ACCOUNT_NOT_FOUND;
                errorEvent = new TransferPayerLiquidityAccountNotFoundFailedEvt({
                    transferId: transfer.transferId,
                    payerFspId: transfer.payerFspId,
                    errorCode: errorCode
                });
                transfer.errorCode = errorCode;
            } else if (err instanceof PayeePositionAccountNotFoundError) {
                errorCode = TransferErrorCodeNames.PAYEE_POSITION_ACCOUNT_NOT_FOUND;
                errorEvent = new TransferPayeePositionAccountNotFoundFailedEvt({
                    transferId: transfer.transferId,
                    payeeFspId: transfer.payeeFspId,
                    errorCode: errorCode
                });
                transfer.errorCode = errorCode;
            } else if (err instanceof PayeeLiquidityAccountNotFoundError) {
                errorCode = TransferErrorCodeNames.PAYEE_LIQUIDITY_ACCOUNT_NOT_FOUND;
                errorEvent = new TransferPayeeLiquidityAccountNotFoundFailedEvt({
                    transferId: transfer.transferId,
                    payeeFspId: transfer.payeeFspId,
                    errorCode: errorCode
                });
                transfer.errorCode = errorCode;
            } else {
                this._logger.error("Unable to handle _getTransferParticipantsAccounts error - _fulfilTransferStart");
                timerEndFn({success:"false"});
                return;
            }

            try {
                await this._cancelTransfer(transfer.transferId, errorCode);
            } catch(err: unknown) {
                const error = (err as Error).message;
                const errorMessage = `Unable to cancel reservation with transferId: ${transfer.transferId}`;
                this._logger.error(err, `${errorMessage}: ${error}`);
                const errorCode = TransferErrorCodeNames.UNABLE_TO_CANCEL_TRANSFER_RESERVATION;
                errorEvent = new TransferCancelReservationFailedEvt({
                    transferId: transfer.transferId,
                    errorCode: errorCode
                });
            }

            this._propagateState(message, errorEvent);
            this._outputEvents.push(errorEvent);
            timerEndFn({success:"false"});
            return;
        }

        const req:IAnbCancelReservationAndCommitRequest = {
            requestType: AnbHighLevelRequestTypes.cancelReservationAndCommit,
            requestId: randomUUID(),
            payerPositionAccountId: participantTransferAccounts.payerPosAccount.id,
            payeePositionAccountId: participantTransferAccounts.payeePosAccount.id,
            hubJokeAccountId: participantTransferAccounts.hubAccount.id,
            transferId: transfer.transferId,
            transferAmount: transfer.amount,
            currencyCode: transfer.currencyCode
        };

        this._abBatchRequests.push(req);

        if(this._logger.isDebugEnabled()) this._logger.debug(`fulfilTransfer() - completed for transferId: ${message.payload.transferId}`);
        timerEndFn({success:"true"});
    }

    private async _fulfilTTransferContinue(
        abResponse: IAnbHighLevelResponse,
        request: IAnbHighLevelRequest,
        originalCmdMsg:IDomainMessage,
        transfer: ITransfer | null
    ): Promise<void> {
        const timerEndFn = this._histo.startTimer({ callName: "fulfilTTransferContinue()"});
        const fulfiledAtTime = Date.now();

        if (!transfer) {
			const errorMessage = `Could not find corresponding transfer with id: ${request.transferId} for _fulfilTTransferContinue IAnbHighLevelResponse`;
			this._logger.error(errorMessage);
            const errorCode = TransferErrorCodeNames.TRANSFER_NOT_FOUND;
            let errorEvent = new TransferNotFoundEvt({
				transferId: originalCmdMsg.payload.transferId,
				errorCode: errorCode
			});

            try {
                await this._cancelTransfer(originalCmdMsg.payload.transferId, errorCode);
            } catch(err: unknown) {
                const error = (err as Error).message;
                const errorMessage = `Unable to cancel reservation with transferId: ${originalCmdMsg.payload.transferId}`;
                this._logger.error(err, `${errorMessage}: ${error}`);
                const errorCode = TransferErrorCodeNames.UNABLE_TO_CANCEL_TRANSFER_RESERVATION;
                errorEvent = new TransferCancelReservationFailedEvt({
                    transferId: originalCmdMsg.payload.transferId,
                    errorCode: errorCode
                });
            }

            this._propagateState(originalCmdMsg, errorEvent);
            this._outputEvents.push(errorEvent);
            timerEndFn({success:"false"});
            return;
        }

        if(this._logger.isDebugEnabled()) this._logger.debug(`fulfilTTransferContinue() - started for transferId: ${transfer.transferId}`);

        if (!abResponse.success) {
            // TODO shouldn't this be a UnableToCommitTransferError?
            const err = new CheckLiquidityAndReserveFailedError(`Unable to cancelReservationAndCommit for transferId: ${request.transferId} - error: ${abResponse.errorMessage}`);
            this._logger.error(err);
            const errorCode = TransferErrorCodeNames.UNABLE_TO_CANCEL_TRANSFER_RESERVATION_AND_COMMIT;

            transfer.updatedAt = Date.now();
            transfer.transferState = TransferState.ABORTED;
            transfer.errorCode = errorCode;
            this._cacheTransfer(transfer);

			const errorMessage = `Unable to commit transfer for transferId: ${request.transferId}`;
            this._logger.info(errorMessage);
            let errorEvent = new TransferCancelReservationAndCommitFailedEvt({
				transferId: request.transferId,
				errorCode: errorCode
			});

            try {
                await this._cancelTransfer(transfer.transferId, errorCode);
            } catch(err: unknown) {
                const error = (err as Error).message;
                const errorMessage = `Unable to cancel reservation with transferId: ${transfer.transferId}`;
                this._logger.error(err, `${errorMessage}: ${error}`);
                const errorCode = TransferErrorCodeNames.UNABLE_TO_CANCEL_TRANSFER_RESERVATION;
                errorEvent = new TransferCancelReservationFailedEvt({
                    transferId: transfer.transferId,
                    errorCode: errorCode
                });
            }

            this._propagateState(originalCmdMsg, errorEvent);
            this._outputEvents.push(errorEvent);
            timerEndFn({success:"false"});
            return;
        }

        // TODO if failed, queue a cancelReservation request to this._abCancelationBatchRequests and add the error event to the events queue
        // this._abCancelationBatchRequests.push({
        //     requestType: AnbHighLevelRequestTypes.cancelReservation,
        //     ...

        // TODO validate type
        const message = originalCmdMsg;// as PrepareTransferCmd;


        transfer.updatedAt = Date.now();
        transfer.transferState = TransferState.COMMITTED;
        transfer.fulfilment = message.payload.fulfilment;
        transfer.completedTimestamp = message.payload.completedTimestamp;
        transfer.extensionList = message.payload.extensionList;

        this._cacheTransfer(transfer);

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

            this._propagateState(message, event);
            this._outputEvents.push(event);
        }

        if(this._logger.isDebugEnabled()) this._logger.debug(`fulfilTTransferContinue() - completed for transferId: ${transfer.transferId}`);
        timerEndFn({success:"true"});
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
            const errorCode = TransferErrorCodeNames.UNABLE_TO_GET_TRANSFER;
            const errorEvent = new TransferUnableToGetTransferByIdEvt({
				transferId: message.payload.transferId,
				errorCode: errorCode
			});

            this._propagateState(message, errorEvent);
            this._outputEvents.push(errorEvent);
            return;
		}

		if(!transfer) {
			const errorMessage = `TransferId: ${message.payload.transferId} could not be found`;
			this._logger.error(errorMessage);
            const errorCode = TransferErrorCodeNames.TRANSFER_NOT_FOUND;
            const errorEvent = new TransferNotFoundEvt({
				transferId: message.payload.transferId,
				errorCode: errorCode
			});

            this._propagateState(message, errorEvent);
            this._outputEvents.push(errorEvent);
            return;
		}

        if(this._logger.isDebugEnabled()) this._logger.debug("_rejectTransfer() - before getParticipants...");

        try{
            await this._getParticipantsInfo(transfer.payerFspId, transfer.payeeFspId, transfer.transferId);
        } catch (err: unknown) {
            let errorEvent:DomainErrorEventMsg;

            if(err instanceof HubNotFoundError) {
                const errorCode = TransferErrorCodeNames.HUB_NOT_FOUND;
                errorEvent = new TransferHubNotFoundFailedEvt({
                    transferId: transfer.transferId,
                    errorCode: errorCode
                });
                transfer.errorCode = errorCode;
            } else if (err instanceof HubParticipantIdMismatchError) {
                const errorCode = TransferErrorCodeNames.HUB_PARTICIPANT_ID_MISMATCH;
                errorEvent = new TransferHubIdMismatchEvt({
                    transferId: transfer.transferId,
                    hubId: HUB_ID,
                    errorCode: errorCode
                });
                transfer.errorCode = errorCode;
            } else if (err instanceof HubParticipantNotApprovedError) {
                const errorCode = TransferErrorCodeNames.HUB_PARTICIPANT_NOT_APPROVED;
                errorEvent = new TransferHubNotApprovedEvt({
                    transferId: transfer.transferId,
                    hubId: HUB_ID,
                    errorCode: errorCode
                });
                transfer.errorCode = errorCode;
            } else if (err instanceof HubParticipantNotActiveError) {
                const errorCode = TransferErrorCodeNames.HUB_PARTICIPANT_NOT_ACTIVE;
                errorEvent = new TransferHubNotActiveEvt({
                    transferId: transfer.transferId,
                    hubId: HUB_ID,
                    errorCode: errorCode
                });
                transfer.errorCode = errorCode;
            } else if (err instanceof PayerParticipantNotFoundError) {
                const errorCode = TransferErrorCodeNames.PAYER_PARTICIPANT_NOT_FOUND;
                errorEvent = new TransferPayerNotFoundFailedEvt({
                    transferId: transfer.transferId,
                    payerFspId: transfer.payerFspId,
                    errorCode: errorCode
                });
                transfer.errorCode = errorCode;
            } else if (err instanceof PayerParticipantIdMismatchError) {
                const errorCode = TransferErrorCodeNames.PAYER_PARTICIPANT_ID_MISMATCH;
                errorEvent = new TransferPayerIdMismatchEvt({
                    transferId: transfer.transferId,
                    payerFspId: transfer.payerFspId,
                    errorCode: errorCode
                });
                transfer.errorCode = errorCode;
            } else if (err instanceof PayerParticipantNotApprovedError) {
                const errorCode = TransferErrorCodeNames.PAYER_PARTICIPANT_NOT_APPROVED;
                errorEvent = new TransferPayerNotApprovedEvt({
                    transferId: transfer.transferId,
                    payerFspId: transfer.payerFspId,
                    errorCode: errorCode
                });
                transfer.errorCode = errorCode;
            } else if (err instanceof PayerParticipantNotActiveError) {
                const errorCode = TransferErrorCodeNames.PAYER_PARTICIPANT_NOT_ACTIVE;
                errorEvent = new TransferPayerNotActiveEvt({
                    transferId: transfer.transferId,
                    payerFspId: transfer.payerFspId,
                    errorCode: errorCode
                });
                transfer.errorCode = errorCode;
            } else if (err instanceof PayeeParticipantNotFoundError) {
                const errorCode = TransferErrorCodeNames.PAYEE_PARTICIPANT_NOT_FOUND;
                errorEvent = new TransferPayeeNotFoundFailedEvt({
                    transferId: transfer.transferId,
                    payeeFspId: transfer.payeeFspId,
                    errorCode: errorCode
                });
                transfer.errorCode = errorCode;
            } else if (err instanceof PayeeParticipantIdMismatchError) {
                const errorCode = TransferErrorCodeNames.PAYEE_PARTICIPANT_ID_MISMATCH;
                errorEvent = new TransferPayeeIdMismatchEvt({
                    transferId: transfer.transferId,
                    payeeFspId: transfer.payeeFspId,
                    errorCode: errorCode
                });
                transfer.errorCode = errorCode;
            } else if (err instanceof PayeeParticipantNotApprovedError) {
                const errorCode = TransferErrorCodeNames.PAYEE_PARTICIPANT_NOT_APPROVED;
                errorEvent = new TransferPayeeNotApprovedEvt({
                    transferId: transfer.transferId,
                    payeeFspId: transfer.payeeFspId,
                    errorCode: errorCode
                });
                transfer.errorCode = errorCode;
            } else if (err instanceof PayeeParticipantNotActiveError) {
                const errorCode = TransferErrorCodeNames.PAYEE_PARTICIPANT_NOT_ACTIVE;
                errorEvent = new TransferPayeeNotActiveEvt({
                    transferId: transfer.transferId,
                    payeeFspId: transfer.payeeFspId,
                    errorCode: errorCode
                });
                transfer.errorCode = errorCode;
            } else {
                this._logger.error("Unable to handle _getParticipantsInfo error - _rejectTransfer");
                return;
            }

            this._cacheTransfer(transfer);
            this._propagateState(message, errorEvent);
            this._outputEvents.push(errorEvent);
            return;
        }

        if(this._logger.isDebugEnabled()) this._logger.debug("_rejectTransfer() - after getParticipants");

        try {
            const errorCode = TransferErrorCodeNames.TRANSFER_REJECTED_BY_PAYEE;
            await this._cancelTransfer(message.payload.transferId, errorCode);
        } catch(err: unknown) {
            const error = (err as Error).message;
            const errorMessage = `Unable to cancel reservation with transferId: ${message.payload.transferId}`;
            this._logger.error(err, `${errorMessage}: ${error}`);
            const errorCode = TransferErrorCodeNames.UNABLE_TO_CANCEL_TRANSFER_RESERVATION;
            const errorEvent = new TransferCancelReservationFailedEvt({
                transferId: message.payload.transferId,
                errorCode: errorCode
            });

            this._propagateState(message, errorEvent);
            this._outputEvents.push(errorEvent);
            return;
        }

		try {
            const errorCode = TransferErrorCodeNames.TRANSFER_REJECTED_BY_PAYEE;
            transfer.updatedAt = Date.now();
			transfer.transferState = TransferState.ABORTED;
            transfer.errorCode = errorCode;
			await this._transfersRepo.updateTransfer(transfer);
		} catch(err: unknown) {
			const error = (err as Error).message;
			const errorMessage = `Error updating transfer for transferId: ${transfer.transferId}.`;
			this._logger.error(err, `${errorMessage}: ${error}`);
            const errorCode = TransferErrorCodeNames.UNABLE_TO_UPDATE_TRANSFER;
            const errorEvent = new TransferUnableToUpdateEvt({
				transferId: transfer.transferId,
				payerFspId: transfer.payerFspId,
				errorCode: errorCode
			});

            this._propagateState(message, errorEvent);
            this._outputEvents.push(errorEvent);
            return;
		}

        if(!transfer.bulkTransferId) {
            const payload: TransferRejectRequestProcessedEvtPayload = {
                transferId: message.payload.transferId,
                errorInformation: message.payload.errorInformation
            };

            const event = new TransferRejectRequestProcessedEvt(payload);

            this._propagateState(message, event);
            this._logger.debug("_rejectTransfer completed for transferId: " + transfer.transferId);

            this._outputEvents.push(event);
        }
        if(this._logger.isDebugEnabled()) this._logger.debug(`_rejectTransfer() - completed for transferId: ${transfer.transferId}`);
	}

    private async _queryTransfer(message: QueryTransferCmd):Promise<void> {
        const timerEndFn = this._histo.startTimer({ callName: "_queryTransfer()"});
		this._logger.isDebugEnabled() && this._logger.debug(`queryTransfer() - Got QueryTransferCmd msg for transferId: ${message.payload.transferId}`);

		const requesterFspId = message.fspiopOpaqueState?.requesterFspId ?? null;
		const destinationFspId = message.fspiopOpaqueState?.destinationFspId ?? null;
        const transferId = message.payload.transferId;

        if(this._logger.isDebugEnabled()) this._logger.debug("_queryTransfer() - before getParticipants...");

        try{
            await this._getParticipantsInfo(requesterFspId, destinationFspId, message.payload.transferId);
        } catch (err: unknown) {
            let errorEvent:DomainErrorEventMsg;

            if(err instanceof HubNotFoundError) {
                const errorCode = TransferErrorCodeNames.HUB_NOT_FOUND;
                errorEvent = new TransferHubNotFoundFailedEvt({
                    transferId: transferId,
                    errorCode: errorCode
                });
            } else if (err instanceof HubParticipantIdMismatchError) {
                const errorCode = TransferErrorCodeNames.HUB_PARTICIPANT_ID_MISMATCH;
                errorEvent = new TransferHubIdMismatchEvt({
                    transferId: transferId,
                    hubId: HUB_ID,
                    errorCode: errorCode
                });
            } else if (err instanceof HubParticipantNotApprovedError) {
                const errorCode = TransferErrorCodeNames.HUB_PARTICIPANT_NOT_APPROVED;
                errorEvent = new TransferHubNotApprovedEvt({
                    transferId: transferId,
                    hubId: HUB_ID,
                    errorCode: errorCode
                });
            } else if (err instanceof HubParticipantNotActiveError) {
                const errorCode = TransferErrorCodeNames.HUB_PARTICIPANT_NOT_ACTIVE;
                errorEvent = new TransferHubNotActiveEvt({
                    transferId: transferId,
                    hubId: HUB_ID,
                    errorCode: errorCode
                });
            } else if (err instanceof PayerParticipantNotFoundError) {
                const errorCode = TransferErrorCodeNames.PAYER_PARTICIPANT_NOT_FOUND;
                errorEvent = new TransferPayerNotFoundFailedEvt({
                    transferId: transferId,
                    payerFspId: requesterFspId,
                    errorCode: errorCode
                });
            } else if (err instanceof PayerParticipantIdMismatchError) {
                const errorCode = TransferErrorCodeNames.PAYER_PARTICIPANT_ID_MISMATCH;
                errorEvent = new TransferPayerIdMismatchEvt({
                    transferId: transferId,
                    payerFspId: requesterFspId,
                    errorCode: errorCode
                });
            } else if (err instanceof PayerParticipantNotApprovedError) {
                const errorCode = TransferErrorCodeNames.PAYER_PARTICIPANT_NOT_APPROVED;
                errorEvent = new TransferPayerNotApprovedEvt({
                    transferId: transferId,
                    payerFspId: requesterFspId,
                    errorCode: errorCode
                });
            } else if (err instanceof PayerParticipantNotActiveError) {
                const errorCode = TransferErrorCodeNames.PAYER_PARTICIPANT_NOT_ACTIVE;
                errorEvent = new TransferPayerNotActiveEvt({
                    transferId: transferId,
                    payerFspId: requesterFspId,
                    errorCode: errorCode
                });
            } else if (err instanceof PayeeParticipantNotFoundError) {
                const errorCode = TransferErrorCodeNames.PAYEE_PARTICIPANT_NOT_FOUND;
                errorEvent = new TransferPayeeNotFoundFailedEvt({
                    transferId: transferId,
                    payeeFspId: destinationFspId,
                    errorCode: errorCode
                });
            } else if (err instanceof PayeeParticipantIdMismatchError) {
                const errorCode = TransferErrorCodeNames.PAYEE_PARTICIPANT_ID_MISMATCH;
                errorEvent = new TransferPayeeIdMismatchEvt({
                    transferId: transferId,
                    payeeFspId: destinationFspId,
                    errorCode: errorCode
                });
            } else if (err instanceof PayeeParticipantNotApprovedError) {
                const errorCode = TransferErrorCodeNames.PAYEE_PARTICIPANT_NOT_APPROVED;
                errorEvent = new TransferPayeeNotApprovedEvt({
                    transferId: transferId,
                    payeeFspId: destinationFspId,
                    errorCode: errorCode
                });
            } else if (err instanceof PayeeParticipantNotActiveError) {
                const errorCode = TransferErrorCodeNames.PAYEE_PARTICIPANT_NOT_ACTIVE;
                errorEvent = new TransferPayeeNotActiveEvt({
                    transferId: transferId,
                    payeeFspId: destinationFspId,
                    errorCode: errorCode
                });
            } else {
                this._logger.error("Unable to handle _getParticipantsInfo error - _queryTransfer");
                timerEndFn({success:"false"});
                return;
            }

            timerEndFn({success:"false"});
            this._propagateState(message, errorEvent);
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
            const errorCode = TransferErrorCodeNames.UNABLE_TO_GET_TRANSFER;
            const errorEvent = new TransferUnableToGetTransferByIdEvt({
				transferId: message.payload.transferId,
				errorCode: errorCode
			});

            this._propagateState(message, errorEvent);
            this._outputEvents.push(errorEvent);
            timerEndFn({success:"false"});
            return;
		}

		if(!transfer) {
			const errorMessage = `TransferId: ${message.payload.transferId} could not be found`;
			this._logger.error(errorMessage);
            const errorCode = TransferErrorCodeNames.TRANSFER_NOT_FOUND;
            const errorEvent = new TransferNotFoundEvt({
				transferId: message.payload.transferId,
				errorCode: errorCode
			});

            this._propagateState(message, errorEvent);
            this._outputEvents.push(errorEvent);
            timerEndFn({success:"false"});
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

        this._logger.debug("_queryTransfer completed for transferId: " + transfer.transferId);

        this._propagateState(message, event);
        this._outputEvents.push(event);
        timerEndFn({success:"false"});
        this._logger.isDebugEnabled() && this._logger.debug(`_queryTransfer() - completed for transferId: ${transfer.transferId}`);
	}

    private async _getParticipantsInfo(payerFspId: string, payeeFspId: string, transferId: string): Promise<ITransferParticipants> {
        // TODO get all participants in a single call with participantsClient.getParticipantsByIds()

        const timerEndFn = this._histo.startTimer({ callName: "_getParticipantsInfo() 3x"});
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

        timerEndFn({success:"true"});
        return {
            hub: foundHub,
            payer: foundPayer,
            payee: foundPayee
        };
    }

    private _getTransferParticipantsAccounts(transferParticipants: ITransferParticipants, transfer: ITransfer): ITransferAccounts {

        const {hub, payer: transferPayerParticipant, payee: transferPayeeParticipant} = transferParticipants;

        const hubAccount = hub.participantAccounts.find((value: IParticipantAccount) => (value.type as string) === "HUB_RECONCILIATION" && value.currencyCode === transfer.currencyCode);
        if(!hubAccount) {
			const errorMessage = "Hub account not found for transfer " + transfer.transferId;
            this._logger.error(errorMessage);
            throw new HubAccountNotFoundError(errorMessage);
        }

        const payerPosAccount = transferPayerParticipant.participantAccounts.find((value: IParticipantAccount) => (value.type as string) === "POSITION" && value.currencyCode === transfer.currencyCode);
        if(!payerPosAccount) {
			const errorMessage = `Payer position account not found: transferId: ${transfer.transferId}, payer: ${transfer.payerFspId}`;
            this._logger.error(errorMessage);
            throw new PayerPositionAccountNotFoundError(errorMessage);
        }

        const payerLiqAccount = transferPayerParticipant.participantAccounts.find((value: IParticipantAccount) => (value.type as string) === "LIQUIDITY" && value.currencyCode === transfer.currencyCode);
        if(!payerLiqAccount) {
			const errorMessage = `Payer liquidity account not found: transferId: ${transfer.transferId}, payer: ${transfer.payerFspId}`;
            this._logger.error(errorMessage);
            throw new PayerLiquidityAccountNotFoundError(errorMessage);
        }

        const payeePosAccount = transferPayeeParticipant.participantAccounts.find((value: IParticipantAccount) => (value.type as string) === "POSITION" && value.currencyCode === transfer.currencyCode);
        if(!payeePosAccount) {
			const errorMessage = `Payee position account not found: transferId: ${transfer.transferId}, payee: ${transfer.payeeFspId}`;
            this._logger.error(errorMessage);
            throw new PayeePositionAccountNotFoundError(errorMessage);
        }

        const payeeLiqAccount = transferPayeeParticipant.participantAccounts.find((value: IParticipantAccount) => (value.type as string) === "LIQUIDITY" && value.currencyCode === transfer.currencyCode);
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

    private async _cancelTransfer(transferId: string, errorCode: string) {
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

            const req: IAnbCancelReservationRequest = {
                requestType: AnbHighLevelRequestTypes.cancelReservation,
                requestId: randomUUID(),
                payerPositionAccountId: participantTransferAccounts.payerPosAccount.id,
                hubJokeAccountId: participantTransferAccounts.hubAccount.id,
                transferId: transfer.transferId,
                transferAmount: transfer.amount,
                currencyCode: transfer.currencyCode
            };

            this._abCancellationBatchRequests.push(req);

            transfer.updatedAt = Date.now();
            transfer.transferState = TransferState.ABORTED;
            transfer.errorCode = errorCode;
            await this._transfersRepo.updateTransfer(transfer);
        } catch (err: unknown) {
            const errorMessage = `Error cancelling transfer ${transferId} ${err}`;
            this._logger.error(err, errorMessage);
            throw new UnableToCancelTransferError(errorMessage);
        }
    }

    private async _prepareBulkTransferStart(message: PrepareBulkTransferCmd): Promise<void> {
        if(this._logger.isDebugEnabled()) this._logger.debug(`_prepareBulkTransferStart() - Got BulkTransferPrepareRequestedEvt msg for bulkTransferId: ${message.payload.bulkTransferId}`);

        const now = Date.now();

        const bulkTransferId = message.payload.bulkTransferId;
        const bulkTransfer: BulkTransfer = {
            createdAt: now,
            updatedAt: now,
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
            errorCode: null
		};

        try{
            await this._bulkTransfersRepo.addBulkTransfer(bulkTransfer);
        } catch(err:unknown){
            const error = (err as Error).message;
            const errorMessage = `Error adding bulk transfer ${bulkTransferId} to database: ${error}`;
            this._logger.error(err, `${errorMessage}: ${error}`);
            const errorCode = TransferErrorCodeNames.UNABLE_TO_ADD_BULK_TRANSFER;
            const errorEvent = new TransferBCUnableToAddBulkTransferToDatabaseEvt({
                bulkTransferId: bulkTransfer.bulkTransferId,
                errorCode: errorCode
            });
            this._propagateState(message, errorEvent);
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
        abResponse: IAnbHighLevelResponse,
        request: IAnbHighLevelRequest,
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
            const errorCode = TransferErrorCodeNames.UNABLE_TO_GET_BULK_TRANSFER;
            const errorEvent = new TransferUnableToGetBulkTransferByIdEvt({
                bulkTransferId: transfer.bulkTransferId as string,
                errorCode: errorCode
            });

            this._propagateState(message, errorEvent);
            this._outputEvents.push(errorEvent);
            return;
        }

        if(!bulkTransfer) {
			const errorMessage = `Could not find corresponding bulk transfer with id: ${transfer.bulkTransferId} for checkLiquidAndReserve IAnbHighLevelResponse`;
			this._logger.error(errorMessage);
            const errorCode = TransferErrorCodeNames.BULK_TRANSFER_NOT_FOUND;
            const errorEvent = new BulkTransferNotFoundEvt({
				bulkTransferId: transfer.bulkTransferId as string,
				errorCode: errorCode
			});

            this._propagateState(message, errorEvent);
            this._outputEvents.push(errorEvent);
            return;
        }

        bulkTransfer?.transfersPreparedProcessedIds.push(transfer.transferId);
        this._bulkTransfersCache.set(bulkTransfer.bulkTransferId, bulkTransfer);

        if(bulkTransfer.transfersPreparedProcessedIds.length + bulkTransfer?.transfersNotProcessedIds.length === bulkTransfer.individualTransfers.length) {
            bulkTransfer.updatedAt = Date.now();
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
                const errorCode = TransferErrorCodeNames.UNABLE_TO_GET_TRANSFERS_FROM_BULK_TRANSFER;
                const errorEvent = new TransferNotFoundEvt({
                    transferId: bulkTransfer.bulkTransferId,
                    errorCode: errorCode
                });

                this._propagateState(message, errorEvent);
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

            this._propagateState(message, event);
            this._outputEvents.push(event);

            if(this._logger.isDebugEnabled()) this._logger.debug(`prepareBulkTransferContinue() - completed for transferId: ${transfer.transferId}`);
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
            const errorCode = TransferErrorCodeNames.UNABLE_TO_GET_BULK_TRANSFER;
            const errorEvent = new TransferUnableToGetBulkTransferByIdEvt({
                bulkTransferId: bulkTransferId,
                errorCode: errorCode
            });

            this._propagateState(message, errorEvent);
            this._outputEvents.push(errorEvent);
            return;
        }

        if(!bulkTransfer) {
			const errorMessage = `Could not find corresponding bulk transfer with id: ${bulkTransferId} for checkLiquidAndReserve IAnbHighLevelResponse`;
			this._logger.error(errorMessage);
            const errorCode = TransferErrorCodeNames.BULK_TRANSFER_NOT_FOUND;
            const errorEvent = new BulkTransferNotFoundEvt({
				bulkTransferId: bulkTransferId,
				errorCode: errorCode
			});

            this._propagateState(message, errorEvent);
            this._outputEvents.push(errorEvent);
            return;
        }

        bulkTransfer.updatedAt = Date.now();
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
        abResponse: IAnbHighLevelResponse,
        request: IAnbHighLevelRequest,
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
            const errorCode = TransferErrorCodeNames.UNABLE_TO_GET_BULK_TRANSFER;
            const errorEvent = new TransferUnableToGetBulkTransferByIdEvt({
                bulkTransferId: transfer.bulkTransferId as string,
                errorCode: errorCode
            });

            this._propagateState(message, errorEvent);
            this._outputEvents.push(errorEvent);
            return;
        }

        if(!bulkTransfer) {
			const errorMessage = `Could not find corresponding bulk transfer with id: ${transfer.bulkTransferId} for checkLiquidAndReserve IAnbHighLevelResponse`;
			this._logger.error(errorMessage);
            const errorCode = TransferErrorCodeNames.BULK_TRANSFER_NOT_FOUND;
            const errorEvent = new BulkTransferNotFoundEvt({
				bulkTransferId: transfer.bulkTransferId as string,
				errorCode: errorCode
			});

            this._propagateState(message, errorEvent);
            this._outputEvents.push(errorEvent);
            return;
        }

        bulkTransfer.updatedAt = Date.now();
        bulkTransfer.status = BulkTransferState.PROCESSING;
        this._bulkTransfersCache.set(bulkTransfer.bulkTransferId, bulkTransfer);

        await this._fulfilTTransferContinue(abResponse, request, originalCmdMsg, transfer);

        bulkTransfer?.transfersFulfiledProcessedIds.push(transfer.transferId as string);
        this._bulkTransfersCache.set(bulkTransfer.bulkTransferId, bulkTransfer);


        if(bulkTransfer?.transfersFulfiledProcessedIds.length + bulkTransfer?.transfersNotProcessedIds.length === bulkTransfer?.individualTransfers.length) {
            bulkTransfer.updatedAt = Date.now();
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
            this._logger.debug("transferPreparedReceivedEvt completed for transferId: " + transfer.transferId);

            this._propagateState(message, event);
            this._outputEvents.push(event);

            await this._bulkTransfersRepo.updateBulkTransfer(bulkTransfer);
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
            const errorCode = TransferErrorCodeNames.UNABLE_TO_GET_BULK_TRANSFER;
            const errorEvent = new TransferUnableToGetBulkTransferByIdEvt({
                bulkTransferId: bulkTransferId,
                errorCode: errorCode
            });

            this._propagateState(message, errorEvent);
            this._outputEvents.push(errorEvent);
            return;
        }

        if(!bulkTransfer) {
			const errorMessage = `Could not find corresponding bulk transfer with id: ${bulkTransferId}`;
			this._logger.error(errorMessage);
            const errorCode = TransferErrorCodeNames.BULK_TRANSFER_NOT_FOUND;
            const errorEvent = new BulkTransferNotFoundEvt({
				bulkTransferId: bulkTransferId,
				errorCode: errorCode
			});

            this._propagateState(message, errorEvent);
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
            const errorCode = TransferErrorCodeNames.UNABLE_TO_GET_TRANSFERS_FROM_BULK_TRANSFER;
            const errorEvent = new TransferUnableToGetBulkTransferByIdEvt({
				bulkTransferId: message.payload.bulkTransferId,
				errorCode: errorCode
			});

            this._propagateState(message, errorEvent);
            this._outputEvents.push(errorEvent);
            return;
		}

        for(let i=0 ; i<transfers.length ; i+=1) {
            const individualTransfer = transfers[i];

            const transferCmd:RejectTransferCmd = new RejectTransferCmd({
                transferId: individualTransfer.transferId,
                errorInformation: individualTransfer.errorCode as unknown as IErrorInformation,
                prepare: message.fspiopOpaqueState
            });

            await this._rejectTransfer(transferCmd);
        }

        bulkTransfer.updatedAt = Date.now();
        bulkTransfer.status = BulkTransferState.REJECTED;
        // bulkTransfer.errorCode = message.payload.errorInformation; TODO
        await this._bulkTransfersRepo.updateBulkTransfer(bulkTransfer);

		const payload: BulkTransferRejectRequestProcessedEvtPayload = {
			bulkTransferId: message.payload.bulkTransferId,
			errorInformation: message.payload.errorInformation
		};

		const event = new BulkTransferRejectRequestProcessedEvt(payload);

        this._propagateState(message, event);
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
            const errorCode = TransferErrorCodeNames.UNABLE_TO_GET_BULK_TRANSFER;
            const errorEvent = new TransferUnableToGetBulkTransferByIdEvt({
                bulkTransferId: bulkTransferId,
                errorCode: errorCode
            });

            this._propagateState(message, errorEvent);
            this._outputEvents.push(errorEvent);
            return;
        }

        if(!bulkTransfer) {
			const errorMessage = `Could not find corresponding bulk transfer with id: ${bulkTransferId}`;
			this._logger.info(errorMessage);
            const errorCode = TransferErrorCodeNames.BULK_TRANSFER_NOT_FOUND;
            const errorEvent = new BulkTransferNotFoundEvt({
				bulkTransferId: bulkTransferId,
				errorCode: errorCode
			});

            this._propagateState(message, errorEvent);
            this._outputEvents.push(errorEvent);
            return;
        }

        if(this._logger.isDebugEnabled()) this._logger.debug("_queryBulkTransfer() - before getParticipants...");

        try{
            await this._getParticipantsInfo(requesterFspId, destinationFspId, message.payload.bulkTransferId);
        } catch (err: unknown) {
            let errorEvent:DomainErrorEventMsg;

            if(err instanceof HubNotFoundError) {
                const errorCode = TransferErrorCodeNames.HUB_NOT_FOUND;
                errorEvent = new TransferHubNotFoundFailedEvt({
                    transferId: bulkTransferId,
                    errorCode: errorCode
                });
            } else if (err instanceof HubParticipantIdMismatchError) {
                const errorCode = TransferErrorCodeNames.HUB_PARTICIPANT_ID_MISMATCH;
                errorEvent = new TransferHubIdMismatchEvt({
                    transferId: bulkTransferId,
                    hubId: HUB_ID,
                    errorCode: errorCode
                });
            } else if (err instanceof HubParticipantNotApprovedError) {
                const errorCode = TransferErrorCodeNames.HUB_PARTICIPANT_NOT_APPROVED;
                errorEvent = new TransferHubNotApprovedEvt({
                    transferId: bulkTransferId,
                    hubId: HUB_ID,
                    errorCode: errorCode
                });
            } else if (err instanceof HubParticipantNotActiveError) {
                const errorCode = TransferErrorCodeNames.HUB_PARTICIPANT_NOT_ACTIVE;
                errorEvent = new TransferHubNotActiveEvt({
                    transferId: bulkTransferId,
                    hubId: HUB_ID,
                    errorCode: errorCode
                });
            } else if (err instanceof PayerParticipantNotFoundError) {
                const errorCode = TransferErrorCodeNames.PAYER_PARTICIPANT_NOT_FOUND;
                errorEvent = new TransferPayerNotFoundFailedEvt({
                    transferId: bulkTransferId,
                    payerFspId: requesterFspId,
                    errorCode: errorCode
                });
            } else if (err instanceof PayerParticipantIdMismatchError) {
                const errorCode = TransferErrorCodeNames.PAYER_PARTICIPANT_ID_MISMATCH;
                errorEvent = new TransferPayerIdMismatchEvt({
                    transferId: bulkTransferId,
                    payerFspId: requesterFspId,
                    errorCode: errorCode
                });
            } else if (err instanceof PayerParticipantNotApprovedError) {
                const errorCode = TransferErrorCodeNames.PAYER_PARTICIPANT_NOT_APPROVED;
                errorEvent = new TransferPayerNotApprovedEvt({
                    transferId: bulkTransferId,
                    payerFspId: destinationFspId,
                    errorCode: errorCode
                });
            } else if (err instanceof PayerParticipantNotActiveError) {
                const errorCode = TransferErrorCodeNames.PAYER_PARTICIPANT_NOT_ACTIVE;
                errorEvent = new TransferPayerNotActiveEvt({
                    transferId: bulkTransferId,
                    payerFspId: requesterFspId,
                    errorCode: errorCode
                });
            } else if (err instanceof PayeeParticipantNotFoundError) {
                const errorCode = TransferErrorCodeNames.PAYEE_PARTICIPANT_NOT_FOUND;
                errorEvent = new TransferPayeeNotFoundFailedEvt({
                    transferId: bulkTransferId,
                    payeeFspId: destinationFspId,
                    errorCode: errorCode
                });
            } else if (err instanceof PayeeParticipantIdMismatchError) {
                const errorCode = TransferErrorCodeNames.PAYEE_PARTICIPANT_ID_MISMATCH;
                errorEvent = new TransferPayeeIdMismatchEvt({
                    transferId: bulkTransferId,
                    payeeFspId: destinationFspId,
                    errorCode: errorCode
                });
            } else if (err instanceof PayeeParticipantNotApprovedError) {
                const errorCode = TransferErrorCodeNames.PAYEE_PARTICIPANT_NOT_APPROVED;
                errorEvent = new TransferPayeeNotApprovedEvt({
                    transferId: bulkTransferId,
                    payeeFspId: destinationFspId,
                    errorCode: errorCode
                });
            } else if (err instanceof PayeeParticipantNotActiveError) {
                const errorCode = TransferErrorCodeNames.PAYEE_PARTICIPANT_NOT_ACTIVE;
                errorEvent = new TransferPayeeNotActiveEvt({
                    transferId: bulkTransferId,
                    payeeFspId: destinationFspId,
                    errorCode: errorCode
                });
            } else {
                this._logger.error("Unable to handle _getParticipantsInfo error - _queryBulkTransfer");
                return;
            }

            this._propagateState(message, errorEvent);
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
            const errorCode = TransferErrorCodeNames.UNABLE_TO_GET_BULK_TRANSFER;
            const errorEvent = new TransferUnableToGetBulkTransferByIdEvt({
				bulkTransferId: message.payload.bulkTransferId,
				errorCode: errorCode
			});

            this._propagateState(message, errorEvent);
            this._outputEvents.push(errorEvent);
            return;
		}

		if(transfers.length === 0) {
			const errorMessage = `BulkTransferId: ${bulkTransferId} has no associated transfers`;
			this._logger.error(errorMessage);
            const errorCode = TransferErrorCodeNames.BULK_TRANSFERS_NO_ITEMS;

			const errorEvent = new TransferNotFoundEvt({
				transferId: bulkTransferId,
				errorCode: errorCode
			});

            this._propagateState(message, errorEvent);
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
                    errorInformation: transferResult.errorCode as unknown as IErrorInformation,
                    extensionList: transferResult.extensionList
                };
            }),
            bulkTransferState: bulkTransfer.status,
            extensionList: bulkTransfer.extensionList
		};

		const event = new BulkTransferQueryResponseEvt(payload);

        this._propagateState(message, event);
        this._outputEvents.push(event);
        if(this._logger.isDebugEnabled()) this._logger.debug(`_queryBulkTransfer() - completed for bulkTransferId: ${bulkTransferId}`);
	}

    private _generateSha256(payload: PrepareTransferCmdPayload): string {
        const timerEndFn = this._histo.startTimer({callName: "_generateSha256()"});

        const hashInput: string = `${payload.transferId}_${payload.payerFsp}_${payload.payeeFsp}_${payload.amount}_${payload.expiration}`;

        // updating data with base64 encoding
        const hashSha256 = createHash("sha256").update(hashInput).digest("base64");

        // remove trailing '=' as per specification
        const ret = hashSha256.slice(0, -1);

        timerEndFn({success: "true"});
        return ret;
    }

}
