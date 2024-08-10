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

import {Collection, Db, Document, MongoClient, WithId} from "mongodb";
import { ILogger } from "@mojaloop/logging-bc-public-types-lib";
import {
    BulkTransferAlreadyExistsError,
    UnableToCloseDatabaseConnectionError,
    UnableToInitBulkTransferRegistryError,
    UnableToGetBulkTransferError,
    UnableToAddBulkTransferError,
    UnableToUpdateBulkTransferError,
    BulkTransferNotFoundError,
} from "../errors";
import { IBulkTransfersRepository } from "@mojaloop/transfers-bc-domain-lib";
import { IBulkTransfer } from "@mojaloop/transfers-bc-public-types-lib";

const DB_NAME: string = "transfers";
const COLLECTION_NAME: string = "bulk_transfers";

export class MongoBulkTransfersRepo implements IBulkTransfersRepository {
    private readonly _logger: ILogger;
    private readonly _connectionString: string;
    private _mongoClient: MongoClient;
    private _bulkTransfersCollection: Collection;

    constructor(logger: ILogger, connectionString: string) {
        this._logger = logger.createChild(this.constructor.name);
        this._connectionString = connectionString;
    }

    async init(): Promise<void> {
        this._logger.info(`Initializing ${this.constructor.name}...`);
        try {
            this._mongoClient = new MongoClient(this._connectionString);
            await this._mongoClient.connect();

            const db: Db = this._mongoClient.db(DB_NAME);

            // Check if the collection already exists.
            const collections: any[] = await db.listCollections().toArray();
            const collectionExists: boolean = collections.some((collection) => {
                return collection.name === COLLECTION_NAME;
            });

            if (collectionExists) {
                this._bulkTransfersCollection = db.collection(COLLECTION_NAME);
            }else{
                this._bulkTransfersCollection = await db.createCollection(COLLECTION_NAME);
                //await this._bulkTransfersCollection.createIndex({"transferBulkId": 1}, {unique: true});
            }
        } catch (e: unknown) {
            this._logger.error(
                `Unable to connect to the database: ${(e as Error).message}`
            );
            throw new UnableToInitBulkTransferRegistryError(
                "Unable to connect to the database"
            );
        }
        this._logger.info(`${this.constructor.name} initialized`);
    }

    async destroy(): Promise<void> {
        try {
            await this._mongoClient.close();
        } catch (e: unknown) {
            this._logger.error(
                `Unable to close the database connection: ${
                    (e as Error).message
                }`
            );
            throw new UnableToCloseDatabaseConnectionError(
                "Unable to close the database connection"
            );
        }
    }

    async getBulkTransferById(bulkTransferId: string): Promise<IBulkTransfer | null> {
        const bulkTransfer = await this._bulkTransfersCollection
            .findOne({ bulkTransferId: bulkTransferId })
            .catch((e: unknown) => {
                this._logger.error(
                    `Unable to get bulkTransfer by id: ${(e as Error).message}`
                );
                throw new UnableToGetBulkTransferError(
                    "Unable to get bulkTransfer by id"
                );
            });
        if (!bulkTransfer) {
            return null;
        }
        return this.mapToBulkTransfer(bulkTransfer);
    }

    async getBulkTransfers(): Promise<IBulkTransfer[]> {
        const bulkTransfers = await this._bulkTransfersCollection
            .find({})
            .toArray()
            .catch((e: unknown) => {
                this._logger.error(
                    `Unable to get bulkTransfers: ${(e as Error).message}`
                );
                throw new UnableToGetBulkTransferError("Unable to get bulkTransfers");
            });

        const mappedBulkTransfers: IBulkTransfer[] = [];
        for (const bulkTransfer of bulkTransfers) {
            mappedBulkTransfers.push(this.mapToBulkTransfer(bulkTransfer));
        }

        return mappedBulkTransfers;
    }

    async addBulkTransfer(bulkTransfer: IBulkTransfer): Promise<string> {
        const bulkTransferToAdd = { ...bulkTransfer };

        if (bulkTransferToAdd.bulkTransferId) {
            await this.checkIfBulkTransferExists(bulkTransferToAdd);
        }

        await this._bulkTransfersCollection.insertOne(bulkTransferToAdd).catch((e: unknown) => {
            this._logger.error(
                `Unable to insert bulkTransfer: ${(e as Error).message}`
            );
            throw new UnableToAddBulkTransferError("Unable to add bulkTransfer");
        });

        return bulkTransferToAdd.bulkTransferId;
    }

    async updateBulkTransfer(bulkTransfer: IBulkTransfer): Promise<void> {
        const existingBulkTransfer = await this.getBulkTransferById(
            bulkTransfer.bulkTransferId
        );

        if (!existingBulkTransfer || !existingBulkTransfer.bulkTransferId) {
            throw new BulkTransferNotFoundError(
                "Unable to find bulkTransfer to update"
            );
        }

        const updatedTransfer: IBulkTransfer = { ...existingBulkTransfer, ...bulkTransfer };
        updatedTransfer.bulkTransferId = existingBulkTransfer.bulkTransferId;

        await this._bulkTransfersCollection
            .updateOne(
                { bulkTransferId: bulkTransfer.bulkTransferId },
                { $set: updatedTransfer }
            )
            .catch((e: unknown) => {
                this._logger.error(
                    `Unable to insert bulkTransfer: ${(e as Error).message}`
                );
                throw new UnableToUpdateBulkTransferError(
                    "Unable to update bulkTransfer"
                );
            });
    }

    private async checkIfBulkTransferExists(bulkTransfer: IBulkTransfer) {
        const transferAlreadyPresent: WithId<Document> | null =
            await this._bulkTransfersCollection
                .findOne({
                    bulkTransferId: bulkTransfer.bulkTransferId,
                })
                .catch((e: unknown) => {
                    this._logger.error(
                        `Unable to add bulk bulkTransfer: ${(e as Error).message}`
                    );
                    throw new UnableToGetBulkTransferError(
                        "Unable to get bulkTransfer"
                    );
                });

        if (transferAlreadyPresent) {
            throw new BulkTransferAlreadyExistsError("BulkTransfer already exists");
        }
    }

    private mapToBulkTransfer(bulkTransfer: WithId<Document>): IBulkTransfer {
        const bulkTransferMapped: IBulkTransfer = {
            createdAt: bulkTransfer.createdAt ?? null,
			updatedAt: bulkTransfer.updatedAt ?? null,
            bulkTransferId: bulkTransfer.bulkTransferId ?? null,
            bulkQuoteId: bulkTransfer.bulkQuoteId ?? null,
            payerFsp: bulkTransfer.payerFsp ?? null,
            payeeFsp: bulkTransfer.payeeFsp ?? null,
            expiration: bulkTransfer.expiration ?? null,
            extensionList: bulkTransfer.extensionList ?? null,
            individualTransfers: bulkTransfer.individualTransfers ?? [],
            transfersPreparedProcessedIds: bulkTransfer.transfersPreparedProcessedIds ?? [],
            transfersNotProcessedIds: bulkTransfer.transfersNotProcessedIds ?? [],
            transfersFulfiledProcessedIds: bulkTransfer.transfersFulfiledProcessedIds ?? [],
            status: bulkTransfer.status ?? null,
            completedTimestamp: bulkTransfer.completedTimestamp ?? null,
            errorCode: bulkTransfer.errorInformation ?? null
        };
        return bulkTransferMapped;
    }
}
