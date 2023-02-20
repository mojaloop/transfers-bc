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

 * Coil
 - Jason Bruwer <jason.bruwer@coil.com>

 * Crosslake
 - Pedro Sousa Barreto <pedrob@crosslaketech.com>

 * Gonçalo Garcia <goncalogarcia99@gmail.com>

 * Arg Software
 - José Antunes <jose.antunes@arg.software>
 - Rui Rocha <rui.rocha@arg.software>

 --------------
 **/

"use strict";

import {ITransfersRepository, TransfersAggregate} from "@mojaloop/transfers-bc-domain-lib";
import { ILogger } from "@mojaloop/logging-bc-public-types-lib";
import express from "express";
import { validationResult } from "express-validator";

export abstract class BaseRoutes {
  private readonly _mainRouter: express.Router;
  private readonly _logger: ILogger;
  private readonly _repo: ITransfersRepository;

  constructor(logger: ILogger, repo: ITransfersRepository) {
    this._mainRouter = express.Router();
    this._logger = logger;
    this._repo = repo;
  }

  public get logger(): ILogger {
    return this._logger;
  }

  get mainRouter(): express.Router {
    return this._mainRouter;
  }

  get repo(): ITransfersRepository {
    return this._repo;
  }

  public validateRequest(
    req: express.Request,
    res: express.Response<any, Record<string, any>>
  ): boolean {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(422).json({ errors: errors.array() });
      return false;
    }
    return true;
  }
}
