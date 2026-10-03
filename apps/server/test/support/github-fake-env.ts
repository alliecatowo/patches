/**
 * Points the GitHub device-flow config at a fixed local port, as a **side effect of import**.
 *
 * Must be the first import in any test file that needs it, before anything that transitively
 * imports `src/config/config.module.js` (`./test-server.js` → `../../src/app.module.js` →
 * `AppConfigModule`) — same ordering requirement `./env.js`'s `prepareServerEnv()` documents:
 * `ConfigModule.forRoot({ validate })` reads `process.env` when `AppConfigModule`'s own module
 * body first evaluates, not lazily per `NestFactory.createMicroservice()` call, so a later
 * `beforeAll()`-time `process.env` write is too late — ESM import order is the only lever left
 * to set a value before that happens. A fixed port (rather than a dynamically-assigned one)
 * is what makes this possible as a plain import-time assignment: nothing here can `await` a
 * `server.listen()` callback before the next import in the file starts evaluating.
 *
 * The caller (`auth-github.integration.test.ts`) is responsible for actually binding an HTTP
 * server to {@link FAKE_GITHUB_PORT} in its own `beforeAll` — this module only reserves the
 * port number and publishes it into the environment.
 */
export const FAKE_GITHUB_PORT = 18_791;
export const FAKE_GITHUB_URL = `http://127.0.0.1:${String(FAKE_GITHUB_PORT)}`;

process.env.GITHUB_CLIENT_ID = 'test-client-id';
process.env.GITHUB_DEVICE_CODE_URL = `${FAKE_GITHUB_URL}/login/device/code`;
process.env.GITHUB_TOKEN_URL = `${FAKE_GITHUB_URL}/login/oauth/access_token`;
process.env.GITHUB_USER_API_URL = `${FAKE_GITHUB_URL}/user`;
process.env.GITHUB_HTTP_TIMEOUT_MS = '2000';
