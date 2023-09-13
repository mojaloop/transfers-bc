import { ILogger, ConsoleLogger, LogLevel } from "@mojaloop/logging-bc-public-types-lib";
import { ParticipantAdapter } from "../../../packages/implementations-lib/src";
import { IAuthenticatedHttpRequester } from "@mojaloop/security-bc-public-types-lib";
import { AuthenticatedHttpRequester } from "@mojaloop/security-bc-client-lib";

// Logger
const logger: ILogger = new ConsoleLogger();
logger.setLogLevel(LogLevel.FATAL);

// Auth N constants
const AUTH_N_SVC_BASEURL = process.env["AUTH_N_SVC_BASEURL"] || "http://localhost:3201";
const AUTH_N_SVC_TOKEN_URL = AUTH_N_SVC_BASEURL + "/token";

const SVC_CLIENT_ID = process.env["SVC_CLIENT_ID"] || "transfers-bc-command-handler-svc";
const SVC_CLIENT_SECRET = process.env["SVC_CLIENT_ID"] || "superServiceSecret";

let participantAdapter: ParticipantAdapter;
const PARTICIPANTS_SVC_URL: string = process.env["PARTICIPANTS_SVC_URL"] || "http://localhost:3010";
const PARTICIPANTS_CLIENT_CACHE_MS: number = 10_000;


describe("Implementations - Participant Adapter Integration tests", () => {
    beforeAll(async () => {
        const authRequester: IAuthenticatedHttpRequester = new AuthenticatedHttpRequester(logger, AUTH_N_SVC_TOKEN_URL);
        authRequester.setAppCredentials(SVC_CLIENT_ID, SVC_CLIENT_SECRET);
		participantAdapter = new ParticipantAdapter(logger, PARTICIPANTS_SVC_URL, authRequester, PARTICIPANTS_CLIENT_CACHE_MS);
    });

    test("should be able to get a participant by id", async () => {
        // Arrange
        const fspId = "hub"; // Hub's id

        // Act
        const participant = await participantAdapter.getParticipantInfo(fspId);

        // Assert
        expect(participant).toBeDefined();
        expect(participant?.id).toEqual(fspId);
    });

    test("should be able to get an array of participants by ids", async () => {
        // Arrange
        const fspId1 = "hub";
        const fspIdArr = [fspId1];

        // Act
        const participantArr = await participantAdapter.getParticipantsInfo(fspIdArr);

        // Assert
        expect(participantArr).toBeDefined();
        expect(participantArr).toHaveLength(1);
        if (participantArr) {
            expect(participantArr[0].id).toEqual(fspId1);
        }
    });
});