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

import express from "express";
import {ILogger} from "@mojaloop/logging-bc-public-types-lib";
import {ITransfersRepository, TransfersPrivileges} from "@mojaloop/transfers-bc-domain-lib";
import {
    ForbiddenError,
    UnauthorizedError,
    CallSecurityContext, IAuthorizationClient,
} from "@mojaloop/security-bc-public-types-lib";
import {TokenHelper} from "@mojaloop/security-bc-client-lib";
import { BaseRoutes } from "./base/base_routes";

// TODO: remove esling disable
/* eslint-disable */

// Extend express request to include our security fields
declare module "express-serve-static-core" {
    export interface Request {
        securityContext: null | CallSecurityContext;
    }
}

export class TransferAdminExpressRoutes extends BaseRoutes {


    constructor(logger: ILogger, repo: ITransfersRepository, tokenHelper: TokenHelper, authorizationClient: IAuthorizationClient) {
        super(authorizationClient, repo, logger, tokenHelper);
        this.logger.createChild(this.constructor.name);


        this.mainRouter.get("/transfers/:id", this.getTransferById.bind(this));
        this.mainRouter.get("/transfers", this.getAllTransfers.bind(this));
    }

    private async getAllTransfers(req: express.Request, res: express.Response) {
        try {
            this._enforcePrivilege(req.securityContext!, TransfersPrivileges.VIEW_ALL_TRANSFERS);

            const id = req.query.id as string;
            const state = req.query.state as string;
            const startDateStr = req.query.startDate as string || req.query.startdate as string;
            const startDate = startDateStr ? parseInt(startDateStr) : undefined;
            const endDateStr = req.query.endDate as string || req.query.enddate as string;
            const endDate = endDateStr ? parseInt(endDateStr) : undefined;
            const currencyCode = req.query.currencyCode as string || req.query.currencycode as string;

            this.logger.debug("Fetching all transfers");

            let fetched = [];
            if (!id && !state && !startDate && !endDate && !currencyCode) {
                fetched = await this.transfersRepo.getTransfers();
            } else {
                fetched = await this.transfersRepo.searchTransfers(state, currencyCode, startDate, endDate, id);
            }
            res.send(fetched);
        } catch (err: any) {
            if (this._handleUnauthorizedError(err, res)) return;

            this.logger.error(err);
            res.status(500).json({
                status: "error",
                msg: (err as Error).message,
            });
        }
    }

    private async getTransferById(req: express.Request, res: express.Response) {
        try {
            this._enforcePrivilege(req.securityContext!, TransfersPrivileges.VIEW_ALL_TRANSFERS);

            const id = req.params["id"] ?? null;
            this.logger.debug("Fetching transfer by id " + id);

            const fetched = await this.transfersRepo.getTransferById(id);

            if (fetched) {
                res.send(fetched);
                return;
            }

            res.status(404).json({
                status: "error",
                msg: "Transfer not found",
            });
        } catch (err: any) {
            if (this._handleUnauthorizedError(err, res)) return;

            this.logger.error(err);
            res.status(500).json({
                status: "error",
                msg: (err as Error).message,
            });
        }
    }
}
