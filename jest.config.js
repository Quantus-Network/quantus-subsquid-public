module.exports = {
    testEnvironment: "node",
    maxWorkers: 1,
    preset: "ts-jest",
    transform: {
        "^.+\\.ts$": ["ts-jest", {
            tsconfig: {
                allowJs: true,
            },
        }],
    },
    transformIgnorePatterns: [
        "node_modules/(?!(@polkadot|@subsquid|bn\\.js)/)",
    ],
    testMatch: ["**/?(*.)+(spec|test).ts?(x)"],
    moduleFileExtensions: ["ts", "js", "json", "node"],
    roots: ["<rootDir>/src"],
    moduleNameMapper: {
        "^(\\.{1,2}/.*)\\.js$": "$1",
    },
};
