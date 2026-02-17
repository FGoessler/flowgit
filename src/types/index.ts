export interface GitStatus {
  hasChanges: boolean;
  hasStagedChanges: boolean;
  hasUnstagedChanges: boolean;
  files: GitStatusFile[];
}

export interface GitStatusFile {
  path: string;
  status: string;
  staged: boolean;
}

export interface PRInfo {
  number: number;
  title: string;
  url: string;
  state: string;
  merged: boolean;
}

export type StagingChoice = 'all' | 'select' | 'cancel';
