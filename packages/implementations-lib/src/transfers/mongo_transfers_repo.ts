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

import { Collection, Document, MongoClient, WithId } from "mongodb";
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
	UnableToDeleteTransferError,
	UnableToSearchTransfers,
	UnableToBulkInsertTransfersError
} from "../errors";

const MAX_ENTRIES_PER_PAGE = 100;

export class MongoTransfersRepo implements ITransfersRepository {
	private readonly _logger: ILogger;
	private readonly _connectionString: string;
	private readonly _dbName;
	private readonly _collectionName = "transfers";
	private mongoClient: MongoClient;
	private transfers: Collection;

	constructor(
		logger: ILogger,
		connectionString: string,
		dbName: string
	) {
		this._logger = logger.createChild(this.constructor.name);
		this._connectionString = connectionString;
		this._dbName = dbName;
	}

	async init(): Promise<void> {
		try {
			this.mongoClient = new MongoClient(this._connectionString);
			await this.mongoClient.connect();
			this.transfers = this.mongoClient.db(this._dbName).collection(this._collectionName);

			await this.transfers.createIndex({ "transferId": 1 }, { unique: true });
		} catch (e: unknown) {
			this._logger.error(`Unable to connect to the database: ${(e as Error).message}`);
			throw new UnableToInitTransferRegistryError();
		}
	}

	async destroy(): Promise<void> {
		try {
			await this.mongoClient.close();
		} catch (e: unknown) {
			this._logger.error(`Unable to close the database connection: ${(e as Error).message}`);
			throw new UnableToCloseDatabaseConnectionError();
		}
	}

	async addTransfer(transfer: ITransfer): Promise<string> {
		const transferToAdd = { ...transfer };
		if (transferToAdd.transferId) {
			await this.checkIfTransferExists(transfer);
		}

		transferToAdd.transferId = transferToAdd.transferId || randomUUID();
		await this.transfers.insertOne(transferToAdd).catch((e: unknown) => {
			this._logger.error(`Unable to insert transfer: ${(e as Error).message}`);
			throw new UnableToAddTransferError();

		});

		return transferToAdd.transferId;
	}

	async removeTransfer(transferId: string): Promise<void> {
		const deleteResult = await this.transfers.deleteOne({ transferId }).catch((e: unknown) => {
			this._logger.error(`Unable to delete transfer: ${(e as Error).message}`);
			throw new UnableToDeleteTransferError();
		});

		if (deleteResult.deletedCount == 1) {
			return;
		} else {
			throw new NoSuchTransferError();
		}
	}

	async getTransferById(transferId: string): Promise<ITransfer | null> {
		const transfer = await this.transfers.findOne({ transferId: transferId }).catch((e: unknown) => {
			this._logger.error(`Unable to get transfer by id: ${(e as Error).message}`);
			throw new UnableToGetTransferError();
		});

		if (!transfer) {
			return null;
		}
		return this._mapToTransfer(transfer);
	}

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
        amount: string | null,
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

        if (amount) {
            filter.$and.push({ amount: amount });
        }

		if (filter.$and.length === 0) {
			filter = {};
		}

		try {
			const totalRecordsCount = await this.transfers.countDocuments(filter);
			const results = await this.transfers.find(
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
            throw new UnableToSearchTransfers("Unable to return transfers search");
        }


		return Promise.resolve(searchResults);
	}


	async storeTransfers(transfers: ITransfer[]): Promise<void> {
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
			updateResult = await this.transfers.bulkWrite(operations);

			if ((updateResult.upsertedCount + updateResult.modifiedCount) !== transfers.length) {
				const err = new Error("Could not storeTransfers - mismatch between requests length and MongoDb response length");
				this._logger.error(err);
				throw err;
			}
		} catch (error: unknown) {
            this._logger.error(
                `Unable to bulk insert transfers: ${(error as Error).message}`
            );
            throw new UnableToBulkInsertTransfersError(
                "Unable to bulk insert transfers"
            );
		}
	}

	async updateTransfer(transfer: ITransfer): Promise<void> {
		const existingTransfer = await this.getTransferById(transfer.transferId);

		if (!existingTransfer || !existingTransfer.transferId) {
			throw new NoSuchTransferError();
		}

		const updatedTransfer: ITransfer = { ...existingTransfer, ...transfer };
		updatedTransfer.transferId = existingTransfer.transferId;

		await this.transfers.updateOne({ transferId: transfer.transferId, }, { $set: updatedTransfer }).catch((e: unknown) => {
			this._logger.error(`Unable to insert transfer: ${(e as Error).message}`);
			throw new UnableToUpdateTransferError();
		});
	}

	async getTransfersByBulkId(bulkTransferId: string): Promise<ITransfer[]> {
        const transfers = await this.transfers
            .find({
               bulkTransferId:bulkTransferId,
            })
            .toArray()
            .catch((e: unknown) => {
                this._logger.error(
                    `Unable to get transfers by bulk transfer id: ${(e as Error).message
                    }`
                );
                throw new UnableToGetTransferError("Unable to get transfers");
            });

        const mappedTransfers = [];

        for (const transfer of transfers) {
            mappedTransfers.push(this._mapToTransfer(transfer));
        }

        return mappedTransfers;
	}

	private async checkIfTransferExists(transfer: ITransfer) {
		const transferAlreadyPresent: WithId<Document> | null = await this.transfers.findOne(
			{
				transferId: transfer.transferId
			}
		).catch((e: unknown) => {
			this._logger.error(`Unable to add transfer: ${(e as Error).message}`);
			throw new UnableToGetTransferError();
		});

		if (transferAlreadyPresent) {
			throw new TransferAlreadyExistsError();
		}
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
			expirationTimestamp: transfer.expirationTimestamp ?? null,
			transferState: transfer.transferState ?? null,
			completedTimestamp: transfer.completedTimestamp ?? null,
			settlementModel: transfer.settlementModel ?? null,
			hash: transfer.hash ?? null,
			bulkTransferId: transfer.bulkTransferId ?? null,
			payerIdType: transfer.payerIdType ?? null, 
			payeeIdType: transfer.payeeIdType ?? null,
			transferType: transfer.transferType ?? null,
			extensions: transfer.extensions ?? null,
			errorCode: transfer.errorInformation ?? null,
			// Protocol Specific
			inboundProtocolType: transfer.inboundProtocolType ?? null,
			inboundProtocolOpaqueState: transfer.inboundProtocolOpaqueState ?? null,
		};

		return transferMapped;
	}


	async getSearchKeywords(): Promise<{ fieldName: string, distinctTerms: string[] }[]> {
		const retObj: { fieldName: string, distinctTerms: string[] }[] = [];

		try {
			const result = this.transfers
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
