/**
 License
 --------------
 Copyright © 2021 Mojaloop Foundation

 The Mojaloop files are made available by the Mojaloop Foundation under the Apache License, Version 2.0 (the "License") and you may not use these files except in compliance with the License.

 You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, the Mojaloop files are distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.

 Contributors
 --------------
 This is the official list (alphabetical ordering) of the Mojaloop project contributors for this file.
 Names of the original copyright holders (individuals or organizations)
 should be listed with a '' in the first column. People who have
 contributed from an organization can be listed under the organization
 that actually holds the copyright for their contributions (see the
 Gates Foundation organization for an example). Those individuals should have
 their names indented and be marked with a '-'. Email address can be added
 optionally within square brackets <email>.

 * Gates Foundation
 - Name Surname <name.surname@gatesfoundation.com>

 * Arg Software
 - José Antunes <jose.antunes@arg.software>
 - Rui Rocha <rui.rocha@arg.software>

 --------------
**/

"use strict";


import { 
    TransfersBCUnknownErrorEvent,
    TransfersBCUnknownErrorPayload,
    TransferInvalidMessagePayloadEvt,
    TransferInvalidMessagePayloadEvtPayload,
    TransferInvalidMessageTypeEvt,
    TransferInvalidMessageTypeEvtPayload,
    TransferPrepareInvalidPayerCheckFailedEvt, 
    TransferPrepareInvalidPayerCheckFailedPayload, 
    TransferPrepareInvalidPayeeCheckFailedEvt, 
    TransferPrepareInvalidPayeeCheckFailedPayload,
    TransferPrepareLiquidityCheckFailedEvt,
    TransferPrepareLiquidityCheckFailedPayload,
    TransferPrepareRequestTimedoutEvt,
    TransferPrepareRequestTimedoutEvtPayload,
    TransferFulfilCommittedRequestedTimedoutEvt,
    TransferFulfilCommittedRequestedTimedoutEvtPayload,
    TransferFulfilPostCommittedRequestedTimedoutEvt,
    TransferFulfilPostCommittedRequestedTimedoutEvtPayload,
    TransferQueryInvalidPayerCheckFailedEvt,
    TransferQueryInvalidPayerCheckFailedEvtPayload,
    TransferQueryInvalidPayeeCheckFailedEvt,
    TransferQueryInvalidPayeeCheckFailedEvtPayload,
    TransferQueryPayerNotFoundFailedEvt,
    TransferQueryPayerNotFoundFailedEvtPayload,
    TransferQueryPayeeNotFoundFailedEvt,
    TransferQueryPayeeNotFoundFailedEvtPayload,
    TransferQueryInvalidPayerParticipantIdEvt,
    TransferQueryInvalidPayerParticipantIdEvtPayload,
    TransferQueryInvalidPayeeParticipantIdEvt,
    TransferQueryInvalidPayeeParticipantIdEvtPayload,
    TransferUnableToGetTransferByIdEvt,
    TransferUnableToGetTransferByIdEvtPayload,
    TransferNotFoundEvt,
    TransferNotFoundEvtPayload,
    TransferUnableToAddEvt,
    TransferUnableToAddEvtPayload,
    TransferUnableToUpdateEvt,
    TransferUnableToUpdateEvtPayload,
    TransferPrepareDuplicateCheckFailedEvt,
    TransferPrepareDuplicateCheckFailedEvtPayload,
    TransferCancelReservationAndCommitFailedEvt,
    TransferCancelReservationAndCommitFailedEvtPayload,
    TransferPreparePayerNotFoundFailedEvt,
    TransferPreparePayerNotFoundFailedEvtPayload,
    TransferPreparePayeeNotFoundFailedEvt,
    TransferPreparePayeeNotFoundFailedEvtPayload,
    TransferPrepareHubNotFoundFailedEvt,
    TransferPrepareHubNotFoundFailedEvtPayload,
    TransferPrepareHubAccountNotFoundFailedEvt,
    TransferPrepareHubAccountNotFoundFailedEvtPayload,
    TransferPreparePayerPositionAccountNotFoundFailedEvt,
    TransferPreparePayerPositionAccountNotFoundFailedEvtPayload,
    TransferPreparePayerLiquidityAccountNotFoundFailedEvt,
    TransferPreparePayerLiquidityAccountNotFoundFailedEvtPayload,
    TransferPreparePayeePositionAccountNotFoundFailedEvt,
    TransferPreparePayeePositionAccountNotFoundFailedEvtPayload,
    TransferPreparePayeeLiquidityAccountNotFoundFailedEvt,
    TransferPreparePayeeLiquidityAccountNotFoundFailedEvtPayload
} from "@mojaloop/platform-shared-lib-public-messages-lib";
import { ParticipantHubNotFoundError, ParticipantPayeeNotFoundError, ParticipantPayerNotFoundError } from "./errors";

export function createUnknownErrorEvent(errorDescription:string, fspId:string, transferId:string): TransfersBCUnknownErrorEvent{
    const unknownErrorPayload: TransfersBCUnknownErrorPayload = {
        transferId,
        fspId,
        errorDescription
    };
    const errorEvent = new TransfersBCUnknownErrorEvent(unknownErrorPayload);
    return errorEvent;
}

export function createInvalidMessagePayloadErrorEvent(errorDescription:string, fspId:string, transferId: string ): TransferInvalidMessagePayloadEvt {
    const invalidMessagePayload: TransferInvalidMessagePayloadEvtPayload = {
        transferId,
        fspId,
        errorDescription
    };
    const errorEvent = new TransferInvalidMessagePayloadEvt(invalidMessagePayload);
    return errorEvent;
}

export function createInvalidMessageTypeErrorEvent(errorDescription:string, fspId:string, transferId: string): TransferInvalidMessageTypeEvt{
    const invalidMessageType: TransferInvalidMessageTypeEvtPayload = {
        transferId,
        fspId,
        errorDescription
    };
    const errorEvent = new TransferInvalidMessageTypeEvt(invalidMessageType);
    return errorEvent;
}

export function createParticipantPayerInvalidErrorEvent(errorDescription:string, transferId: string, fspId: string): TransferPrepareInvalidPayerCheckFailedEvt {
    const invalidPayerParticipantErrorPayload: TransferPrepareInvalidPayerCheckFailedPayload = {
        transferId,
        fspId,
        errorDescription
    };
    const errorEvent = new TransferPrepareInvalidPayerCheckFailedEvt(invalidPayerParticipantErrorPayload);
    return errorEvent;
}

export function createParticipantPayeeInvalidErrorEvent(errorDescription:string, transferId: string, fspId: string): TransferPrepareInvalidPayeeCheckFailedEvt {
    const invalidPayerParticipantErrorPayload: TransferPrepareInvalidPayeeCheckFailedPayload = {
        transferId,
        fspId,
        errorDescription
    };
    const errorEvent = new TransferPrepareInvalidPayeeCheckFailedEvt(invalidPayerParticipantErrorPayload);
    return errorEvent;
}

export function createLiquidityCheckFailedErrorEvent(errorDescription:string, transferId: string, fspId: string): TransferPrepareLiquidityCheckFailedEvt {
    const invalidPayerParticipantErrorPayload: TransferPrepareLiquidityCheckFailedPayload = {
        transferId,
        fspId,
        errorDescription
    };
    const errorEvent = new TransferPrepareInvalidPayeeCheckFailedEvt(invalidPayerParticipantErrorPayload);
    return errorEvent;
}

export function createTransferPrepareTimedoutErrorEvent(errorDescription:string, transferId: string, fspId: string): TransferPrepareRequestTimedoutEvt {
    const transferPrepareTimedoutErrorPayload: TransferPrepareRequestTimedoutEvtPayload = {
        transferId,
        fspId,
        errorDescription
    };
    const errorEvent = new TransferPrepareRequestTimedoutEvt(transferPrepareTimedoutErrorPayload);
    return errorEvent;
}

export function createTransferPreCommittedTimedoutErrorEvent(errorDescription:string, transferId: string, fspId: string): TransferFulfilCommittedRequestedTimedoutEvt {
    const transferPrepareTimedoutErrorPayload: TransferFulfilCommittedRequestedTimedoutEvtPayload = {
        transferId,
        fspId,
        errorDescription
    };
    const errorEvent = new TransferFulfilCommittedRequestedTimedoutEvt(transferPrepareTimedoutErrorPayload);
    return errorEvent;
}

export function createTransferPostCommittedTimedoutErrorEvent(errorDescription:string, transferId: string, fspId: string): TransferFulfilPostCommittedRequestedTimedoutEvt {
    const transferPrepareTimedoutErrorPayload: TransferFulfilPostCommittedRequestedTimedoutEvtPayload = {
        transferId,
        fspId,
        errorDescription
    };
    const errorEvent = new TransferFulfilPostCommittedRequestedTimedoutEvt(transferPrepareTimedoutErrorPayload);
    return errorEvent;
}

export function createTransferQueryParticipantPayerInvalidErrorEvent(errorDescription:string, transferId: string, fspId: string|null): TransferQueryInvalidPayerCheckFailedEvt {
    const invalidPayerParticipantErrorPayload: TransferQueryInvalidPayerCheckFailedEvtPayload = {
        transferId,
        fspId,
        errorDescription
    };
    const errorEvent = new TransferQueryInvalidPayerCheckFailedEvt(invalidPayerParticipantErrorPayload);
    return errorEvent;
}

export function createTransferQueryParticipantPayeeInvalidErrorEvent(errorDescription:string, transferId: string, fspId: string|null): TransferQueryInvalidPayeeCheckFailedEvt {
    const invalidPayerParticipantErrorPayload: TransferQueryInvalidPayeeCheckFailedEvtPayload = {
        transferId,
        fspId,
        errorDescription
    };
    const errorEvent = new TransferQueryInvalidPayeeCheckFailedEvt(invalidPayerParticipantErrorPayload);
    return errorEvent;
}

export function createPayerParticipantNotFoundErrorEvent(errorDescription:string, transferId: string, fspId: string): TransferQueryPayerNotFoundFailedEvt {
    const payerParticipantNotFoundErrorPayload: TransferQueryPayerNotFoundFailedEvtPayload = {
        transferId,
        fspId,
        errorDescription
    };
    const errorEvent = new TransferQueryPayerNotFoundFailedEvt(payerParticipantNotFoundErrorPayload);
    return errorEvent;
}

export function createPayeeParticipantNotFoundErrorEvent(errorDescription:string, transferId: string, fspId: string): TransferQueryPayeeNotFoundFailedEvt {
    const payeeParticipantNotFoundErrorPayload: TransferQueryPayeeNotFoundFailedEvtPayload = {
        transferId,
        fspId,
        errorDescription
    };
    const errorEvent = new TransferQueryPayeeNotFoundFailedEvt(payeeParticipantNotFoundErrorPayload);
    return errorEvent;
}

export function createInvalidPayerParticipantIdErrorEvent(errorDescription:string, transferId: string, fspId: string): TransferQueryInvalidPayerParticipantIdEvt {
    const invalidPayerParticipantIdErrorPayload: TransferQueryInvalidPayerParticipantIdEvtPayload = {
        transferId,
        fspId,
        errorDescription
    };
    const errorEvent = new TransferQueryInvalidPayerParticipantIdEvt(invalidPayerParticipantIdErrorPayload);
    return errorEvent;
}

export function createInvalidPayeeParticipantIdErrorEvent(errorDescription:string, transferId: string, fspId: string): TransferQueryInvalidPayeeParticipantIdEvt {
    const invalidPayeeParticipantIdErrorPayload: TransferQueryInvalidPayeeParticipantIdEvtPayload = {
        transferId,
        fspId,
        errorDescription
    };
    const errorEvent = new TransferQueryInvalidPayeeParticipantIdEvt(invalidPayeeParticipantIdErrorPayload);
    return errorEvent;
}

export function createUnableToGetTransferByIdErrorEvent(errorDescription:string, transferId:string, fspId:string): TransferUnableToGetTransferByIdEvt {
    const unableToGetParticipantFspIdErrorPayload: TransferUnableToGetTransferByIdEvtPayload = {
        transferId,
        fspId,
        errorDescription
    };
    const errorEvent = new TransferUnableToGetTransferByIdEvt(unableToGetParticipantFspIdErrorPayload);
    return errorEvent;
}

export function createTransferNotFoundErrorEvent(errorDescription:string, transferId:string, fspId:string): TransferNotFoundEvt {
    const unableToGetParticipantFspIdErrorPayload: TransferNotFoundEvtPayload = {
        transferId,
        fspId,
        errorDescription
    };
    const errorEvent = new TransferNotFoundEvt(unableToGetParticipantFspIdErrorPayload);
    return errorEvent;
}

export function createUnableToAddTransferToDatabaseErrorEvent(errorDescription:string, transferId:string, fspId:string): TransferUnableToAddEvt {
    const unableToAddTransferErrorPayload: TransferUnableToAddEvtPayload = {
        transferId,
        fspId,
        errorDescription
    };
    const errorEvent = new TransferUnableToAddEvt(unableToAddTransferErrorPayload);
    return errorEvent;
}

export function createUnableToUpdateTransferInDatabaseErrorEvent(errorDescription:string, transferId:string, fspId:string): TransferUnableToUpdateEvt {
    const unableToUpdateTransferErrorPayload: TransferUnableToUpdateEvtPayload = {
        transferId,
        fspId,
        errorDescription
    };
    const errorEvent = new TransferUnableToUpdateEvt(unableToUpdateTransferErrorPayload);
    return errorEvent;
}

export function createTransferDuplicateCheckFailedErrorEvent(errorDescription:string, transferId:string, fspId:string): TransferPrepareDuplicateCheckFailedEvt {
    const duplicateCheckFailedErrorPayload: TransferPrepareDuplicateCheckFailedEvtPayload = {
        transferId,
        fspId,
        errorDescription
    };
    const errorEvent = new TransferPrepareDuplicateCheckFailedEvt(duplicateCheckFailedErrorPayload);
    return errorEvent;
}

export function createUnableToCancelReservationAndCommitErrorEvent(errorDescription:string, transferId:string, fspId:string): TransferCancelReservationAndCommitFailedEvt {
    const duplicateCheckFailedErrorPayload: TransferCancelReservationAndCommitFailedEvtPayload = {
        transferId,
        fspId,
        errorDescription
    };
    const errorEvent = new TransferCancelReservationAndCommitFailedEvt(duplicateCheckFailedErrorPayload);
    return errorEvent;
}

export function createPreparePayerParticipantNotFoundErrorEvent(errorDescription:string, transferId: string, fspId: string): TransferPreparePayerNotFoundFailedEvt {
    const payerParticipantNotFoundErrorPayload: TransferPreparePayerNotFoundFailedEvtPayload = {
        transferId,
        fspId,
        errorDescription
    };
    const errorEvent = new TransferPreparePayerNotFoundFailedEvt(payerParticipantNotFoundErrorPayload);
    return errorEvent;
}

export function createPreparePayeeParticipantNotFoundErrorEvent(errorDescription:string, transferId: string, fspId: string): TransferPreparePayeeNotFoundFailedEvt {
    const payeeParticipantNotFoundErrorPayload: TransferPreparePayeeNotFoundFailedEvtPayload = {
        transferId,
        fspId,
        errorDescription
    };
    const errorEvent = new TransferPreparePayeeNotFoundFailedEvt(payeeParticipantNotFoundErrorPayload);
    return errorEvent;
}

export function createPrepareHubParticipantNotFoundErrorEvent(errorDescription:string, transferId: string, fspId: string): TransferPrepareHubNotFoundFailedEvt {
    const hubParticipantNotFoundErrorPayload: TransferPrepareHubNotFoundFailedEvtPayload = {
        transferId,
        fspId,
        errorDescription
    };
    const errorEvent = new TransferPrepareHubNotFoundFailedEvt(hubParticipantNotFoundErrorPayload);
    return errorEvent;
}

export function createPrepareHubParticipantAccountNotFoundErrorEvent(errorDescription:string, transferId: string, fspId: string): TransferPrepareHubAccountNotFoundFailedEvt {
    const hubParticipantAccountNotFoundErrorPayload: TransferPrepareHubAccountNotFoundFailedEvtPayload = {
        transferId,
        fspId,
        errorDescription
    };
    const errorEvent = new TransferPrepareHubAccountNotFoundFailedEvt(hubParticipantAccountNotFoundErrorPayload);
    return errorEvent;
}

export function createPreparePayerParticipantPositionAccountNotFoundErrorEvent(errorDescription:string, transferId: string, fspId: string): TransferPreparePayerPositionAccountNotFoundFailedEvt {
    const payerParticipantLiquidityAccountNotFoundErrorPayload: TransferPreparePayerPositionAccountNotFoundFailedEvtPayload = {
        transferId,
        fspId,
        errorDescription
    };
    const errorEvent = new TransferPreparePayerPositionAccountNotFoundFailedEvt(payerParticipantLiquidityAccountNotFoundErrorPayload);
    return errorEvent;
}

export function createPreparePayerParticipantLiquidityAccountNotFoundErrorEvent(errorDescription:string, transferId: string, fspId: string): TransferPreparePayerLiquidityAccountNotFoundFailedEvt {
    const payerParticipantLiquidityAccountNotFoundErrorPayload: TransferPreparePayerLiquidityAccountNotFoundFailedEvtPayload = {
        transferId,
        fspId,
        errorDescription
    };
    const errorEvent = new TransferPreparePayerLiquidityAccountNotFoundFailedEvt(payerParticipantLiquidityAccountNotFoundErrorPayload);
    return errorEvent;
}

export function createPreparePayeeParticipantPositionAccountNotFoundErrorEvent(errorDescription:string, transferId: string, fspId: string): TransferPreparePayeePositionAccountNotFoundFailedEvt {
    const payeeParticipantLiquidityAccountNotFoundErrorPayload: TransferPreparePayeePositionAccountNotFoundFailedEvtPayload = {
        transferId,
        fspId,
        errorDescription
    };
    const errorEvent = new TransferPreparePayeePositionAccountNotFoundFailedEvt(payeeParticipantLiquidityAccountNotFoundErrorPayload);
    return errorEvent;
}

export function createPreparePayeeParticipantLiquidityAccountNotFoundErrorEvent(errorDescription:string, transferId: string, fspId: string): TransferPreparePayeeLiquidityAccountNotFoundFailedEvt {
    const payeeParticipantLiquidityAccountNotFoundErrorPayload: TransferPreparePayeeLiquidityAccountNotFoundFailedEvtPayload = {
        transferId,
        fspId,
        errorDescription
    };
    const errorEvent = new TransferPreparePayeeLiquidityAccountNotFoundFailedEvt(payeeParticipantLiquidityAccountNotFoundErrorPayload);
    return errorEvent;
}

