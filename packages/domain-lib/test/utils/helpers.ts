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

import { CommandMsg, MessageTypes } from "@mojaloop/platform-shared-lib-messaging-types-lib";
import { TransferPreparedEvtPayload, TransferFulfiledEvtPayload } from "@mojaloop/platform-shared-lib-public-messages-lib";
import { ITransfer } from "@mojaloop/transfers-bc-public-types-lib";

export function createTransferPreparedEvtPayload(mockedTransfer: ITransfer): TransferPreparedEvtPayload {
    return {
        transferId: mockedTransfer.transferId,
        payeeFsp: mockedTransfer.payeeFspId,
        payerFsp: mockedTransfer.payerFspId,
        amount: mockedTransfer.amount,
        currencyCode: mockedTransfer.currencyCode,
        ilpPacket: mockedTransfer.ilpPacket,
        condition: mockedTransfer.condition,
        expiration: mockedTransfer.expirationTimestamp,
        settlementModel: mockedTransfer.settlementModel, 
        extensionList: mockedTransfer.extensionList,
        preparedAt: Date.now()
    };
}

export function createTransferFulfiledEvtPayload(mockedTransfer: ITransfer): TransferFulfiledEvtPayload {
    return {
        transferId: mockedTransfer.transferId,
        fulfilment: mockedTransfer.fulfilment,
        completedTimestamp: mockedTransfer.completedTimestamp as number,
        extensionList: mockedTransfer.extensionList,
        payeeFspId: mockedTransfer.payeeFspId,
        payerFspId: mockedTransfer.payerFspId,
        amount: mockedTransfer.amount,
        currencyCode: mockedTransfer.currencyCode,
        settlementModel: mockedTransfer.settlementModel,
        notifyPayee: false,
        fulfiledAt: Date.now()
    };
}

export function createCommand(payload: object|null, messageName: string|null, fspiopOpaqueState: object|null, msgType: MessageTypes = MessageTypes.COMMAND): CommandMsg {
    return {
        fspiopOpaqueState,
        msgId: "fake msg id",
        msgKey: "fake msg key",
        msgTopic: "fake msg topic",
        msgName: messageName as string,
        msgOffset: 0,
        msgPartition: 0,
        msgTimestamp: 0,
        msgType: msgType,
        payload,
        aggregateId: "1",
        boundedContextName: "transfers",
        tracingInfo: "123",
        validatePayload: () => { return; }
    };
}