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
 
import { MongoClient } from "mongodb";
import { MongoTransfersRepo } from "../../../src/transfers/mongo_transfers_repo";
import { ConsoleLogger, ILogger, LogLevel } from "@mojaloop/logging-bc-public-types-lib";
import { TransferAlreadyExistsError,
    NoSuchTransferError,
    UnableToAddTransferError,
    UnableToBulkInsertTransfersError,
    UnableToCloseDatabaseConnectionError,
    UnableToDeleteTransferError,
    UnableToGetTransferError,
    UnableToInitTransferRegistryError,
    UnableToSearchTransfers,
    UnableToUpdateTransferError 
} from "../../../src/errors";
import { ITransfer, TransfersSearchResults } from "@mojaloop/transfers-bc-public-types-lib";
import { mockedTransfer1, mockedTransfer2, mockedTransfer5 } from "@mojaloop/transfers-bc-shared-mocks-lib";


const logger: ILogger = new ConsoleLogger();
logger.setLogLevel(LogLevel.FATAL);


const mongoConnectSpy = jest.fn();
const mongoCloseSpy = jest.fn();
const mongoFindOneSpy = jest.fn();
const mongoInsertOneSpy = jest.fn();
const mongoInsertManySpy = jest.fn();
const mongoBulkWriteSpy = jest.fn();
const mongoUpdateOneSpy = jest.fn();
const mongoDeleteOneSpy = jest.fn();
const mongoToArraySpy = jest.fn();
const mongoFindSpy = jest.fn().mockImplementation(() => ({
    toArray: mongoToArraySpy,
}))
const mongoCountDocumentsSpy = jest.fn();
const mongoAggregateSpy = jest.fn();
const mongoCreateIndexSpy = jest.fn();

const mongoCollectionSpy = jest.fn().mockImplementation(() => ({
    findOne: mongoFindOneSpy,
    insertOne: mongoInsertOneSpy,
    insertMany: mongoInsertManySpy,
    bulkWrite: mongoBulkWriteSpy,
    updateOne: mongoUpdateOneSpy,
    deleteOne: mongoDeleteOneSpy,
    find: mongoFindSpy,
    countDocuments: mongoCountDocumentsSpy,
    aggregate: mongoAggregateSpy,
    createIndex: mongoCreateIndexSpy
}));

jest.mock('mongodb', () => {
    const mockCollection = jest.fn().mockImplementation(() => ({
        findOne: mongoFindOneSpy
    }));

    return {
        MongoClient: jest.fn().mockImplementation(() => ({
            connect: mongoConnectSpy,
            close: mongoCloseSpy,
            db: jest.fn().mockImplementation(() => ({
                collection: mongoCollectionSpy
            })),
        })),
        Collection: mockCollection,
    };
});
 
  
const connectionString = 'mongodb://localhost:27017';
const dbName = 'testDB';

describe("Implementations - Mongo Transfers Repo Unit Tests", () => {
    let mongoTransfersRepo: MongoTransfersRepo;

    beforeEach(async () => {
        jest.clearAllMocks();

        mongoTransfersRepo = new MongoTransfersRepo(logger, connectionString, dbName);

        await mongoTransfersRepo.init();

    });

    it('should initialize the MongoDB connection and transfers collection', async () => {
        // Act 
        await mongoTransfersRepo.init();

        // Assert
        expect(MongoClient).toHaveBeenCalledWith(connectionString);
        expect(mongoCollectionSpy).toHaveBeenCalledWith('transfers');
    });

    it('should close the database connection', async () => {
        // Act
        await mongoTransfersRepo.destroy();

        // Assert
        expect(mongoCloseSpy).toHaveBeenCalledTimes(1);
    });

    it('should throw UnableToCloseDatabaseConnectionError when encountering an error during closing', async () => {
        // Arrange
        const errorMessage = 'Closing error';

        mongoCloseSpy.mockRejectedValueOnce(new Error(errorMessage));

        // Act & Assert
        await expect(mongoTransfersRepo.destroy()).rejects.toThrow(UnableToCloseDatabaseConnectionError);

    });

    it('should throw an error if unable to connect to the database', async () => {
        // Arrange
        mongoConnectSpy.mockImplementationOnce(() => { throw new Error(); })

        // Act & Assert
        await expect(mongoTransfersRepo.init()).rejects.toThrow(UnableToInitTransferRegistryError);
    });

    it('should add a new transfer successfully', async () => {
        // Arrange
        const transfer = mockedTransfer1;

        mongoFindOneSpy.mockResolvedValueOnce(null);
        mongoInsertOneSpy.mockResolvedValueOnce({});

        // Act
        const addedTransferId = await mongoTransfersRepo.addTransfer(transfer);

        // Assert
        expect(mongoFindOneSpy).toHaveBeenCalledWith({ transferId: mockedTransfer1.transferId });
        expect(mongoInsertOneSpy).toHaveBeenCalledWith(transfer);
        expect(addedTransferId).toBe(mockedTransfer1.transferId);
    });

    it('should throw TransferAlreadyExistsError when attempting to add an existing transfer', async () => {
        // Arrange
        const transfer: ITransfer = mockedTransfer1;

        mongoFindOneSpy.mockResolvedValueOnce({});

        // Act
        await expect(mongoTransfersRepo.addTransfer(transfer)).rejects.toThrow(TransferAlreadyExistsError);

        // Assert
        expect(mongoFindOneSpy).toHaveBeenCalledWith({ transferId: transfer.transferId });
        expect(mongoInsertOneSpy).not.toHaveBeenCalled();
    });

    it('should throw UnableToAddTransferError when encountering an error during insertion', async () => {
        // Arrange
        const transfer: ITransfer = mockedTransfer1;

        const errorMessage = 'Insertion error';
        mongoFindOneSpy.mockResolvedValueOnce(null);
        mongoInsertOneSpy.mockRejectedValueOnce(new Error(errorMessage));

        // Act & Assert
        await expect(mongoTransfersRepo.addTransfer(transfer)).rejects.toThrow(UnableToAddTransferError);

        expect(mongoFindOneSpy).toHaveBeenCalledWith({ transferId: transfer.transferId });
        expect(mongoInsertOneSpy).toHaveBeenCalledWith(transfer);
    });

    it('should throw UnableToGetTransferError when encountering an error while checking if transfer exists', async () => {
        // Arrange
        const transfer: ITransfer = mockedTransfer1;

        const errorMessage = 'Find error';
        mongoFindOneSpy.mockRejectedValueOnce(new Error(errorMessage));

        // Act & Assert
        await expect(mongoTransfersRepo.addTransfer(transfer)).rejects.toThrow(UnableToGetTransferError);

        expect(mongoFindOneSpy).toHaveBeenCalledWith({ transferId: transfer.transferId });
        expect(mongoInsertOneSpy).not.toHaveBeenCalled();
    });

    it('should store transfers successfully', async () => {
        // Arrange
        const transfers: ITransfer[] = [
            mockedTransfer1,
            mockedTransfer2
        ];

        const bulkWriteResult = {
            upsertedCount: transfers.length,
            modifiedCount: 0,
        };

        mongoBulkWriteSpy.mockResolvedValueOnce(bulkWriteResult);

        // Act
        await mongoTransfersRepo.storeTransfers(transfers);

        const expectedOperations = transfers.map((transfer) => ({
            replaceOne: {
                filter: { transferId: transfer.transferId },
                replacement: transfer,
                upsert: true,
            },
        }));

        // Assert
        expect(mongoBulkWriteSpy).toHaveBeenCalledWith(expectedOperations);
    });

    it('should throw UnableToStoreTransfersError when encountering an error during storage', async () => {
        // Arrange
        const transfers: ITransfer[] = [
            mockedTransfer1
        ];

        const errorMessage = 'Storage error';
        mongoBulkWriteSpy.mockRejectedValueOnce(new Error(errorMessage));

        // Act & Assert
        await expect(mongoTransfersRepo.storeTransfers(transfers)).rejects.toThrow(UnableToBulkInsertTransfersError);

        expect(mongoBulkWriteSpy).toHaveBeenCalledWith(expect.any(Array));
    });

    it('should throw UnableToStoreTransfersError when the number of responses does not match the number of transfers', async () => {
        // Arrange
        const transfers: ITransfer[] = [
            mockedTransfer1
        ];

        const bulkWriteResult = {
            upsertedCount: 2,
            modifiedCount: 0,
        };

        mongoBulkWriteSpy.mockResolvedValueOnce(bulkWriteResult);

        // Act & Assert
        await expect(mongoTransfersRepo.storeTransfers(transfers)).rejects.toThrow(UnableToBulkInsertTransfersError);

        expect(mongoBulkWriteSpy).toHaveBeenCalledWith(expect.any(Array));
    });

    it('should update an existing transfer successfully', async () => {
        // Arrange
        const transfer: ITransfer = mockedTransfer1;

        const existingTransfer: ITransfer = mockedTransfer1;

        mongoUpdateOneSpy.mockResolvedValueOnce({});

        mongoTransfersRepo.getTransferById = jest.fn().mockResolvedValueOnce(existingTransfer);

        // Act
        await mongoTransfersRepo.updateTransfer(transfer);

        // Assert
        expect(mongoTransfersRepo.getTransferById).toHaveBeenCalledWith(transfer.transferId);
        expect(mongoUpdateOneSpy).toHaveBeenCalledWith({ transferId: transfer.transferId }, { $set: transfer });
    });

    it('should throw NoSuchTransferError when the transfer does not exist', async () => {
        // Arrange
        const transfer: ITransfer = mockedTransfer1;

        mongoTransfersRepo.getTransferById = jest.fn().mockResolvedValueOnce(null);

        // Act
        await expect(mongoTransfersRepo.updateTransfer(transfer)).rejects.toThrow(NoSuchTransferError);

        // Assert
        expect(mongoTransfersRepo.getTransferById).toHaveBeenCalledWith(transfer.transferId);
        expect(mongoUpdateOneSpy).not.toHaveBeenCalled();
    });

    it('should throw UnableToUpdateTransferError when encountering an error during update', async () => {
        // Arrange
        const transfer: ITransfer = mockedTransfer1;

        const errorMessage = 'Update error';
        mongoUpdateOneSpy.mockRejectedValueOnce(new Error(errorMessage));

        mongoTransfersRepo.getTransferById = jest.fn().mockResolvedValueOnce(transfer);

        // Act & Assert
        await expect(mongoTransfersRepo.updateTransfer(transfer)).rejects.toThrow(UnableToUpdateTransferError);

        expect(mongoTransfersRepo.getTransferById).toHaveBeenCalledWith(transfer.transferId);
        expect(mongoUpdateOneSpy).toHaveBeenCalledWith({ transferId: transfer.transferId }, { $set: transfer });
    });


    it('should remove an existing transfer successfully', async () => {
        // Arrange
        const transferId = '123';

        const deleteResult = {
            deletedCount: 1,
        };

        mongoDeleteOneSpy.mockResolvedValueOnce(deleteResult);

        // Act
        await mongoTransfersRepo.removeTransfer(transferId);

        // Assert
        expect(mongoDeleteOneSpy).toHaveBeenCalledWith({ transferId });
    });

    it('should throw NoSuchTransferError when the transfer does not exist', async () => {
        // Arrange
        const transferId = '123';

        const deleteResult = {
            deletedCount: 0,
        };

        mongoDeleteOneSpy.mockResolvedValueOnce(deleteResult);

        // Act & Assert
        await expect(mongoTransfersRepo.removeTransfer(transferId)).rejects.toThrow(NoSuchTransferError);

        expect(mongoDeleteOneSpy).toHaveBeenCalledWith({ transferId });
    });

    it('should throw UnableToDeleteTransferError when encountering an error during deletion', async () => {
        // Arrange
        const transferId = '123';

        const errorMessage = 'Deletion error';
        mongoDeleteOneSpy.mockRejectedValueOnce(new Error(errorMessage));

        // Act & Assert
        await expect(mongoTransfersRepo.removeTransfer(transferId)).rejects.toThrow(UnableToDeleteTransferError);

        expect(mongoDeleteOneSpy).toHaveBeenCalledWith({ transferId });
    });

    it('should return the transfer when it exists', async () => {
        // Arrange
        const transferId = '123';

        const transferData = mockedTransfer5;

        mongoFindOneSpy.mockResolvedValueOnce(transferData);

        // Act
        const transfer = await mongoTransfersRepo.getTransferById(transferId);

        // Assert
        expect(mongoFindOneSpy).toHaveBeenCalledWith({ transferId });
        expect(transfer).toEqual(transferData);
    });

    it('should return null when the transfer does not exist', async () => {
        // Arrange
        const transferId = '123';

        mongoFindOneSpy.mockResolvedValueOnce(null);

        // Act
        const transfer = await mongoTransfersRepo.getTransferById(transferId);

        // Assert
        expect(mongoFindOneSpy).toHaveBeenCalledWith({ transferId });
        expect(transfer).toBeNull();
    });

    it('should throw UnableToGetTransferError when encountering an error during retrieval', async () => {
        // Arrange
        const transferId = '123';

        const errorMessage = 'Retrieval error';
        mongoFindOneSpy.mockRejectedValueOnce(new Error(errorMessage));

        // Act & Assert
        await expect(mongoTransfersRepo.getTransferById(transferId)).rejects.toThrow(UnableToGetTransferError);

        expect(mongoFindOneSpy).toHaveBeenCalledWith({ transferId });
    });

    it('should return transfers when they exist for a given bulk transfer ID', async () => {
        // Arrange
        const bulkTransferId = 'bulk123';

        const transfer1 = {
            ...mockedTransfer5,
            bulkTransferId,
        };

        const transfer2 = {
            ...mockedTransfer5,
            bulkTransferId,
        };

        const transfersData = [transfer1, transfer2];

        mongoToArraySpy.mockResolvedValueOnce(transfersData);

        // Act
        const transfers = await mongoTransfersRepo.getTransfersByBulkId(bulkTransferId);

        // Assert
        expect(mongoFindSpy).toHaveBeenCalledWith({ bulkTransferId });
        expect(transfers).toEqual(transfersData);
    });

    it('should throw UnableToGetTransferError when encountering an error during retrieval', async () => {
        // Arrange
        const bulkTransferId = 'bulk123';

        const errorMessage = 'Retrieval error';
        mongoToArraySpy.mockRejectedValueOnce(new Error(errorMessage));

        // Act
        await expect(mongoTransfersRepo.getTransfersByBulkId(bulkTransferId)).rejects.toThrow(UnableToGetTransferError);

        // Assert
        expect(mongoFindSpy).toHaveBeenCalledWith({ bulkTransferId });
    });

    it('should construct the filter object correctly based on provided parameters', async () => {
        // Arrange
        const transfersData = [
            mockedTransfer1,
            mockedTransfer2,
        ];

        const countResult = 2;

        const searchResults: TransfersSearchResults = {
            pageSize: 100,
            pageIndex: 0,
            totalPages: 1,
            items: transfersData,
        };

        mongoFindSpy.mockReturnValueOnce({
            toArray: jest.fn().mockResolvedValueOnce(transfersData),
        });

        mongoCountDocumentsSpy.mockResolvedValueOnce(countResult);

        // Act
        const result = await mongoTransfersRepo.getTransfers(
            "state",
            "transferType",
            "payerIdType",
            "payeeIdType",
            "currency",
            "id",
            "payerId",
            "payeeId",
            "bulkTransferId",
            0,
            0,
        );

        // Assert
        expect(mongoFindSpy).toHaveBeenCalledWith({
            $and: [
                { transferId: { $regex: 'id', $options: 'i' } },
                { transferState: 'state' },
                { currencyCode: 'currency' },
                { payerFspId: 'payerId' },
                { payeeFspId: 'payeeId' },
                { transferType: 'transferType' },
                { payerIdType: 'payerIdType' },
                { payeeIdType: 'payeeIdType' },
                { bulkTransferId: { $regex: 'bulkTransferId', $options: 'i' } },
            ],
        },{
            limit: 100, 
            projection: {"_id": 0}, 
            skip: 0, 
            sort: [
                "updatedAt", "desc"
            ]
        });

        expect(mongoCountDocumentsSpy).toHaveBeenCalledWith({
            $and: [
                { transferId: { $regex: 'id', $options: 'i' } },
                { transferState: 'state' },
                { currencyCode: 'currency' },
                { payerFspId: 'payerId' },
                { payeeFspId: 'payeeId' },
                { transferType: 'transferType' },
                { payerIdType: 'payerIdType' },
                { payeeIdType: 'payeeIdType' },
                { bulkTransferId: { $regex: 'bulkTransferId', $options: 'i' } },
            ],
        });

        expect(result).toEqual(searchResults);
    });

    it('should handle errors during search operation', async () => {
        // Arrange
        const errorMessage = 'Search error';

        mongoFindSpy.mockReturnValueOnce({
            toArray: jest.fn().mockRejectedValueOnce(new Error(errorMessage)),
        });

        // Act & Assert
        await expect(mongoTransfersRepo.getTransfers(null, null, null, null, null, null, null, null, null, 0, 10)).rejects.toThrow(UnableToSearchTransfers);
    });

    it('should return distinct search keywords for different fields', async () => {
        // Arrange
        const transferStateResult = {
            _id: { transferState: "transferState", currencyCode: "currencyCode", transferType: "transferType", payerIdType: "payerIdType", payeeIdType: "payeeIdType" },
        };

        mongoAggregateSpy.mockReturnValueOnce({
            [Symbol.asyncIterator]: jest.fn(() => ({
                next: jest.fn()
                    .mockResolvedValueOnce({ value: transferStateResult, done: false })
                    .mockResolvedValueOnce({ done: true }), 
            })),
        });


        const expectedResponse = [
            { fieldName: 'state', distinctTerms: ['transferState'], },
            { fieldName: 'currency', distinctTerms: ['currencyCode'], },
            { fieldName: 'transferType', distinctTerms: ['transferType'], },
            { fieldName: 'payerIdType', distinctTerms: ['payerIdType'], },
            { fieldName: 'payeeIdType', distinctTerms: ['payeeIdType'], },
        ];

        // Act
        const result = await mongoTransfersRepo.getSearchKeywords();

        // Assert
        expect(result).toEqual(expectedResponse);
    });

});