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
    TransferPrepareInvalidPayerCheckFailedEvt, 
    TransferPrepareInvalidPayerCheckFailedPayload, 
    TransferPrepareInvalidPayeeCheckFailedEvt, 
    TransferPrepareInvalidPayeeCheckFailedPayload,
    TransferPrepareLiquidityCheckFailedEvt,
    TransferPrepareLiquidityCheckFailedPayload,
    TransferPrepareRequestTimedoutEvt,
    TransferPrepareRequestTimedoutEvtPayload,
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
    TransferQueryInvalidPayeeParticipantIdEvtPayload
} from "@mojaloop/platform-shared-lib-public-messages-lib";

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
