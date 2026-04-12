/** Structured errors with code/message/hint */

export class RepoDatasetError extends Error {
  code: string;
  hint: string;

  constructor(code: string, message: string, hint: string) {
    super(message);
    this.name = "RepoDatasetError";
    this.code = code;
    this.hint = hint;
  }

  toJSON() {
    return { code: this.code, message: this.message, hint: this.hint };
  }
}

export const ErrorCodes = {
  GIT_NOT_FOUND: "GIT_NOT_FOUND",
  REPO_NOT_FOUND: "REPO_NOT_FOUND",
  NOT_A_GIT_REPO: "NOT_A_GIT_REPO",
  INVALID_FORMAT: "INVALID_FORMAT",
  INVALID_EXTRACTOR: "INVALID_EXTRACTOR",
  EXTRACTION_FAILED: "EXTRACTION_FAILED",
  OUTPUT_WRITE_FAILED: "OUTPUT_WRITE_FAILED",
  CLONE_FAILED: "CLONE_FAILED",
  UNKNOWN_COMMAND: "UNKNOWN_COMMAND",
} as const;
