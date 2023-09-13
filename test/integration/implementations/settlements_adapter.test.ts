import { ILogger, ConsoleLogger, LogLevel } from "@mojaloop/logging-bc-public-types-lib";
import { SettlementsAdapter } from "../../../packages/implementations-lib/src";
import { IAuthenticatedHttpRequester } from "@mojaloop/security-bc-public-types-lib";
import { AuthenticatedHttpRequester } from "@mojaloop/security-bc-client-lib";
import { DEFAULT_SETTLEMENT_MODEL_ID } from "@mojaloop/settlements-bc-public-types-lib";

// Logger
const logger: ILogger = new ConsoleLogger();
logger.setLogLevel(LogLevel.FATAL);

// Auth N constants
const AUTH_N_SVC_BASEURL = process.env["AUTH_N_SVC_BASEURL"] || "http://localhost:3201";
const AUTH_N_SVC_TOKEN_URL = AUTH_N_SVC_BASEURL + "/token";

const SVC_CLIENT_ID = process.env["SVC_CLIENT_ID"] || "transfers-bc-command-handler-svc";
const SVC_CLIENT_SECRET = process.env["SVC_CLIENT_ID"] || "superServiceSecret";

let settlementAdapter: SettlementsAdapter;
const SETTLEMENTS_SVC_URL = process.env["SETTLEMENTS_SVC_URL"] || "http://localhost:3600";


describe("Implementations - Settlements Adapter Integration tests", () => {
    beforeAll(async () => {
        const authRequester: IAuthenticatedHttpRequester = new AuthenticatedHttpRequester(logger, AUTH_N_SVC_TOKEN_URL);
        authRequester.setAppCredentials(SVC_CLIENT_ID, SVC_CLIENT_SECRET);
		settlementAdapter = new SettlementsAdapter(logger, SETTLEMENTS_SVC_URL, authRequester);
    });

    test("should be able to get a settlement model id", async () => {
        // Arrange
        const transferAmount = "3000";
        const payerCurrency = "USD";
        const payeeCurrency = "USD";
        const extensionList = [{ key: "key", value: "value" }];

        // Act
        const modelId = await settlementAdapter.getSettlementModelId(transferAmount, payerCurrency, payeeCurrency, extensionList);

        // Assert
        expect(modelId).toEqual(DEFAULT_SETTLEMENT_MODEL_ID);
    });
});


