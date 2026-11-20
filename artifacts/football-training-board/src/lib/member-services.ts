import { customFetch } from "@workspace/api-client-react/custom-fetch";
import { memberMoney, type MemberContract } from "@workspace/api-zod";
export { memberMoney };
export type MemberPerson = {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  roles: string[];
  sections: string[];
  teamIds: number[];
  duties: {
    id: string;
    title: string;
    role: string;
    fromMonth: string;
    toMonth: string;
    active: boolean;
    teamIds: number[];
  }[];
};
export type MemberIndex = {
  members: MemberPerson[];
  teams: { id: number; name: string; section: string; seasonId: number }[];
  seasons: {
    id: number;
    name: string;
    startDate: string;
    endDate: string;
    isActive: boolean;
  }[];
  canFinance: boolean;
  canManageKit: boolean;
};
export type MemberProfile = {
  person: MemberPerson;
  profile: {
    revision: number;
    medicalFrom: string | null;
    medicalUntil: string | null;
    medicalDocumentId: number | null;
    notes: string;
  };
  documents: {
    id: number;
    kind: string;
    fileName: string;
    fileType: string;
    createdAt: string;
  }[];
  contracts: MemberContract[];
  canFinance: boolean;
  kitSlots: { key: string; label: string }[];
};
export type MemberDue = {
  id: number;
  userId: number;
  contractId: string;
  name: string;
  month: string;
  dueDate: string;
  amountCents: number;
  paidCents: number;
  details: {
    title: string;
    role: string;
    seasonId: number;
    compensationCents: number;
    reimbursementCents: number;
    terms: string;
    allocations: { teamId: number; amountCents: number }[];
  };
};
export type MemberReceipt = {
  id: string;
  dueId: number;
  userId: number;
  name: string;
  amountCents: number;
  paidDate: string;
  method: string;
  documentId: number | null;
  notes: string;
  month: string;
  details: MemberDue["details"];
};
export type MemberExpenses = { dues: MemberDue[]; receipts: MemberReceipt[] };
export type MemberKitLine = {
  id: number;
  userId: number;
  name: string;
  slot: string;
  itemId: number;
  itemName: string;
  size: string | null;
  quantity: number;
  status: string;
  archived: boolean;
};
export type MemberKit = {
  rows: {
    slot: string;
    itemId: number;
    itemName: string;
    size: string | null;
    quantity: number;
    revision: number;
  }[];
  requests: MemberKitLine[];
  canEdit: boolean;
};
export const memberApi = <T>(path: string, method = "GET", body?: unknown) =>
  customFetch<T>("/api/member-services" + path, {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
export const parseMemberMoney = (value: string) => {
  const normalized = value.trim().replace(/\s|€/g, "");
  if (!/^\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?$|^\d+(?:,\d{1,2})?$/.test(normalized))
    return NaN;
  return Math.round(
    Number(normalized.replaceAll(".", "").replace(",", ".")) * 100,
  );
};
export const memberAmountText = (cents: number) =>
  memberMoney(cents).replace(/\s*€/, "");
export const memberDay = (date: string | null | undefined) =>
  date ? date.slice(0, 10).split("-").reverse().join("/") : "—";
export const memberExpenseRoles = [
  "admin",
  "presidente",
  "director",
  "secretary",
];
export const memberViewRoles = [
  ...memberExpenseRoles,
  "technical_director",
  "sporting_director",
];
export const memberMethodLabels: Record<string, string> = {
  cash: "Contanti",
  card: "Carta",
  bank_transfer: "Bonifico",
  other: "Altro",
};
