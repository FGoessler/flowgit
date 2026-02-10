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

export interface BranchInfo {
  name: string;
  parent?: string;
  tracked: boolean;
  hasRemote: boolean;
  lastCommitMessage?: string;
  lastCheckoutTime?: Date;
}

export interface PRInfo {
  number: number;
  title: string;
  url: string;
  state: string;
  merged: boolean;
}

export interface StackBranch {
  name: string;
  parent: string;
  pr?: PRInfo;
  isCurrent: boolean;
}

export type StagingChoice = 'all' | 'select' | 'cancel';
