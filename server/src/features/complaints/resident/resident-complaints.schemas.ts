import { z } from 'zod';

export const createComplaintSchema = z.object({
  title: z.string().min(1),
  possibleSolution: z.string().min(1),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH']),
});

export const updateComplaintSchema = createComplaintSchema;
