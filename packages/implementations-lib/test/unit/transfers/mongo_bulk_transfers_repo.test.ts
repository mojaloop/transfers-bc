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
import { MongoBulkTransfersRepo } from "../../../src/transfers/mongo_bulk_transfers_repo";
import { ConsoleLogger, ILogger, LogLevel } from "@mojaloop/logging-bc-public-types-lib";
import { 
    BulkTransferAlreadyExistsError,
    BulkTransferNotFoundError,
    UnableToAddBulkTransferError,
    UnableToCloseDatabaseConnectionError,
    UnableToGetBulkTransferError,
    UnableToInitBulkTransferRegistryError,
    UnableToUpdateBulkTransferError 
} from "../../../src/errors";
import { IBulkTransfer } from "@mojaloop/transfers-bc-public-types-lib";
import { mockedBulkTransfer1, mockedBulkTransfer2 } from "@mojaloop/transfers-bc-shared-mocks-lib";


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

describe("Implementations - Mongo Bulk Transfers Repo Unit Tests", () => {
    let mongoBulkTransfersRepo: MongoBulkTransfersRepo;

    beforeEach(async () => {
        jest.clearAllMocks();

        mongoBulkTransfersRepo = new MongoBulkTransfersRepo(logger, connectionString, dbName);

        await mongoBulkTransfersRepo.init();

    });

    it('should initialize the MongoDB connection and transfers collection', async () => {
        // Arrange
        await mongoBulkTransfersRepo.init();

        // Act & Assert
        expect(MongoClient).toHaveBeenCalledWith(connectionString);
        expect(mongoCollectionSpy).toHaveBeenCalledWith('bulk_transfers');
    });

    it('should throw an error if unable to connect to the database', async () => {
        // Arrange
        mongoConnectSpy.mockImplementationOnce(() => { throw new Error(); })

        // Act & Assert
        await expect(mongoBulkTransfersRepo.init()).rejects.toThrow(UnableToInitBulkTransferRegistryError);
    });

    it('should close the database connection', async () => {
        // Act
        await mongoBulkTransfersRepo.destroy();

        // Assert
        expect(mongoCloseSpy).toHaveBeenCalledTimes(1);
    });

    it('should throw UnableToCloseDatabaseConnectionError when encountering an error during closing', async () => {
        // Arrange
        const errorMessage = 'Closing error';

        mongoCloseSpy.mockRejectedValueOnce(new Error(errorMessage));

        // Act & Assert
        await expect(mongoBulkTransfersRepo.destroy()).rejects.toThrow(UnableToCloseDatabaseConnectionError);
    });

    it('should return the bulk transfer when it exists', async () => {
        // Arrange
        const bulkTransferId = '123';
        const bulkTransfer = mockedBulkTransfer1;

        mongoFindOneSpy.mockResolvedValueOnce(bulkTransfer);

        // Act
        const result = await mongoBulkTransfersRepo.getBulkTransferById(bulkTransferId);

        // Assert
        expect(mongoFindOneSpy).toHaveBeenCalledWith({ bulkTransferId });
        expect(result).toEqual(bulkTransfer);
    });

    it('should return null when the bulk transfer does not exist', async () => {
        // Arrange
        const bulkTransferId = '123';

        mongoFindOneSpy.mockResolvedValueOnce(null);

        // Act
        const result = await mongoBulkTransfersRepo.getBulkTransferById(bulkTransferId);

        // Assert
        expect(mongoFindOneSpy).toHaveBeenCalledWith({ bulkTransferId });
        expect(result).toBeNull();
    });

    it('should throw UnableToGetBulkTransferError when encountering an error during retrieval', async () => {
        // Arrange
        const bulkTransferId = '123';
        const errorMessage = 'Retrieval error';

        mongoFindOneSpy.mockRejectedValueOnce(new Error(errorMessage));

        // Act
        await expect(mongoBulkTransfersRepo.getBulkTransferById(bulkTransferId)).rejects.toThrow(UnableToGetBulkTransferError);

        // Assert
        expect(mongoFindOneSpy).toHaveBeenCalledWith({ bulkTransferId });
    });

    it('should return bulk transfers when they exist', async () => {
        // Arrange
        const bulkTransfers: IBulkTransfer[] = [
            mockedBulkTransfer1,
            mockedBulkTransfer2
        ];

        mongoToArraySpy.mockResolvedValueOnce(bulkTransfers);

        // Act
        const result = await mongoBulkTransfersRepo.getBulkTransfers();

        // Assert
        expect(mongoFindSpy).toHaveBeenCalledWith({});
        expect(mongoToArraySpy).toHaveBeenCalledTimes(1);
        expect(result).toEqual(bulkTransfers);
    });

    it('should throw UnableToGetBulkTransferError when encountering an error during retrieval', async () => {
        // Arrange
        const errorMessage = 'Retrieval error';

        mongoToArraySpy.mockRejectedValueOnce(new Error(errorMessage));

        // Act
        await expect(mongoBulkTransfersRepo.getBulkTransfers()).rejects.toThrow(UnableToGetBulkTransferError);

        // Assert
        expect(mongoFindSpy).toHaveBeenCalledWith({});
        expect(mongoToArraySpy).toHaveBeenCalledTimes(1);
    });

    it('should add a bulk transfer and return its ID', async () => {
        // Arrange
        const bulkTransfer: IBulkTransfer = mockedBulkTransfer1;

        mongoFindOneSpy.mockResolvedValueOnce(null);
        mongoInsertOneSpy.mockResolvedValueOnce({ insertedId: bulkTransfer.bulkTransferId });

        // Act
        const result = await mongoBulkTransfersRepo.addBulkTransfer(bulkTransfer);

        // Assert
        expect(mongoFindOneSpy).toHaveBeenCalledWith({ bulkTransferId: bulkTransfer.bulkTransferId });
        expect(mongoInsertOneSpy).toHaveBeenCalledWith(bulkTransfer);
        expect(result).toEqual(bulkTransfer.bulkTransferId);
    });

    it('should throw BulkTransferAlreadyExistsError when the bulk transfer already exists', async () => {
        // Arrange
        const bulkTransfer: IBulkTransfer = mockedBulkTransfer1;

        mongoFindOneSpy.mockResolvedValueOnce({ bulkTransferId: bulkTransfer.bulkTransferId });

        // Act & Assert
        await expect(mongoBulkTransfersRepo.addBulkTransfer(bulkTransfer)).rejects.toThrow(BulkTransferAlreadyExistsError);

        expect(mongoFindOneSpy).toHaveBeenCalledWith({ bulkTransferId: bulkTransfer.bulkTransferId });
        expect(mongoInsertOneSpy).not.toHaveBeenCalled();
    });

    it('should throw UnableToAddBulkTransferError when encountering an error during insertion', async () => {
        // Arrange
        const bulkTransfer: IBulkTransfer = mockedBulkTransfer1;

        const errorMessage = 'Insertion error';
        mongoFindOneSpy.mockResolvedValueOnce(null); // Simulate bulk transfer not existing
        mongoInsertOneSpy.mockRejectedValueOnce(new Error(errorMessage));

        // Act & Assert
        await expect(mongoBulkTransfersRepo.addBulkTransfer(bulkTransfer)).rejects.toThrow(UnableToAddBulkTransferError);

        expect(mongoFindOneSpy).toHaveBeenCalledWith({ bulkTransferId: bulkTransfer.bulkTransferId });
        expect(mongoInsertOneSpy).toHaveBeenCalledWith(bulkTransfer);
    });

    it('should update an existing bulk transfer', async () => {
        // Arrange
        const bulkTransferId = '1';
        const bulkTransfer: IBulkTransfer = mockedBulkTransfer1;

        const existingBulkTransfer: IBulkTransfer = mockedBulkTransfer1;

        mongoFindOneSpy.mockResolvedValueOnce(existingBulkTransfer);
        mongoUpdateOneSpy.mockResolvedValueOnce({});

        // Act
        await mongoBulkTransfersRepo.updateBulkTransfer(bulkTransfer);

        // Assert
        expect(mongoFindOneSpy).toHaveBeenCalledWith({ bulkTransferId });
        expect(mongoUpdateOneSpy).toHaveBeenCalledWith(
            { bulkTransferId },
            { $set: bulkTransfer }
        );
    });

    it('should throw BulkTransferNotFoundError when the bulk transfer does not exist', async () => {
        // Arrange
        const bulkTransferId = '1';
        const bulkTransfer: IBulkTransfer = mockedBulkTransfer1;

        mongoFindOneSpy.mockResolvedValueOnce(null);

        // Act & Assert
        await expect(mongoBulkTransfersRepo.updateBulkTransfer(bulkTransfer)).rejects.toThrow(BulkTransferNotFoundError);

        expect(mongoFindOneSpy).toHaveBeenCalledWith({ bulkTransferId });
        expect(mongoUpdateOneSpy).not.toHaveBeenCalled();
    });

    it('should throw UnableToUpdateBulkTransferError when encountering an error during update', async () => {
        // Arrange
        const bulkTransferId = '1';
        const bulkTransfer: IBulkTransfer = mockedBulkTransfer1;

        const errorMessage = 'Update error';
        const existingBulkTransfer: IBulkTransfer = mockedBulkTransfer1;

        mongoFindOneSpy.mockResolvedValueOnce(existingBulkTransfer);
        mongoUpdateOneSpy.mockRejectedValueOnce(new Error(errorMessage));

        // Act & Assert
        await expect(mongoBulkTransfersRepo.updateBulkTransfer(bulkTransfer)).rejects.toThrow(UnableToUpdateBulkTransferError);

        expect(mongoFindOneSpy).toHaveBeenCalledWith({ bulkTransferId });
        expect(mongoUpdateOneSpy).toHaveBeenCalledWith(
            { bulkTransferId },
            { $set: bulkTransfer }
        );
    });

});