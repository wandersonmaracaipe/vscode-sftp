// Integration tests run against in-process FTP/SFTP servers. They live outside
// the default `npm test` (which stays fast and dependency-light) and are run via
// `npm run test:integration`. The FTP suite needs `ftp-srv` (install on demand
// with `npm i --no-save ftp-srv`); it self-skips when it's not available.
module.exports = {
  verbose: true,
  moduleFileExtensions: ['ts', 'js'],
  transform: {
    '^.+\\.ts$': '<rootDir>/test/preprocessor.js',
  },
  testMatch: ['<rootDir>/test/integration/**/*.integration.js'],
  testTimeout: 30000,
};
