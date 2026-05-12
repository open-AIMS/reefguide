import { defineConfig } from 'jest';


// import { createDefaultPreset } from 'ts-jest';
// const tsJestTransformCfg = createDefaultPreset().transform;

// export default {
//   testEnvironment: 'node',
//   transform: {
//     ...tsJestTransformCfg
//   }
// }

export default defineConfig({
  preset: 'ts-jest',
  testEnvironment: 'node',
  modulePathIgnorePatterns: ['<rootDir>/build/'],
  setupFiles: ['dotenv/config'],
  // not sure if this needed anymore in Jest 30
  // https://kulshekhar.github.io/ts-jest/docs/guides/esm-support
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: 'test/tsconfig.json',
      },
    ],
  }
});
