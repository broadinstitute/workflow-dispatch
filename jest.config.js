module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.ts'],
  moduleFileExtensions: ['ts', 'js'],
  clearMocks: true,
  moduleNameMapper: {
    '^@actions/github$': '<rootDir>/node_modules/@actions/github',
    '^@actions/core$': '<rootDir>/node_modules/@actions/core'
  }
};
