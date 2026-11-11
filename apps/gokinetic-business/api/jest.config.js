/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.test.ts'],
  collectCoverageFrom: ['src/**/*.ts', '!src/server.ts', '!src/db/migrate.ts', '!src/test/**'],
  coverageThreshold: {
    global: { branches: 70, functions: 75, lines: 80, statements: 80 }
  },
  clearMocks: true
};
