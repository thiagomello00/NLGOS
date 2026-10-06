/**
 * Human personnel that run departments. Panel-only data (NOT graph nodes).
 * Co-founders live on the org chart, not as department heads. Add a person
 * here only when a real human lead is hired into that department.
 */
export type Personnel = { id: string; name: string; role: string; departmentId: string };

export const DEPARTMENT_HEADS: Record<string, { name: string; role: string }> = {};

export function headForDepartment(departmentId: string): Personnel | null {
  const h = DEPARTMENT_HEADS[departmentId];
  return h ? { id: `head:${departmentId}`, name: h.name, role: h.role, departmentId } : null;
}
