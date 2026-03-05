import { simpleGit } from "simple-git";

export async function diffBranches(repoPath: string, baseBranch: string, targetBranch: string): Promise<string> {
  const git = simpleGit(repoPath);
  return git.diff([`${baseBranch}..${targetBranch}`]);
}
