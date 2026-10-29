type AttendanceCounts = {
  missingReportDays: number;
  before1030Count: number;
  after1030Count: number;
};

/** Missing reports come first, followed by normal rows and then backfilled rows. */
export function sortR02Attendance<T extends AttendanceCounts>(rows: readonly T[]): T[] {
  const category = (row: T) => row.missingReportDays > 0 ? 0 :
    row.before1030Count > 0 || row.after1030Count > 0 ? 2 : 1;
  return rows.map((row, index) => ({ row, index })).sort((a, b) => {
    const groupDiff = category(a.row) - category(b.row);
    if (groupDiff) return groupDiff;
    if (category(a.row) === 0) {
      const missingDiff = b.row.missingReportDays - a.row.missingReportDays;
      if (missingDiff) return missingDiff;
    }
    return a.index - b.index;
  }).map(({ row }) => row);
}
