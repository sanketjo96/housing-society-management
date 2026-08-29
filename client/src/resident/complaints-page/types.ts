export type ComplaintPriority = 'LOW' | 'MEDIUM' | 'HIGH';
export type ComplaintStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'REJECTED';

export interface ComplaintListItem {
  id: string;
  title: string;
  possibleSolution: string;
  priority: ComplaintPriority;
  status: ComplaintStatus;
  createdAt: string;
  updatedAt: string;
  hasImage: boolean;
  upvoteCount: number;
  myUpvoted: boolean;
  owner: { id: string; name: string };
  flat: { wing: string; flatNumber: string };
}
