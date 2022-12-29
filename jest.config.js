module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/test/**/*.test.ts'],
  coveragePathIgnorePatterns: ['test'],
  watchPathIgnorePatterns: ['.*.js$'],
  transform: {
    "^.+\\.tsx?$": "es-jest"
  },
}
