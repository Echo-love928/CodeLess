// The runner reports observed tool results. It never accepts a caller-supplied status.
export function toBuildContract({ id, taskId, versionId, exitCode, artifactDigest, createdAt, completedAt }) {
  if (![id, taskId, versionId, createdAt].every((value) => typeof value === 'string' && value.length > 0)) {
    throw new Error('build identity and createdAt are required');
  }
  if (exitCode !== null && (!Number.isInteger(exitCode) || exitCode < 0)) {
    throw new Error('exitCode must be null or a nonnegative integer observed from a tool');
  }
  const build = { id, taskId, versionId, status: 'RUNNING', exitCode, createdAt };
  if (exitCode === null) {
    if (artifactDigest !== undefined || completedAt !== undefined) {
      throw new Error('unfinished build cannot have an artifact or completion time');
    }
    return build;
  }
  if (!completedAt) throw new Error('completedAt is required after a tool exits');
  build.completedAt = completedAt;
  if (exitCode === 0) {
    if (!/^sha256:[a-f0-9]{64}$/.test(artifactDigest ?? '')) {
      throw new Error('successful build requires a sha256 artifact digest');
    }
    build.status = 'SUCCEEDED';
    build.artifactDigest = artifactDigest;
  } else {
    if (artifactDigest !== undefined) throw new Error('failed build cannot publish an artifact');
    build.status = 'FAILED';
  }
  return build;
}
