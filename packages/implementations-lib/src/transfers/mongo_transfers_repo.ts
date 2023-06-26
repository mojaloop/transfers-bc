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

import { Collection, Document, MongoClient, WithId } from 'mongodb';
import { ILogger } from '@mojaloop/logging-bc-public-types-lib';
import { ITransfersRepository, ITransfer } from "@mojaloop/transfers-bc-domain-lib";
import { TransferAlreadyExistsError, UnableToCloseDatabaseConnectionError, UnableToGetTransferError, UnableToInitTransferRegistryError, UnableToAddTransferError, NoSuchTransferError, UnableToUpdateTransferError, UnableToAddManyTransfersError, UnableToDeleteTransferError } from '../errors';
import { randomUUID } from 'crypto';

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

            await this.transfers.createIndex({"transferId": 1}, {unique: true});
		} catch (e: unknown) {
			this._logger.error(`Unable to connect to the database: ${(e as Error).message}`);
			throw new UnableToInitTransferRegistryError();
		}
	}

	async destroy(): Promise<void> {
		try{
			await this.mongoClient.close();
		}
		catch(e: unknown){
			this._logger.error(`Unable to close the database connection: ${(e as Error).message}`);
			throw new UnableToCloseDatabaseConnectionError();
		}
	}

	async addTransfer(transfer: ITransfer): Promise<string> {
		const transferToAdd = {...transfer};
		if(transferToAdd.transferId){
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
		const deleteResult = await this.transfers.deleteOne({transferId}).catch((e: unknown) => {
			this._logger.error(`Unable to delete transfer: ${(e as Error).message}`);
			throw new UnableToDeleteTransferError();
		});

		if(deleteResult.deletedCount == 1){
			return;
		}
		else{
			throw new NoSuchTransferError();
		}
	}

	async getTransferById(transferId:string):Promise<ITransfer|null>{
		const transfer = await this.transfers.findOne({transferId: transferId }).catch((e: unknown) => {
			this._logger.error(`Unable to get transfer by id: ${(e as Error).message}`);
			throw new UnableToGetTransferError();
		});

		if(!transfer){
			return null;
		}
		return this.mapToTransfer(transfer);
	}

	async getTransfers():Promise<ITransfer[]>{
		const transfers = await this.transfers.find(
			{},
			{sort:["updatedAt", "desc"], projection: {_id: 0}}
		).toArray().catch((e: unknown) => {
			this._logger.error(`Unable to get transfers: ${(e as Error).message}`);
			throw new UnableToGetTransferError();
		});

		const mappedTransfers = transfers.map(this.mapToTransfer);

		return mappedTransfers;
	}

	async searchTransfers(
		state?:string,
		currencyCode?:string,
		startDate?:number,
		endDate?:number,
		id?:string
	):Promise<ITransfer[]>{
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const filter:any = {$and:[]};
		if(id){
			filter.$and.push({"transferId": {"$regex": id, "$options": "i"}});
		}
		if(currencyCode){
			filter.$and.push({currencyCode: currencyCode});
		}
		if(startDate){
			filter.$and.push({updatedAt: {$gte:startDate}});
		}
		if(endDate){
			filter.$and.push({updatedAt: {$lte:endDate}});
		}
		if(state){
			filter.$and.push({transferState: state});
		}

		const transfers = await this.transfers.find(
			filter,
			{sort:["updatedAt", "desc"], projection: {_id: 0}}
		).toArray().catch((e: unknown) => {
			this._logger.error(`Unable to get transfers: ${(e as Error).message}`);
			throw new UnableToGetTransferError();
		});

		const mappedTransfers = transfers.map(this.mapToTransfer);

		return mappedTransfers;
	}

	async addTransfers(transfers: ITransfer[]): Promise<void> {
		const transfersToAdd = transfers.map(transfer => {
			return {...transfer, transferId: transfer.transferId || randomUUID()};
		});

		// Check if any of the transfers already exists
		for await (const transfer of transfersToAdd){
			await this.checkIfTransferExists(transfer);
		}

		await this.transfers.insertMany(transfersToAdd).catch((e: unknown) => {
			this._logger.error(`Unable to insert many transfers: ${(e as Error).message}`);
			throw new UnableToAddManyTransfersError();
		});
	}

    async storeTransfers(transfers:ITransfer[]):Promise<void>{
        const operations = transfers.map(value=>{
            return {
                replaceOne: {
                    filter: {transferId: value.transferId},
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
            this._logger.error(error);
            throw error;
        }
    }

	async updateTransfer(transfer: ITransfer): Promise<void> {
		const existingTransfer = await this.getTransferById(transfer.transferId);

		if(!existingTransfer || !existingTransfer.transferId) {
			throw new NoSuchTransferError();
		}

		const updatedTransfer: ITransfer = {...existingTransfer, ...transfer};
		updatedTransfer.transferId = existingTransfer.transferId;

		await this.transfers.updateOne({transferId: transfer.transferId, }, { $set: updatedTransfer }).catch((e: unknown) => {
			this._logger.error(`Unable to insert transfer: ${(e as Error).message}`);
			throw new UnableToUpdateTransferError();
		});
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

	private mapToTransfer(transfer: WithId<Document>): ITransfer {
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
			errorInformation: transfer.errorInformation ?? null
		};

		return transferMapped;
	}
}
