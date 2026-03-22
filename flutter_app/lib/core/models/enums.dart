/// Core enums aligned with shared/types.ts.
library;

enum TaskStatus {
  todo,
  inprogress,
  inreview,
  done,
  cancelled;

  String get label => switch (this) {
        TaskStatus.todo => 'To Do',
        TaskStatus.inprogress => 'In Progress',
        TaskStatus.inreview => 'In Review',
        TaskStatus.done => 'Done',
        TaskStatus.cancelled => 'Cancelled',
      };

  static TaskStatus fromString(String value) =>
      TaskStatus.values.firstWhere((e) => e.name == value,
          orElse: () => TaskStatus.todo);
}

enum WorkspaceMode {
  worktree,
  direct;

  static WorkspaceMode fromString(String value) =>
      WorkspaceMode.values.firstWhere((e) => e.name == value,
          orElse: () => WorkspaceMode.worktree);
}

enum ExecutionProcessStatus {
  running,
  completed,
  failed,
  killed;

  static ExecutionProcessStatus fromString(String value) =>
      ExecutionProcessStatus.values.firstWhere((e) => e.name == value,
          orElse: () => ExecutionProcessStatus.running);
}

enum ExecutionProcessRunReason {
  setupscript,
  cleanupscript,
  archivescript,
  codingagent,
  commitmessage,
  devserver;

  static ExecutionProcessRunReason fromString(String value) =>
      ExecutionProcessRunReason.values.firstWhere((e) => e.name == value,
          orElse: () => ExecutionProcessRunReason.codingagent);
}

enum DiffChangeKind {
  added,
  deleted,
  modified,
  renamed,
  copied,
  permissionChange;

  static DiffChangeKind fromString(String value) =>
      DiffChangeKind.values.firstWhere((e) => e.name == value,
          orElse: () => DiffChangeKind.modified);
}

enum MergeStatus {
  open,
  merged,
  closed,
  unknown;

  static MergeStatus fromString(String value) =>
      MergeStatus.values.firstWhere((e) => e.name == value,
          orElse: () => MergeStatus.unknown);
}

enum SearchMatchType {
  fileName,
  directoryName,
  fullPath;

  static SearchMatchType fromString(String value) => switch (value) {
        'FileName' => SearchMatchType.fileName,
        'DirectoryName' => SearchMatchType.directoryName,
        'FullPath' => SearchMatchType.fullPath,
        _ => SearchMatchType.fileName,
      };
}
