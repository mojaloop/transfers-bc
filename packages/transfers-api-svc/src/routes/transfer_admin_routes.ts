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
    MakerCheckerViolationError,
    UnauthorizedError,
    CallSecurityContext, IAuthorizationClient,
} from "@mojaloop/security-bc-public-types-lib";
import {TokenHelper} from "@mojaloop/security-bc-client-lib";

// Extend express request to include our security fields
declare module "express-serve-static-core" {
    export interface Request {
        securityContext: null | CallSecurityContext;
    }
}

export class TransferAdminExpressRoutes {
    private readonly _mainRouter: express.Router;
    private readonly _logger: ILogger;
    private readonly _repo: ITransfersRepository;
    private readonly _tokenHelper: TokenHelper;
    private readonly _authorizationClient: IAuthorizationClient;

    constructor(logger: ILogger, repo: ITransfersRepository, tokenHelper: TokenHelper, authorizationClient: IAuthorizationClient) {
        this._mainRouter = express.Router();
        this._logger = logger.createChild(this.constructor.name);
        this._repo = repo;
        this._tokenHelper = tokenHelper;
        this._authorizationClient = authorizationClient;

        // inject authentication - all request below this require a valid token
        this._mainRouter.use(this._authenticationMiddleware.bind(this));

        this.mainRouter.get("/transfers/:id", this.getTransferById.bind(this));
        this.mainRouter.get("/transfers", this.getAllTransfers.bind(this));
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

    private async _authenticationMiddleware(
        req: express.Request,
        res: express.Response,
        next: express.NextFunction
    ) {
        const authorizationHeader = req.headers["authorization"];

        if (!authorizationHeader) return res.sendStatus(401);

        const bearer = authorizationHeader.trim().split(" ");
        if (bearer.length != 2) {
            return res.sendStatus(401);
        }

        const bearerToken = bearer[1];
        let verified;
        try {
            verified = await this._tokenHelper.verifyToken(bearerToken);
        } catch (err) {
            this._logger.error(err, "unable to verify token");
            return res.sendStatus(401);
        }
        if (!verified) {
            return res.sendStatus(401);
        }

        const decoded = this._tokenHelper.decodeToken(bearerToken);
        if (!decoded.sub || decoded.sub.indexOf("::") == -1) {
            return res.sendStatus(401);
        }

        const subSplit = decoded.sub.split("::");
        const subjectType = subSplit[0];
        const subject = subSplit[1];

        req.securityContext = {
            accessToken: bearerToken,
            clientId: subjectType.toUpperCase().startsWith("APP") ? subject : null,
            username: subjectType.toUpperCase().startsWith("USER") ? subject : null,
            rolesIds: decoded.roles,
        };

        return next();
    }

    private _handleUnauthorizedError(err: Error, res: express.Response): boolean {
        if (err instanceof UnauthorizedError) {
            this._logger.warn(err.message);
            res.status(401).json({
                status: "error",
                msg: err.message,
            });
            return true;
        } else if (err instanceof ForbiddenError) {
            this._logger.warn(err.message);
            res.status(403).json({
                status: "error",
                msg: err.message,
            });
            return true;
        }

        return false;
    }

    private _enforcePrivilege(secCtx: CallSecurityContext, privilegeId: string): void {
        for (const roleId of secCtx.rolesIds) {
            if (this._authorizationClient.roleHasPrivilege(roleId, privilegeId)) {
                return;
            }
        }
        const error = new ForbiddenError("Caller is missing role with privilegeId: " + privilegeId);
        this._logger.isWarnEnabled() && this._logger.warn(error.message);
        throw error;
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
                fetched = await this.repo.getTransfers();
            } else {
                fetched = await this.repo.searchTransfers(state, currencyCode, startDate, endDate, id);
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

            const fetched = await this.repo.getTransferById(id);

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
