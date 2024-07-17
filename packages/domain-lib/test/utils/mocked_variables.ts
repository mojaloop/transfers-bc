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

import { ConsoleLogger, ILogger, LogLevel } from "@mojaloop/logging-bc-public-types-lib";
import { IMessageProducer } from "@mojaloop/platform-shared-lib-messaging-types-lib";
import { MemoryTransferRepo, MemoryBulkTransferRepo, MemoryMessageProducer, MemoryParticipantService, MemoryAccountsAndBalancesService, MemorySettlementsService, MemorySchedulingService, MemoryInteropValidator } from "@mojaloop/transfers-bc-shared-mocks-lib";
import { ITransfersRepository, IParticipantsServiceAdapter, IAccountsBalancesAdapter, ISettlementsServiceAdapter, ISchedulingServiceAdapter, IBulkTransfersRepository, IInteropFspiopValidator } from "@mojaloop/transfers-bc-domain-lib";

const logger: ILogger = new ConsoleLogger();
logger.setLogLevel(LogLevel.FATAL);

const transfersRepo: ITransfersRepository = new MemoryTransferRepo(logger);

const bulkTransfersRepo: IBulkTransfersRepository = new MemoryBulkTransferRepo(logger);

const messageProducer: IMessageProducer = new MemoryMessageProducer(logger);

const participantService: IParticipantsServiceAdapter = new MemoryParticipantService(logger);

const accountsAndBalancesService: IAccountsBalancesAdapter = new MemoryAccountsAndBalancesService(logger);

const settlementsService: ISettlementsServiceAdapter = new MemorySettlementsService(logger);

const schedulingService: ISchedulingServiceAdapter = new MemorySchedulingService(logger);

const interopFspiopValidator: IInteropFspiopValidator = new MemoryInteropValidator(logger);

export {
    logger,
    transfersRepo,
    bulkTransfersRepo,
    messageProducer,
    participantService,
    accountsAndBalancesService,
    settlementsService,
    schedulingService,
    interopFspiopValidator
};