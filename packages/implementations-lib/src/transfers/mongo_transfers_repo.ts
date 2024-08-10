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
import { randomUUID } from "crypto";
import { ILogger } from "@mojaloop/logging-bc-public-types-lib";
import { ITransfersRepository,  } from "@mojaloop/transfers-bc-domain-lib";
import { ITransfer, TransfersSearchResults } from "@mojaloop/transfers-bc-public-types-lib";
import {
	TransferAlreadyExistsError,
	UnableToCloseDatabaseConnectionError,
	UnableToGetTransferError,
	UnableToInitTransferRegistryError,
	UnableToAddTransferError,
	NoSuchTransferError,
	UnableToUpdateTransferError,
	UnableToDeleteTransferError
} from "../errors";
import Redis from "ioredis";

const MAX_ENTRIES_PER_PAGE = 100;
const DB_NAME: string = "transfers";
const COLLECTION_NAME: string = "transfers";
const REDIS_BY_TRANSFERID_KEY_PREFIX = "transfersById_";
//const REDIS_BY_HASH_KEY_PREFIX = "transferByHash_";
const CACHE_TTL_SECS = 30;

export class MongoTransfersRepo implements ITransfersRepository {
	private readonly _logger: ILogger;
	private readonly _connectionString: string;
	private _mongoClient: MongoClient;
	private _transfersCollection: Collection;
    private _redisClient: Redis;
    private readonly _redisTtlSecs: number;
	constructor(
		logger: ILogger, connectionString: string,
        redisHost: string, redisPort: number, redisCacheTtlSecs = CACHE_TTL_SECS
	) {
		this._logger = logger.createChild(this.constructor.name);
		this._connectionString = connectionString;
        this._redisTtlSecs = redisCacheTtlSecs;

        this._redisClient = new Redis({
            port: redisPort,
            host: redisHost,
            lazyConnect: true
        });
	}

    private _getKeyWithPrefix (key: string): string {
        return REDIS_BY_TRANSFERID_KEY_PREFIX + key;
    }

    private async _getFromCache(id:string):Promise<ITransfer | null>{
        const itemStr = await this._redisClient.get(this._getKeyWithPrefix(id));
        if(!itemStr) return null;

        try{
            const item = JSON.parse(itemStr);
            return item;
        }catch (e) {
            this._logger.error(e);
            return null;
        }
    }

    private async _setToCache(transfer: ITransfer):Promise<void>{
        const key = this._getKeyWithPrefix(transfer.transferId);
        await this._redisClient.setex(key, this._redisTtlSecs, JSON.stringify(transfer));
    }

    private async _setToCacheMultiple(transfers: ITransfer[]):Promise<void>{
        const redisCmds = transfers.map(transfer => {
            return [
                "set",
                this._getKeyWithPrefix(transfer.transferId),
                JSON.stringify(transfer),
                this._redisTtlSecs
            ];
        });

        await this._redisClient.multi(redisCmds).exec();
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

            // collection() creates the collection if it doesn't already exist, however, it doesn't allow for a schema
            // to be passed as an argument.
            if (collectionExists) {
                this._transfersCollection = db.collection(COLLECTION_NAME);
            }else{
                this._transfersCollection = await db.createCollection(COLLECTION_NAME );
                await this._transfersCollection.createIndex({"transferId": 1}, {unique: true});
                await this._transfersCollection.createIndex({"hash": 1}, {unique: true});
            }
        } catch (e: unknown) {
            this._logger.error(`Unable to connect to the database: ${(e as Error).message}`);
            throw new UnableToInitTransferRegistryError();
        }

        try{
            await this._redisClient.connect();
            this._logger.debug("Connected to Redis successfully");
        }catch(error: unknown){
            this._logger.error(`Unable to connect to redis cache: ${(error as Error).message}`);
            throw error;
        }

        this._logger.info(`${this.constructor.name} initialized`);
    }

    async destroy(): Promise<void> {
        try {
            await this._mongoClient.close();
            this._redisClient.disconnect();
        } catch (e: unknown) {
            this._logger.error(`Unable to close the database connection: ${(e as Error).message}`);
            throw new UnableToCloseDatabaseConnectionError();
        }
    }

/*    async storeNewTransferHashIfNotDuplicate(transferId:string, transferHash:string, ttlSecs:number):Promise<undefined | string>{
        const key = `${REDIS_BY_HASH_KEY_PREFIX}${transferHash}`;

        const foundTransferId = await this._redisClient.set(key, transferId, "EX", ttlSecs, "NX", "GET");
        if(foundTransferId){
            return foundTransferId;
        }

        return undefined;
    }*/

	async getTransferById(transferId: string): Promise<ITransfer | null> {
        const found = await this._getFromCache(transferId);
        if(found) return found;

        const transferDoc = await this._transfersCollection.findOne({ transferId: transferId }).catch((e: unknown) => {
			this._logger.error(`Unable to get transfer by id: ${(e as Error).message}`);
			throw new UnableToGetTransferError();
		});

		if (!transferDoc) {
			return null;
		}

        const transfer = this._mapToTransfer(transferDoc);
        await this._setToCache(transfer);
        return transfer;
	}

/*    async getTransferByIdOrHash(transferId:string, transferHash:string):Promise<ITransfer|null>{
        const found = await this._getFromCache(transferId);
        if(found) return found;

        const transferDoc = await this._transfersCollection.findOne(
            {$or: [{ transferId: transferId }, { hash:  transferHash}]}
        ).catch((e: unknown) => {
            this._logger.error(`Unable to get transfer by id or hash: ${(e as Error).message}`);
            throw new UnableToGetTransferError();
        });

        if (!transferDoc) {
            return null;
        }

        const transfer = this._mapToTransfer(transferDoc);
        await this._setToCache(transfer);
        return transfer;
    }*/

	async getTransfers(
		state: string | null,
		transferType: string | null,
		payerIdType: string | null,
		payeeIdType: string | null,
		currency: string | null,
		id: string | null,
		payerId: string | null,
		payeeId: string | null,
		bulkTransferId: string | null,
		startDate: number,
		endDate: number,
		pageIndex = 0,
		pageSize: number = MAX_ENTRIES_PER_PAGE
	): Promise<TransfersSearchResults> {
		// make sure we don't go over or below the limits
		pageSize = Math.min(pageSize, MAX_ENTRIES_PER_PAGE);
		pageIndex = Math.max(pageIndex, 0);

		const searchResults: TransfersSearchResults = {
			pageSize: pageSize,
			pageIndex: pageIndex,
			totalPages: 0,
			items: []
		};

		let filter: any = { $and: [] }; // eslint-disable-line @typescript-eslint/no-explicit-any

		if (id) {
			filter.$and.push({ "transferId": { "$regex": id, "$options": "i" } });
		}
		if (state) {
			filter.$and.push({ transferState: state });
		}
		if (currency) {
			filter.$and.push({ currencyCode: currency });
		}
		if (startDate) {
			filter.$and.push({ updatedAt: { $gte: startDate } });
		}
		if (endDate) {
			filter.$and.push({ updatedAt: { $lte: endDate } });
		}

		if (payerId) {
			filter.$and.push({ payerFspId: payerId });
		}

		if (payeeId) {
			filter.$and.push({ payeeFspId: payeeId });
		}

		if (transferType) {
			filter.$and.push({ transferType: transferType });
		}

		if (payerIdType) {
			filter.$and.push({ payerIdType: payerIdType });
		}

		if (payeeIdType) {
			filter.$and.push({ payeeIdType: payeeIdType });
		}

		if (bulkTransferId) {
			filter.$and.push({ "bulkTransferId": { "$regex": bulkTransferId, "$options": "i" } });
		}

		if (filter.$and.length === 0) {
			filter = {};
		}

		try {
			const totalRecordsCount = await this._transfersCollection.countDocuments(filter);
			const results = await this._transfersCollection.find(
				filter,
				{
					sort: ["updatedAt", "desc"],
					projection: { _id: 0 },
					skip: Math.floor(pageIndex * pageSize),
					limit: pageSize
				}
			).toArray().catch((e: unknown) => {
				this._logger.error(`Unable to get transfers: ${(e as Error).message}`);
				throw new UnableToGetTransferError();
			});

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			searchResults.items = results as any;
			searchResults.totalPages = Math.ceil(totalRecordsCount / pageSize);

		} catch (err) {
			this._logger.error(err);
		}

		return Promise.resolve(searchResults);
	}


    async storeTransfers(transfers: ITransfer[]): Promise<void> {
        // do this in parallel because they are separate storage mechanisms
        await Promise.all([
            this._storeMultipleInMongo(transfers), this._setToCacheMultiple(transfers)
        ]);
    }

	private async _storeMultipleInMongo(transfers: ITransfer[]): Promise<void> {
		const operations = transfers.map(value => {
			return {
				replaceOne: {
					filter: { transferId: value.transferId },
					replacement: value,
					upsert: true
				}
			};
		});

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		let updateResult: any;
		try {
			updateResult = await this._transfersCollection.bulkWrite(operations);

			if ((updateResult.upsertedCount + updateResult.modifiedCount) !== transfers.length) {
				const err = new Error("Could not storeTransfers - mismatch between requests length and MongoDb response length");
				this._logger.error(err);
				throw err;
			}
		} catch (error: unknown) {
			this._logger.error(error);
			throw error;
		}
	}

    // used
	async updateTransfer(transfer: ITransfer): Promise<void> {
		const existingTransfer = await this.getTransferById(transfer.transferId);

		if (!existingTransfer || !existingTransfer.transferId) {
			throw new NoSuchTransferError();
		}

		const updatedTransfer: ITransfer = { ...existingTransfer, ...transfer };
		updatedTransfer.transferId = existingTransfer.transferId;

		await this._transfersCollection.updateOne({ transferId: transfer.transferId, }, { $set: updatedTransfer }).catch((e: unknown) => {
			this._logger.error(`Unable to insert transfer: ${(e as Error).message}`);
			throw new UnableToUpdateTransferError();
		});
	}

	async getTransfersByBulkId(bulkTransferId: string): Promise<ITransfer[]> {
		const transfers = await this._transfersCollection.find(
			{ bulkTransferId: bulkTransferId },
			{ sort: ["updatedAt", "desc"], projection: { _id: 0 } }
		).toArray().catch((e: unknown) => {
			this._logger.error(`Unable to get transfers: ${(e as Error).message}`);
			throw new UnableToGetTransferError();
		});

		const mappedTransfers = transfers.map(this._mapToTransfer);
        await this._setToCacheMultiple(mappedTransfers);
		return mappedTransfers;
	}

	private _mapToTransfer(transfer: WithId<Document>): ITransfer {
		const transferMapped: ITransfer = {
			createdAt: transfer.createdAt ?? null,
			updatedAt: transfer.updatedAt ?? null,
			transferId: transfer.transferId ?? null,
			payeeFspId: transfer.payeeFspId ?? null,
			payerFspId: transfer.payerFspId ?? null,
			amount: transfer.amount ?? null,
			currencyCode: transfer.currencyCode ?? null,
			ilpPacket: transfer.ilpPacket ?? null,
			condition: transfer.condition ?? null,
			expirationTimestamp: transfer.expirationTimestamp ?? null,
			transferState: transfer.transferState ?? null,
			fulfilment: transfer.fulfilment ?? null,
			completedTimestamp: transfer.completedTimestamp ?? null,
			extensionList: transfer.extensionList ?? null,
			settlementModel: transfer.settlementModel ?? null,
			hash: transfer.hash ?? null,
			bulkTransferId: transfer.bulkTransferId ?? null,
			payerIdType: transfer.payerIdType ?? null,
			payeeIdType: transfer.payeeIdType ?? null,
			transferType: transfer.transferType ?? null,
			errorCode: transfer.errorInformation ?? null,
		};

		return transferMapped;
	}

	async getSearchKeywords(): Promise<{ fieldName: string, distinctTerms: string[] }[]> {
		const retObj: { fieldName: string, distinctTerms: string[] }[] = [];

		try {
			const result = this._transfersCollection
				.aggregate([
					{
						$group: {
							"_id": {
								transferState: "$transferState", currencyCode: "$currencyCode",
								transferType: "$transferType", payerIdType: "$payerIdType", payeeIdType: "$payeeIdType"
							}
						}
					}
				]);

			const state: { fieldName: string, distinctTerms: string[] } = {
				fieldName: "state",
				distinctTerms: []
			};

			const currency: { fieldName: string, distinctTerms: string[] } = {
				fieldName: "currency",
				distinctTerms: []
			};

			const transferType: { fieldName: string, distinctTerms: string[] } = {
				fieldName: "transferType",
				distinctTerms: []
			};

			const payerIdType: { fieldName: string, distinctTerms: string[] } = {
				fieldName: "payerIdType",
				distinctTerms: []
			};

			const payeeIdType: { fieldName: string, distinctTerms: string[] } = {
				fieldName: "payeeIdType",
				distinctTerms: []
			};

			for await (const term of result) {

				if (!state.distinctTerms.includes(term._id.transferState)) {
					state.distinctTerms.push(term._id.transferState);
				}

				if (!currency.distinctTerms.includes(term._id.currencyCode)) {
					currency.distinctTerms.push(term._id.currencyCode);
				}

				if (!transferType.distinctTerms.includes(term._id.transferType)) {
					transferType.distinctTerms.push(term._id.transferType);
				}

				if (!payerIdType.distinctTerms.includes(term._id.payerIdType)) {
					payerIdType.distinctTerms.push(term._id.payerIdType);
				}

				if (!payeeIdType.distinctTerms.includes(term._id.payeeIdType)) {
					payeeIdType.distinctTerms.push(term._id.payeeIdType);
				}
			}

			retObj.push(state);
			retObj.push(currency);
			retObj.push(transferType);
			retObj.push(payerIdType);
			retObj.push(payeeIdType);

		} catch (err) {
			this._logger.error(err);
		}

		return Promise.resolve(retObj);
	}

}
