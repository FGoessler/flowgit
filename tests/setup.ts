// Mock @inquirer/prompts for tests
let mockAnswers: Record<string, any> = {};

jest.mock('@inquirer/prompts', () => ({
  __esModule: true,
  select: jest.fn(async (options: any) => {
    if (mockAnswers.branch !== undefined) return mockAnswers.branch;
    if (mockAnswers.choice !== undefined) return mockAnswers.choice;
    return options.choices?.[0]?.value;
  }),
  input: jest.fn(async (options: any) => {
    if (mockAnswers.message !== undefined) return mockAnswers.message;
    return '';
  }),
  confirm: jest.fn(async (options: any) => {
    if (mockAnswers.confirmed !== undefined) return mockAnswers.confirmed;
    return options.default ?? true;
  }),
  checkbox: jest.fn(async (options: any) => {
    if (mockAnswers.selected !== undefined) return mockAnswers.selected;
    return [];
  }),
  setMockAnswers: (answers: Record<string, any>) => {
    mockAnswers = answers;
  },
  clearMockAnswers: () => {
    mockAnswers = {};
  },
}));

// Keep old inquirer mock for backwards compatibility
jest.mock('inquirer', () => {
  return {
    __esModule: true,
    default: {
      prompt: jest.fn(async (questions: any) => {
        const questionArray = Array.isArray(questions) ? questions : [questions];
        const result: Record<string, any> = {};

        for (const question of questionArray) {
          const name = question.name;
          if (mockAnswers[name] !== undefined) {
            result[name] = mockAnswers[name];
          } else if (question.default !== undefined) {
            result[name] = question.default;
          } else {
            // Provide sensible defaults
            if (question.type === 'confirm') {
              result[name] = true;
            } else if (question.type === 'list') {
              result[name] = question.choices?.[0]?.value;
            } else {
              result[name] = '';
            }
          }
        }

        return result;
      }),
      setMockAnswers: (answers: Record<string, any>) => {
        mockAnswers = answers;
      },
      clearMockAnswers: () => {
        mockAnswers = {};
      },
    },
  };
});

// Mock chalk for tests (no-op colored output)
jest.mock('chalk', () => {
  const mockChalk = (text: string) => text;
  return {
    __esModule: true,
    default: new Proxy(mockChalk, {
      get: () => mockChalk,
    }),
  };
});

// Mock ora spinner for tests
jest.mock('ora', () => {
  return {
    __esModule: true,
    default: jest.fn(() => ({
      start: jest.fn().mockReturnThis(),
      succeed: jest.fn().mockReturnThis(),
      fail: jest.fn().mockReturnThis(),
      stop: jest.fn().mockReturnThis(),
      text: '',
    })),
  };
});

// Suppress console output in tests
global.console = {
  ...console,
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
};

// Mock process.exit to throw instead of exiting
const originalExit = process.exit;
process.exit = jest.fn((code?: number) => {
  throw new Error(`process.exit(${code})`);
}) as any;

// Export the mock inquirer for test access
export const getMockInquirer = () => require('inquirer').default;
