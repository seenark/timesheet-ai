import { useQuery } from "@tanstack/react-query";
import { fetchTimesheet } from "../lib/api";

export function useTimesheet(
  orgId: string,
  year: number,
  month: number,
  userId?: string,
  projectId?: string
) {
  const monthStr = String(month).padStart(2, "0");
  const dateStart = `${year}-${monthStr}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const dateEnd = `${year}-${monthStr}-${lastDay}`;

  return useQuery({
    queryKey: [
      "timesheet",
      orgId,
      dateStart,
      dateEnd,
      userId ?? "",
      projectId ?? "",
    ],
    queryFn: () =>
      fetchTimesheet({ orgId, dateStart, dateEnd, userId, projectId }),
    enabled: !!orgId,
  });
}
