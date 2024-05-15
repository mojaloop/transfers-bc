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

// Transfers
export class UnableToAddTransferError extends Error {
    constructor(message?: string) {
        super(message || "Unable to add transfer");
    }
}
export class UnableToGetTransferError extends Error {
    constructor(message?: string) {
        super(message || "Unable to get transfer");
    }
}
export class TransferAlreadyExistsError extends Error {
    constructor(message?:string) {
        super(message || "Transfer already registered");
    }
}
export class UnableToUpdateTransferError extends Error {
    constructor(message?: string) {
        super(message || "Unable to update transfer");
    }
}
export class NoSuchTransferError extends Error {
    constructor(message?: string) {
        super(message||"No such transfer");
    }
}
export class UnableToDeleteTransferError extends Error {
    constructor(message?:string) {
        super(message || "Unable to delete transfer");
    }
}


// Database
export class UnableToCloseDatabaseConnectionError extends Error{
    constructor(message?: string) {
        super(message || "Unable to close database connection");
    }
}

export class UnableToInitTransferRegistryError extends Error {
    constructor(message?: string) {
        super(message || "Unable to initialize transfer registry");
    }
}

export class UnableToInitBulkTransferRegistryError extends Error {
    constructor(message: string) {
        super(message);
    }
}

export class UnableToSearchTransfers extends Error{
    constructor(message: string) {
        super(message);
    }
}

export class UnableToBulkInsertTransfersError extends Error{
    constructor(message: string) {
        super(message);
    }
}

// Bulk Transfers
export class UnableToAddBulkTransferError extends Error {
    constructor(message: string) {
        super(message);
    }
}

export class UnableToUpdateBulkTransferError extends Error {
    constructor(message: string) {
        super(message);
    }
}
export class BulkTransferNotFoundError extends Error {
    constructor(message: string) {
        super(message);
    }
}
export class UnableToGetBulkTransferError extends Error {
    constructor(message: string) {
        super(message);
    }
}
export class BulkTransferAlreadyExistsError extends Error {
    constructor(message:string) {
        super(message);
    }
}