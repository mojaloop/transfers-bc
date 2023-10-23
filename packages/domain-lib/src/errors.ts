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

// Transfer
export class TransferNotFoundError extends Error {
    constructor(message?: string) {
        super(message || "Transfer not found");
    }
}

export class CheckLiquidityAndReserveFailedError extends Error{
    constructor(message?: string) {
        super(message || "Check liquidity and reserve failed");
    }
}

export class UnableToCancelTransferError extends Error {
    constructor(message?: string) {
        super(message || "Unable to cancel transfer");
    }
}

// Account
export class HubAccountNotFoundError extends Error {
    constructor(message?: string) {
        super(message || "Hub account not found");
    }
}
export class PayerPositionAccountNotFoundError extends Error {
    constructor(message?: string) {
        super(message || "Payer position account not found");
    }
}
export class PayerLiquidityAccountNotFoundError extends Error {
    constructor(message?: string) {
        super(message || "Payer liquidity account not found");
    }
}
export class PayeePositionAccountNotFoundError extends Error {
    constructor(message?: string) {
        super(message || "Payee position account not found");
    }
}
export class PayeeLiquidityAccountNotFoundError extends Error {
    constructor(message?: string) {
        super(message || "Payee liquidity account not found");
    }
}


// Message Producer
export class InvalidMessagePayloadError extends Error {
    constructor(message?: string) {
        super(message || "Invalid message payload");
    }
}
export class InvalidMessageTypeError extends Error {
    constructor(message?: string) {
        super(message || "Invalid message type");
    }
}

// Participant Adapter
export class HubNotFoundError extends Error {
    constructor(message?: string) {
        super(message || "Hub not found");
    }
}

export class PayerParticipantNotFoundError extends Error {
    constructor(message?: string) {
        super(message || "Payer participant not found");
    }
}

export class PayeeParticipantNotFoundError extends Error {
    constructor(message?: string) {
        super(message || "Payee participant not found");
    }
}


export class RequiredParticipantIsNotActive extends Error {
    constructor(message?: string) {
        super(message || "Participant is not active");
    }
}
